import { createClient } from '@/lib/supabase/server';
import RatesClient from '@/components/RatesClient';
import { getCurrentProfile } from '@/lib/auth';
import { ensureFreshRates } from './actions';

export const dynamic = 'force-dynamic';

export default async function RatesPage() {
  const supabase = createClient();

  // Si la última tasa es de hace más de 60 minutos, refresca en segundo plano.
  // Esto da una experiencia "casi en tiempo real" sin depender solo del cron diario.
  await ensureFreshRates(60);

  const [profile, ratesRes] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from('exchange_rates')
      .select('*')
      .order('rate_date', { ascending: false })
      .limit(30),
  ]);

  return <RatesClient initialRates={ratesRes.data || []} role={profile?.role || 'cajero'} />;
}
