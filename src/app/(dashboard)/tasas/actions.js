'use server';

import { revalidateTag, revalidatePath } from 'next/cache';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllRates } from '@/lib/exchange-rates';

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

  if (!rates.usd_ves_paralelo && !rates.usd_ves_bcv && !rates.usd_cop) {
    return {
      ok: false,
      error: 'No se pudo obtener ninguna tasa. Las fuentes externas pueden estar caídas.',
    };
  }

  const service = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await service
    .from('exchange_rates')
    .upsert(
      {
        rate_date: today,
        usd_ves_paralelo: rates.usd_ves_paralelo,
        usd_ves_bcv: rates.usd_ves_bcv,
        usd_ves_binance: rates.usd_ves_binance,
        usd_cop: rates.usd_cop,
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

  return {
    ok: true,
    rates: data,
    fetched_at: rates.fetched_at,
  };
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

  if (!rates.usd_ves_paralelo && !rates.usd_ves_bcv && !rates.usd_cop) {
    return { refreshed: false, error: 'fuentes no disponibles' };
  }

  const today = new Date().toISOString().slice(0, 10);
  await service
    .from('exchange_rates')
    .upsert(
      {
        rate_date: today,
        usd_ves_paralelo: rates.usd_ves_paralelo,
        usd_ves_bcv: rates.usd_ves_bcv,
        usd_ves_binance: rates.usd_ves_binance,
        usd_cop: rates.usd_cop,
        source: 'auto',
      },
      { onConflict: 'rate_date' }
    );

  revalidateTag('rates');
  return { refreshed: true };
}
