import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import CustomersClient from '@/components/CustomersClient';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const supabase = createClient();

  const [customersRes, kpisRes] = await Promise.all([
    supabase.from('v_customer_stats').select('*').order('name'),
    supabase.from('v_customers_kpis').select('*').single(),
  ]);

  return (
    <CustomersClient
      initialCustomers={customersRes.data || []}
      initialKpis={kpisRes.data || {}}
      role={profile.role}
    />
  );
}