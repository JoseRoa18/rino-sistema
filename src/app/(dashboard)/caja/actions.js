'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

/**
 * Devuelve el resumen calculado de un día (preview, sin guardar).
 * Útil para mostrar antes de confirmar el cierre.
 */
export async function getDailySummaryAction(date) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    return { ok: false, error: 'Sin permisos' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('daily_summary', { p_date: date });
  if (error) return { ok: false, error: error.message };
  return { ok: true, summary: data };
}

/**
 * Cierra el día: guarda el snapshot.
 */
export async function closeDayAction({ date, notes }) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    return { ok: false, error: 'Sin permisos para cerrar el día' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('register_daily_close', {
    p_date: date,
    p_notes: notes || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/caja');
  revalidatePath('/dashboard');
  return { ok: true, ...(data || {}) };
}

/**
 * Reabrir un cierre — solo admin.
 */
export async function reopenDayAction(date) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };
  if (profile.role !== 'admin') {
    return { ok: false, error: 'Solo admin puede reabrir un cierre' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('reopen_daily_close', { p_date: date });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/caja');
  return { ok: true, ...(data || {}) };
}
