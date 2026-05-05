import { redirect } from 'next/navigation';
import {
  DollarSign, TrendingUp, AlertTriangle, CreditCard,
  Receipt, ShoppingBag, Activity,
} from 'lucide-react';
import KPICard from '@/components/KPICard';
import SalesChart from '@/components/SalesChart';
import DashboardWidgets from '@/components/DashboardWidgets';
import PageHeader from '@/components/PageHeader';
import SectionLabel from '@/components/SectionLabel';
import { formatMoney } from '@/lib/pricing';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import { ensureFreshRates } from '../tasas/actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();

  ensureFreshRates(60).catch(() => {});

  // Cuota fija para "últimos 30 días" — usado por payment data
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profile,
    kpisRes,
    dailySalesRes,
    recentSalesRes,
    topProductsRes,
    paymentDataRes,
  ] = await Promise.all([
    getCurrentProfile(),
    supabase.from('v_dashboard_kpis').select('*').single(),
    supabase.from('v_sales_daily').select('*').order('day'),
    // FIX: usar profiles:cashier_id para desambiguar (sales tiene 2 FK a profiles
    // ahora: cashier_id y voided_by). Antes esto fallaba silenciosamente y por
    // eso "Aún no hay ventas registradas" cuando sí las había.
    supabase
      .from('sales')
      .select(`
        id, invoice_number, total_usd, payment_method, status, created_at,
        profiles:cashier_id ( full_name )
      `)
      .eq('status', 'completada')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('v_top_sold_products').select('*').limit(5),
    supabase
      .from('sales')
      .select('payment_method, total_usd')
      .eq('status', 'completada')
      .gte('created_at', thirtyDaysAgo),
  ]);

  if (profile?.role === 'cajero') redirect('/pos');

  const kpis = kpisRes.data;
  const dailySales = dailySalesRes.data;
  const recentSales = recentSalesRes.data || [];
  const topProducts = topProductsRes.data || [];
  const paymentData = paymentDataRes.data || [];

  // Calcular margen aproximado del mes (ganancia / ventas * 100)
  const marginMonthPct = kpis?.sales_month_usd > 0
    ? (Number(kpis.profit_month_usd) / Number(kpis.sales_month_usd)) * 100
    : 0;

  // Día actual (label legible para el SectionLabel)
  const todayLabel = new Date().toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Vista general del negocio" />

      {/* KPIs HOY */}
      <section>
        <SectionLabel hint={todayLabel}>Hoy</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KPICard
            label="Ventas hoy"
            value={formatMoney(kpis?.sales_today_usd)}
            hint={`${kpis?.transactions_today || 0} transacciones`}
            icon={DollarSign}
            accent="emerald"
          />
          <KPICard
            label="Ganancia hoy"
            value={formatMoney(kpis?.profit_today_usd)}
            hint="margen bruto"
            icon={TrendingUp}
            accent="brand"
          />
          <KPICard
            label="Transacciones"
            value={kpis?.transactions_today || 0}
            hint="en el día de hoy"
            icon={Activity}
            accent="violet"
          />
        </div>
      </section>

      {/* KPIs PERÍODO */}
      <section>
        <SectionLabel>Período</SectionLabel>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICard
            label="Ventas semana"
            value={formatMoney(kpis?.sales_week_usd)}
            hint="últimos 7 días"
            icon={Receipt}
            accent="violet"
          />
          <KPICard
            label="Ventas mes"
            value={formatMoney(kpis?.sales_month_usd)}
            hint="mes en curso"
            icon={ShoppingBag}
            accent="brand"
          />
          <KPICard
            label="Ganancia mes"
            value={formatMoney(kpis?.profit_month_usd)}
            hint="mes en curso"
            icon={TrendingUp}
            accent="emerald"
          />
          <KPICard
            label="Margen mes"
            value={`${marginMonthPct.toFixed(1)}%`}
            hint="ganancia / ventas"
            icon={TrendingUp}
            accent={marginMonthPct < 15 ? 'rose' : marginMonthPct < 25 ? 'amber' : 'emerald'}
          />
        </div>
      </section>

      {/* ALERTAS */}
      <section>
        <SectionLabel>Alertas</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KPICard
            label="Stock bajo mínimo"
            value={kpis?.low_stock_count || 0}
            hint="productos a reordenar"
            icon={AlertTriangle}
            accent={(kpis?.low_stock_count || 0) > 0 ? 'amber' : 'emerald'}
          />
          <KPICard
            label="Cuentas por cobrar"
            value={formatMoney(kpis?.pending_credits_usd)}
            hint="saldo pendiente de créditos"
            icon={CreditCard}
            accent={Number(kpis?.pending_credits_usd) > 0 ? 'rose' : 'emerald'}
          />
        </div>
      </section>

      {/* Chart 30 días */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ventas últimos 30 días
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Total diario en USD</p>
          </div>
        </div>
        <SalesChart data={dailySales || []} />
      </div>

      {/* Widgets cliente: donut + top productos + recientes (con modal) */}
      <DashboardWidgets
        paymentData={paymentData}
        topProducts={topProducts}
        recentSales={recentSales}
        role={profile?.role || 'cajero'}
      />
    </div>
  );
}
