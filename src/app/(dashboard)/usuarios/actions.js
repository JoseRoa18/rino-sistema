'use server';

import { revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

const ALLOWED_ROLES = ['admin', 'supervisor', 'cajero'];

async function requireAdminOrSupervisor() {
  const me = await getCurrentProfile();
  if (!me) return { error: 'No autenticado' };
  if (me.role !== 'admin' && me.role !== 'supervisor') {
    return { error: 'Sin permisos para gestionar usuarios' };
  }
  return { me };
}

/**
 * Crea un usuario nuevo en Supabase Auth + su fila en profiles.
 *
 * Reglas:
 *   - admin puede crear cualquier rol
 *   - supervisor puede crear supervisor o cajero, NO admin
 */
export async function createUserAction({ email, password, full_name, role }) {
  const guard = await requireAdminOrSupervisor();
  if (guard.error) return { ok: false, error: guard.error };

  if (!email || !password || !full_name) {
    return { ok: false, error: 'Email, contraseña y nombre son obligatorios' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' };
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: 'Rol inválido' };
  }
  if (guard.me.role === 'supervisor' && role === 'admin') {
    return { ok: false, error: 'Solo admin puede crear usuarios con rol admin' };
  }

  const admin = createServiceClient();

  // 1) Crear en auth.users con email confirmado (no espera verificación)
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr) return { ok: false, error: authErr.message };

  // 2) Crear/upsert fila en profiles (puede que un trigger ya la haya creado)
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
    // Rollback: borrar el usuario auth si falla la creación del profile
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profErr.message };
  }

  // 3) Auditoría
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
 *
 * Reglas:
 *   - supervisor NO puede modificar admins
 *   - supervisor NO puede asignar rol admin
 *   - nadie puede modificarse a sí mismo (para evitar lockouts)
 */
export async function updateUserAction({ userId, role, active, full_name }) {
  const guard = await requireAdminOrSupervisor();
  if (guard.error) return { ok: false, error: guard.error };

  if (userId === guard.me.id) {
    return { ok: false, error: 'No puedes modificar tu propio usuario desde esta pantalla' };
  }
  if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
    return { ok: false, error: 'Rol inválido' };
  }

  const admin = createServiceClient();
  const { data: target, error: tErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (tErr || !target) return { ok: false, error: 'Usuario no encontrado' };

  // Restricciones para supervisor
  if (guard.me.role === 'supervisor') {
    if (target.role === 'admin') {
      return { ok: false, error: 'Supervisor no puede modificar usuarios admin' };
    }
    if (role === 'admin') {
      return { ok: false, error: 'Solo admin puede asignar rol admin' };
    }
  }

  const update = {};
  if (role !== undefined) update.role = role;
  if (active !== undefined) update.active = active;
  if (full_name !== undefined) update.full_name = String(full_name).trim();
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nada que actualizar' };

  const { error: upErr } = await admin.from('profiles').update(update).eq('id', userId);
  if (upErr) return { ok: false, error: upErr.message };

  // Auditoría
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
 * Cambia la contraseña de un usuario directamente (admin override).
 * El admin/supervisor le entrega la nueva contraseña al empleado.
 *
 * Reglas:
 *   - supervisor NO puede cambiar contraseña de admin
 */
export async function setUserPasswordAction({ userId, newPassword }) {
  const guard = await requireAdminOrSupervisor();
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

  if (guard.me.role === 'supervisor' && target.role === 'admin') {
    return { ok: false, error: 'Supervisor no puede cambiar contraseña de admin' };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, error: error.message };

  // Auditoría (NO guardamos la contraseña, solo el evento)
  await admin.from('audit_log').insert({
    user_id: guard.me.id,
    action: 'reset_password',
    entity_type: 'profile',
    entity_id: userId,
    details: { email: target.email },
  });

  return { ok: true };
}
