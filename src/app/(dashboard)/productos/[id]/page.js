import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import ProductDetailClient from '@/components/ProductDetailClient';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }) {
  if (!UUID_REGEX.test(params.id)) return { title: 'Producto · Sistema Rino' };

  const supabase = createClient();
  const { data } = await supabase
    .from('products')
    .select('name')
    .eq('id', params.id)
    .maybeSingle();

  return { title: data ? `${data.name} · Sistema Rino` : 'Producto · Sistema Rino' };
}

export default async function ProductDetailPage({ params }) {
  if (!UUID_REGEX.test(params.id)) notFound();

  const supabase = createClient();
  const profile = await getCurrentProfile();
  const role = profile?.role || 'cajero';
  const showCosts = role === 'admin' || role === 'supervisor';

  // Producto + categoría
  const { data: product, error: productError } = await supabase
    .from('products')
    .select(`
      id, sku, name, description, stock, min_stock, unit, active,
      price_usd, price_ves, price_cop, cost_avg, cost_currency,
      target_margin, created_at, updated_at,
      categories ( id, name )
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (productError || !product) notFound();

  // Ventana de tiempo: últimos 12 meses para alimentar gráfico + tablas
  const sinceISO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  // Promesas en paralelo
  const queries = [
    // Historial de ventas — sale_items con datos de la venta y cajero
    supabase
      .from('sale_items')
      .select(`
        id, quantity, unit_price_usd, unit_cost_usd, line_total_usd, created_at,
        sales!inner (
          id, invoice_number, status, created_at,
          profiles:cashier_id ( full_name )
        )
      `)
      .eq('product_id', params.id)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(200),
  ];

  // Compras y kardex sólo para roles que ven costos
  if (showCosts) {
    queries.push(
      supabase
        .from('purchase_items')
        .select(`
          id, quantity, unit_cost_usd, line_total_usd, created_at,
          purchases (
            id, reference, purchase_date,
            suppliers ( id, name )
          )
        `)
        .eq('product_id', params.id)
        .gte('created_at', sinceISO)
        .order('created_at', { ascending: false })
        .limit(100),

      supabase
        .from('inventory_movements')
        .select('id, movement_type, quantity, balance_after, unit_cost_usd, reference_type, reference_id, notes, created_at')
        .eq('product_id', params.id)
        .order('created_at', { ascending: false })
        .limit(100),
    );
  }

  const results = await Promise.all(queries);
  const saleItems = results[0]?.data || [];
  const purchaseItems = showCosts ? results[1]?.data || [] : [];
  const movements = showCosts ? results[2]?.data || [] : [];

  return (
    <ProductDetailClient
      product={product}
      saleItems={saleItems}
      purchaseItems={purchaseItems}
      movements={movements}
      role={role}
    />
  );
}
