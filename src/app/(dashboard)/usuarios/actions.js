'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

// El sistema sólo distingue admin y cajero. La gestión de usuarios es
// exclusiva del administrador.
const ALLOWED_ROLES = ['admin', 'cajero'];

async function requireAdmin() {
  const me = await getCurrentProfile();
  if (!me) return { error: 'No autenticado' };
  if (me.role !== 'admin') {
    return { error: 'Solo el administrador puede gestionar usuarios' };
  }
  return { me };
}

/**
 * Crea un usuario nuevo en Supabase Auth + su fila en profiles.
 */
export async function createUserAction({ email, password, full_name, role }) {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };

  if (!email || !password || !full_name) {
    return { ok: false, error: 'Email, contraseña y nombre son obligatorios' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: 'Rol inválido. Sólo admin o cajero.' };
  }

  const admin = createServiceClient();

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr) return { ok: false, error: authErr.message };

  const { error: profErr } = await admin
    .from('profiles')
    .upsert({
      id: created.user.id,
      email: email.trim().toLowerCase(),
      full_name: full_name.trim(),
      role,
      active: true,
    }, { onConflict: 'id' });

  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profErr.message };
  }

  await admin.from('audit_log').insert({
    user_id: guard.me.id,
    action: 'create_user',
    entity_type: 'profile',
    entity_id: created.user.id,
    details: { email, role, full_name },
  });

  revalidatePath('/usuarios');
  return { ok: true, userId: created.user.id };
}

/**
 * Actualiza rol, nombre o estado activo de un usuario.
 */
export async function updateUserAction({ userId, role, active, full_name }) {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };

  if (userId === guard.me.id) {
    return { ok: false, error: 'No puedes modificar tu propio usuario desde esta pantalla' };
  }
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: 'Rol inválido. Sólo admin o cajero.' };
  }

  const admin = createServiceClient();
  const { data: target, error: tErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (tErr || !target) return { ok: false, error: 'Usuario no encontrado' };

  const update = {};
  if (role !== undefined) update.role = role;
  if (active !== undefined) update.active = active;
  if (full_name !== undefined) update.full_name = String(full_name).trim();
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nada que actualizar' };

  const { error: upErr } = await admin.from('profiles').update(update).eq('id', userId);
  if (upErr) return { ok: false, error: upErr.message };

  await admin.from('audit_log').insert({
    user_id: guard.me.id,
    action: 'update_user',
    entity_type: 'profile',
    entity_id: userId,
    details: update,
  });

  revalidatePath('/usuarios');
  return { ok: true };
}

/**
 * Cambia la contraseña de un usuario directamente.
 */
export async function setUserPasswordAction({ userId, newPassword }) {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };

  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  }

  const admin = createServiceClient();
  const { data: target, error: tErr } = await admin
    .from('profiles')
    .select('role, email')
    .eq('id', userId)
    .single();
  if (tErr || !target) return { ok: false, error: 'Usuario no encontrado' };

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, error: error.message };

  await admin.from('audit_log').insert({
    user_id: guard.me.id,
    action: 'reset_password',
    entity_type: 'profile',
    entity_id: userId,
    details: { email: target.email },
  });

  return { ok: true };
}

/**
 * Elimina un usuario. Borra primero de auth.users (lo que cascadea
 * borrado del profile vía FK). Si el usuario tiene ventas, créditos o
 * cualquier registro asociado, el FK lo bloquea y devolvemos un error
 * sugerente: en ese caso se hace soft delete (active = false).
 *
 * Sólo el administrador puede ejecutar esta acción.
 */
export async function deleteUserAction({ userId }) {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };

  if (userId === guard.me.id) {
    return { ok: false, error: 'No puedes eliminarte a ti mismo' };
  }

  const admin = createServiceClient();
  const { data: target, error: tErr } = await admin
    .from('profiles')
    .select('email, full_name, role')
    .eq('id', userId)
    .single();
  if (tErr || !target) return { ok: false, error: 'Usuario no encontrado' };

  // 1) Intentar hard delete (a través de auth.users, cascade a profile)
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);

  if (delErr) {
    // 2) Si falla por FK (tiene ventas asociadas, etc.), hacer soft delete
    const isFkError =
      String(delErr.message || '').toLowerCase().includes('foreign key') ||
      delErr.code === '23503';

    if (isFkError) {
      const { error: deactErr } = await admin
        .from('profiles')
        .update({ active: false })
        .eq('id', userId);
      if (deactErr) return { ok: false, error: deactErr.message };

      await admin.from('audit_log').insert({
        user_id: guard.me.id,
        action: 'deactivate_user',
        entity_type: 'profile',
        entity_id: userId,
        details: {
          email: target.email,
          reason: 'tiene registros asociados (ventas/créditos), se desactivó en su lugar',
        },
      });

      revalidatePath('/usuarios');
      return {
        ok: true,
        softDeleted: true,
        message: `${target.full_name} tiene ventas o registros asociados; se desactivó en lugar de eliminarse.`,
      };
    }
    return { ok: false, error: delErr.message };
  }

  await admin.from('audit_log').insert({
    user_id: guard.me.id,
    action: 'delete_user',
    entity_type: 'profile',
    entity_id: userId,
    details: { email: target.email, full_name: target.full_name, role: target.role },
  });

  revalidatePath('/usuarios');
  return { ok: true, softDeleted: false };
}
