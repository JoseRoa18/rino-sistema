import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import ReportsHub from '@/components/reports/ReportsHub';
import { nDaysAgoStr, todayStr, monthStartStr } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ReportesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();
  const from30  = nDaysAgoStr(29);
  const today   = todayStr();
  const monthStart = monthStartStr();

  // Lanzamos todo en paralelo
  const [
    salesKpis,
    customerKpis,
    supplierKpis,
    salesDaily,       // ventas por día (últimos 30) para sparklines y mini-chart
    pnlDailyMonth,    // P&L del mes para detectar mejor/peor día
    topProductsMonth, // top productos del mes
    topCashiersMonth, // top cajeros del mes
    overdueCustomers, // clientes con deuda vencida (alerta)
    overdueSuppliers, // proveedores con deuda vencida (alerta)
    lowStock,         // productos bajo mínimo (alerta)
    recentSales,      // últimas 5 ventas
  ] = await Promise.all([
    supabase.from('v_dashboard_kpis').select('*').maybeSingle(),
    supabase.from('v_customers_kpis').select('*').maybeSingle(),
    supabase.from('v_suppliers_kpis').select('*').maybeSingle(),
    supabase.from('v_sales_daily').select('*').order('day'),
    supabase.from('v_pnl_daily').select('*').gte('day', monthStart).lte('day', today).order('day'),
    supabase
      .from('v_product_profitability')
      .select('product_id, name, sku, category_name, units_sold, revenue_usd, profit_usd, margin_pct')
      .gt('units_sold', 0)
      .order('revenue_usd', { ascending: false })
      .limit(5),
    supabase
      .from('v_sales_by_cashier')
      .select('*')
      .gte('day', monthStart)
      .lte('day', today),
    supabase
      .from('v_customer_stats')
      .select('customer_id, name, ar_balance_usd, overdue_balance_usd, overdue_count')
      .gt('overdue_balance_usd', 0)
      .order('overdue_balance_usd', { ascending: false })
      .limit(5),
    supabase
      .from('v_supplier_stats')
      .select('supplier_id, name, ap_balance_usd, overdue_balance_usd, overdue_count')
      .gt('overdue_balance_usd', 0)
      .order('overdue_balance_usd', { ascending: false })
      .limit(5),
    supabase
      .from('v_inventory_valuation')
      .select('product_id, name, sku, category_name, stock, min_stock, cost_avg')
      .eq('is_low_stock', true)
      .eq('active', true)
      .order('name')
      .limit(8),
    supabase
      .from('sales')
      .select(`
        id, invoice_number, total_usd, payment_method, status, created_at,
        profiles:cashier_id ( full_name ),
        customers ( name )
      `)
      .eq('status', 'completada')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // Agregar top cajeros del mes en JS (sumando por cashier_id)
  const cashierAgg = new Map();
  for (const r of topCashiersMonth.data || []) {
    const key = r.cashier_id;
    if (!key) continue;
    const cur = cashierAgg.get(key) || {
      cashier_id: r.cashier_id,
      cashier_name: r.cashier_name || 'Sin nombre',
      tx_count: 0,
      total_usd: 0,
    };
    cur.tx_count  += Number(r.tx_count || 0);
    cur.total_usd += Number(r.total_usd || 0);
    cashierAgg.set(key, cur);
  }
  const topCashiers = Array.from(cashierAgg.values())
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, 5);

  return (
    <ReportsHub
      stats={{
        sales:     salesKpis.data    || {},
        customers: customerKpis.data || {},
        suppliers: supplierKpis.data || {},
      }}
      salesDaily={salesDaily.data || []}
      pnlMonth={pnlDailyMonth.data || []}
      topProducts={topProductsMonth.data || []}
      topCashiers={topCashiers}
      overdueCustomers={overdueCustomers.data || []}
      overdueSuppliers={overdueSuppliers.data || []}
      lowStock={lowStock.data || []}
      recentSales={recentSales.data || []}
    />
  );
}
