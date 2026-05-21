import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import ProductsReport from '@/components/reports/ProductsReport';

export const dynamic = 'force-dynamic';

export default async function ReporteProductosPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();

  // Toda la vista de rentabilidad (incluye productos sin ventas → null en sold_at)
  const { data, error } = await supabase
    .from('v_product_profitability')
    .select('*')
    .order('revenue_usd', { ascending: false });

  return <ProductsReport rows={data || []} error={error?.message || null} />;
}
