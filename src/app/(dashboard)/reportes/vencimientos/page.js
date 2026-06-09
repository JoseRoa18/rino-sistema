import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import ExpiryReport from '@/components/reports/ExpiryReport';

export const dynamic = 'force-dynamic';

export default async function ReporteVencimientosPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('v_batches_alerts')
    .select('*');

  return (
    <ExpiryReport
      batches={data || []}
      error={error?.message || null}
    />
  );
}
