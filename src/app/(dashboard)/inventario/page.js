import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCachedCategories } from '@/lib/cached-data';
import InventoryClient from '@/components/InventoryClient';

export const dynamic = 'force-dynamic';

const VALID_STATUS = new Set(['all', 'sin_stock', 'bajo_minimo', 'critico', 'saludable', 'sin_movimiento']);

export default async function InventarioPage({ searchParams }) {
  const profile = await getCurrentProfile();
  // Solo admin/supervisor manejan inventario
  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor')) {
    redirect('/dashboard');
  }

  const supabase = createClient();

  const [forecastRes, categories, suppliersRes, expiryRes] = await Promise.all([
    supabase.from('v_inventory_forecast').select('*').order('name'),
    getCachedCategories(),
    supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
    // Productos con tracking de vencimiento y su próximo lote por vencer
    supabase.from('v_products_expiry_status').select('*'),
  ]);

  // Indexar estado de vencimiento por product_id para que InventoryClient
  // pueda mostrar el badge sin consultar otra vez. Si la migración 019 no
  // está aplicada, la query falla y simplemente no hay badge.
  const expiryByProduct = new Map();
  if (!expiryRes.error && Array.isArray(expiryRes.data)) {
    for (const e of expiryRes.data) expiryByProduct.set(e.product_id, e);
  }
  const itemsWithExpiry = (forecastRes.data || []).map((it) => ({
    ...it,
    expiry: expiryByProduct.get(it.product_id) || null,
  }));

  const requestedStatus = searchParams?.status;
  const initialStatus = VALID_STATUS.has(requestedStatus) ? requestedStatus : 'all';

  return (
    <InventoryClient
      initialItems={itemsWithExpiry}
      categories={categories || []}
      suppliers={suppliersRes.data || []}
      role={profile.role}
      initialStatusFilter={initialStatus}
    />
  );
}
