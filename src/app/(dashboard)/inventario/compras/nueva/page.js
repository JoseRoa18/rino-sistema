import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { getCachedLatestRate } from '@/lib/cached-data';
import PurchaseClient from '@/components/PurchaseClient';

export const dynamic = 'force-dynamic';

export default async function NewPurchasePage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'supervisor')) {
    redirect('/dashboard');
  }

  const supabase = createClient();
  const [productsRes, suppliersRes, rate] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, sku, cost_avg, cost_avg_cop, stock, unit, category_id, active, tracks_expiry')
      .eq('active', true)
      .order('name'),
    supabase.from('suppliers').select('id, name, contact_name').eq('active', true).order('name'),
    getCachedLatestRate(),
  ]);

  return (
    <PurchaseClient
      products={productsRes.data || []}
      suppliers={suppliersRes.data || []}
      rate={rate || {}}
    />
  );
}
