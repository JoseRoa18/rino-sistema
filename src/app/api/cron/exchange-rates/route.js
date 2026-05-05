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
import { createServiceClient } from '@/lib/supabase/server';
import { revalidateTag } from 'next/cache';

export const dynamic = 'force-dynamic';

async function handler(request) {
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rates = await fetchAllRates();

  if (!rates.usd_ves_paralelo && !rates.usd_ves_bcv && !rates.usd_cop) {
    return NextResponse.json(
      { ok: false, error: 'Todas las fuentes externas fallaron', rates },
      { status: 502 }
    );
  }

  const supabase = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('exchange_rates')
    .upsert(
      {
        rate_date: today,
        usd_ves_paralelo: rates.usd_ves_paralelo,
        usd_ves_bcv: rates.usd_ves_bcv,
        usd_ves_binance: rates.usd_ves_binance,
        usd_cop: rates.usd_cop,
        source: 'cron',
      },
      { onConflict: 'rate_date' }
    )
    .select()
    .single();

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
