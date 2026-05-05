import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCachedLatestRate } from '@/lib/cached-data';
import CreditsClient from '@/components/CreditsClient';

export const dynamic = 'force-dynamic';

export default async function CreditosPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // Solo admin/supervisor pueden ver la cartera de créditos del negocio
  if (profile.role === 'cajero') redirect('/pos');

  const supabase = createClient();

  const [creditsRes, rate] = await Promise.all([
    supabase
      .from('credits')
      .select(`
        id, customer_id, sale_id,
        original_amount_usd, paid_amount_usd, balance_usd,
        due_date, status, created_at, notes,
        customers ( id, name, document_id, phone, customer_type ),
        sales ( id, invoice_number, total_usd, created_at, payment_method )
      `)
      .order('created_at', { ascending: false }),
    getCachedLatestRate(),
  ]);

  if (creditsRes.error) {
    return (
      <div className="card p-6 text-center text-rose-600 dark:text-rose-400">
        Error cargando créditos: {creditsRes.error.message}
      </div>
    );
  }

  return (
    <CreditsClient
      initialCredits={creditsRes.data || []}
      rate={rate || {}}
      role={profile.role}
    />
  );
}
