import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import PortfolioReport from '@/components/reports/PortfolioReport';

export const dynamic = 'force-dynamic';

export default async function ReporteCarteraPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();

  const [customerStats, supplierStats, customerKpis, supplierKpis, openCredits, openSupplierCredits] = await Promise.all([
    supabase.from('v_customer_stats').select('*'),
    supabase.from('v_supplier_stats').select('*'),
    supabase.from('v_customers_kpis').select('*').maybeSingle(),
    supabase.from('v_suppliers_kpis').select('*').maybeSingle(),
    supabase
      .from('credits')
      .select(`
        id, customer_id, sale_id,
        original_amount_usd, paid_amount_usd, balance_usd,
        due_date, created_at,
        customers ( name, document_id, phone ),
        sales ( invoice_number )
      `)
      .eq('status', 'abierto')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('supplier_credits')
      .select(`
        id, supplier_id, purchase_id,
        original_amount_usd, paid_amount_usd, balance_usd,
        due_date, created_at,
        suppliers ( name, contact_name, phone )
      `)
      .eq('status', 'abierto')
      .order('due_date', { ascending: true, nullsFirst: false }),
  ]);

  const firstError = [
    customerStats, supplierStats, customerKpis, supplierKpis,
    openCredits, openSupplierCredits,
  ].find((r) => r && r.error)?.error?.message || null;

  return (
    <PortfolioReport
      customerStats={customerStats.data || []}
      supplierStats={supplierStats.data || []}
      customerKpis={customerKpis.data || {}}
      supplierKpis={supplierKpis.data || {}}
      openCredits={openCredits.data || []}
      openSupplierCredits={openSupplierCredits.data || []}
      error={firstError}
    />
  );
}
