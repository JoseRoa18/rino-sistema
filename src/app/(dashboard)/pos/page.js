import { createClient } from '@/lib/supabase/server';
import POSInterface from '@/components/pos/POSInterface';
import { getCachedCategories, getCachedLatestRate } from '@/lib/cached-data';

export const dynamic = 'force-dynamic';

export default async function POSPage() {
  const supabase = createClient();

  // Productos completos para búsqueda + más vendidos para acceso rápido.
  // Categorías y tasa vienen de cache (5-10 min) - casi instantáneo.
  // Productos y clientes son frescos cada vez (stock cambia).
  const [productsRes, bestSellersRes, categories, rate, customersRes] = await Promise.all([
    supabase.from('products').select('*').eq('active', true).order('name'),
    supabase.from('v_top_sold_products').select('*'),
    getCachedCategories(),
    getCachedLatestRate(),
    supabase.from('customers').select('id, name').eq('active', true).order('name'),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Punto de Venta</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Registra ventas rápidas y precisas</p>
      </div>
      <POSInterface
        initialProducts={productsRes.data || []}
        initialBestSellers={bestSellersRes.data || []}
        initialCategories={categories || []}
        initialRates={rate || {}}
        initialCustomers={customersRes.data || []}
      />
    </div>
  );
}