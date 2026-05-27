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

  const [forecastRes, categories, suppliersRes] = await Promise.all([
    supabase.from('v_inventory_forecast').select('*').order('name'),
    getCachedCategories(),
    supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
  ]);

  const requestedStatus = searchParams?.status;
  const initialStatus = VALID_STATUS.has(requestedStatus) ? requestedStatus : 'all';

  return (
    <InventoryClient
      initialItems={forecastRes.data || []}
      categories={categories || []}
      suppliers={suppliersRes.data || []}
      role={profile.role}
      initialStatusFilter={initialStatus}
    />
  );
}
