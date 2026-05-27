import { createClient } from '@/lib/supabase/server';
import POSInterface from '@/components/pos/POSInterface';
import { getCachedCategories, getCachedLatestRate } from '@/lib/cached-data';
import { getCurrentProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function POSPage() {
  const supabase = createClient();
  const profile = await getCurrentProfile();

  // Productos completos para búsqueda + más vendidos para acceso rápido.
  // Categorías y tasa vienen de cache (5-10 min) - casi instantáneo.
  // Productos y clientes son frescos cada vez (stock cambia).
  const [productsRes, variantsRes, bestSellersRes, categories, rate, customersRes] = await Promise.all([
    supabase.from('products').select('*').eq('active', true).order('name'),
    // Variants en query separada para que un fallo (tabla no creada aún) no
    // tumbe la carga de productos.
    supabase
      .from('product_variants')
      .select('id, product_id, name, base_quantity, price_usd, price_cop, price_ves, sort_order, active')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('v_top_sold_products').select('*'),
    getCachedCategories(),
    getCachedLatestRate(),
    supabase
      .from('customers')
      .select('id, name, is_internal')
      .eq('active', true)
      .order('name'),
  ]);

  // Mapear variants por product_id (vacío si la tabla aún no existe)
  const variantsByProduct = new Map();
  if (!variantsRes.error && Array.isArray(variantsRes.data)) {
    for (const v of variantsRes.data) {
      if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
      variantsByProduct.get(v.product_id).push(v);
    }
  }

  const products = (productsRes.data || []).map((p) => ({
    ...p,
    variants: variantsByProduct.get(p.id) || [],
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Punto de Venta</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Registra ventas rápidas y precisas</p>
      </div>
      <POSInterface
        initialProducts={products}
        initialBestSellers={bestSellersRes.data || []}
        initialCategories={categories || []}
        initialRates={rate || {}}
        initialCustomers={customersRes.data || []}
        role={profile?.role || 'cajero'}
      />
    </div>
  );
}