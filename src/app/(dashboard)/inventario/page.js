import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCachedCategories } from '@/lib/cached-data';
import InventoryClient from '@/components/InventoryClient';

export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
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

  return (
    <InventoryClient
      initialItems={forecastRes.data || []}
      categories={categories || []}
      suppliers={suppliersRes.data || []}
      role={profile.role}
    />
  );
}
