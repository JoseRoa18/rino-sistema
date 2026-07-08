/**
 * Cron diario de tasas cambiarias.
 *
 * Vercel lo invoca a las 7:00 AM hora local (configurado en vercel.json).
 * En el plan Hobby es la única forma automática (Hobby = 1 ejecución diaria).
 *
 * Para refrescos más frecuentes, el sistema también:
 *   - Llama ensureFreshRates() cuando admin abre /dashboard o /tasas
 *   - Permite refresh manual desde el botón en /tasas
 *
 * Fuente: DolarApi.com (open source, sin API key).
 */

import { NextResponse } from 'next/server';
import { fetchAllRates } from '@/lib/exchange-rates';
import { upsertAutoRates } from '@/lib/rates-write';
import { createServiceClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';
import { todayStr } from '@/lib/dates';

export const dynamic = 'force-dynamic';

async function handler(request) {
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rates = await fetchAllRates();

  if (!rates.usd_ves_paralelo && !rates.usd_ves_bcv && !rates.usd_cop_trm) {
    return NextResponse.json(
      { ok: false, error: 'Todas las fuentes externas fallaron', rates },
      { status: 502 }
    );
  }

  const supabase = createServiceClient();
  const today = todayStr();

  // usd_cop es MANUAL (moneda base): no lo pisamos, solo actualizamos paralelo,
  // BCV y el TRM de referencia, conservando/heredando la tasa manual del peso.
  const { data, error } = await upsertAutoRates(supabase, today, rates, 'cron');

  if (error) {
    return NextResponse.json({ error: error.message, rates }, { status: 500 });
  }

  revalidateTag('rates');

  return NextResponse.json({
    ok: true,
    rates: data,
    source_updated_at: rates.source_updated_at,
  });
}

export const GET = handler;
export const POST = handler;
