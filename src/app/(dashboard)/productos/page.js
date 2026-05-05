import { createClient } from '@/lib/supabase/server';
import ProductsClient from '@/components/ProductsClient';
import { getCurrentProfile } from '@/lib/auth';
import { getCachedCategories, getCachedLatestRate } from '@/lib/cached-data';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const supabase = createClient();

  const [profile, productsRes, categories, currentRate] = await Promise.all([
    getCurrentProfile(),
    supabase.from('products').select('*').order('name'),
    getCachedCategories(),
    getCachedLatestRate(),
  ]);

  return (
    <ProductsClient
      initialProducts={productsRes.data || []}
      categories={categories || []}
      role={profile?.role || 'cajero'}
      currentRates={currentRate || {}}
    />
  );
}
