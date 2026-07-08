'use server';

import { revalidateTag, revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllRates } from '@/lib/exchange-rates';
import { upsertAutoRates } from '@/lib/rates-write';
import { todayStr } from '@/lib/dates';

/**
 * Refresca las tasas desde las fuentes externas y las guarda en BD.
 * Solo admins pueden invocarla. Invalida los caches relevantes.
 */
export async function refreshRatesAction() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { ok: false, error: 'Solo administradores pueden actualizar tasas' };
  }

  const rates = await fetchAllRates();

  if (!rates.usd_ves_paralelo && !rates.usd_ves_bcv && !rates.usd_cop_trm) {
    return {
      ok: false,
      error: 'No se pudo obtener ninguna tasa. Las fuentes externas pueden estar caídas.',
    };
  }

  const service = createServiceClient();
  const today = todayStr();

  // No pisamos usd_cop (tasa manual): solo actualizamos paralelo, BCV y el TRM
  // de referencia, conservando/heredando la tasa manual del peso.
  const { data, error } = await upsertAutoRates(service, today, rates, 'manual');

  if (error) return { ok: false, error: error.message };

  revalidateTag('rates');
  revalidatePath('/tasas');
  revalidatePath('/dashboard');
  revalidatePath('/pos');

  return {
    ok: true,
    rates: data,
    fetched_at: rates.fetched_at,
  };
}

// Tasas manuales editables por el admin y su descripción para mensajes de error.
const MANUAL_RATE_FIELDS = {
  rino_cop_ves: 'la tasa personalizada Rino (COP→Bs)',
  usd_cop:      'la tasa USD/COP',
};

/**
 * Actualiza una tasa MANUAL (rino_cop_ves o usd_cop) para el día actual.
 *
 *   - rino_cop_ves → cuántos pesos colombianos equivalen a 1 bolívar
 *     (el precio final en Bs = Math.ceil(precio_cop / rino_cop_ves)).
 *   - usd_cop → cuántos pesos equivale 1 USD; el peso es la moneda base y de
 *     esta tasa se derivan los precios en USD.
 *
 * El upsert por `rate_date` solo toca la columna indicada, así que conserva
 * las demás tasas del día.
 */
export async function updateManualRateAction(field, value) {
  if (!MANUAL_RATE_FIELDS[field]) {
    return { ok: false, error: 'Tasa no editable' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { ok: false, error: `Solo administradores pueden modificar ${MANUAL_RATE_FIELDS[field]}` };
  }

  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: 'Tasa inválida — debe ser un número mayor a cero' };
  }

  const service = createServiceClient();
  const today = todayStr();

  const { data, error } = await service
    .from('exchange_rates')
    .upsert(
      {
        rate_date: today,
        [field]: rate,
        source: 'manual',
      },
      { onConflict: 'rate_date' }
    )
    .select()
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateTag('rates');
  revalidatePath('/tasas');
  revalidatePath('/dashboard');
  revalidatePath('/pos');

  return { ok: true, rates: data };
}

/**
 * Auto-refresh inteligente: si la última tasa es de hace más de N minutos,
 * la refresca antes de mostrarla. Si está fresca, no hace nada.
 */
export async function ensureFreshRates(maxAgeMinutes = 60) {
  const service = createServiceClient();

  const { data: latest } = await service
    .from('exchange_rates')
    .select('updated_at, rate_date')
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.updated_at) {
    const ageMs = Date.now() - new Date(latest.updated_at).getTime();
    const ageMin = ageMs / 60000;
    if (ageMin < maxAgeMinutes) {
      return { refreshed: false, ageMinutes: Math.round(ageMin) };
    }
  }

  const rates = await fetchAllRates();

  if (!rates.usd_ves_paralelo && !rates.usd_ves_bcv && !rates.usd_cop_trm) {
    return { refreshed: false, error: 'fuentes no disponibles' };
  }

  const today = todayStr();
  await upsertAutoRates(service, today, rates, 'auto');

  revalidateTag('rates');
  return { refreshed: true };
}
