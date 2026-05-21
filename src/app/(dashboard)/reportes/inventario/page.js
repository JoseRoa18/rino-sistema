import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import InventoryReport from '@/components/reports/InventoryReport';

export const dynamic = 'force-dynamic';

export default async function ReporteInventarioPage({ searchParams }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();

  // Producto seleccionado para kardex (opcional via ?product=)
  const productId = searchParams?.product || null;

  const [valuationRes, byCategoryRes, productsRes, kardexRes] = await Promise.all([
    supabase.from('v_inventory_valuation').select('*').order('name'),
    supabase.from('v_inventory_valuation_by_category').select('*').order('category_name'),
    supabase.from('products').select('id, name, sku').eq('active', true).order('name'),
    productId
      ? supabase
          .from('inventory_movements')
          .select(`
            id, movement_type, quantity, balance_after, unit_cost_usd,
            reference_type, reference_id, notes, created_at,
            profiles:created_by ( full_name )
          `)
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const firstError = [valuationRes, byCategoryRes, productsRes, kardexRes]
    .find((r) => r && r.error)?.error?.message || null;

  return (
    <InventoryReport
      valuation={valuationRes.data || []}
      byCategory={byCategoryRes.data || []}
      products={productsRes.data || []}
      selectedProductId={productId}
      kardex={kardexRes.data || []}
      error={firstError}
    />
  );
}
