'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart3, Boxes, Package, CreditCard, ArrowRight, AlertTriangle,
  DollarSign, TrendingUp, ShoppingBag, Activity, Trophy, Users,
  Truck, Clock, ExternalLink, Receipt, Calendar as CalendarIcon,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from 'recharts';
import KPICard from '../KPICard';
import Sparkline from '../Sparkline';
import PageHeader from '../PageHeader';
import { formatMoney } from '@/lib/pricing';
import { normalizeSpaces } from '@/lib/dates';

const PAYMENT_LABELS = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  pago_movil:    'Pago móvil',
  tarjeta:       'Tarjeta',
  credito:       'Crédito',
  mixto:         'Mixto',
};

export default function ReportsHub({
  stats,
  salesDaily,
  pnlMonth,
  topProducts,
  topCashiers,
  overdueCustomers,
  overdueSuppliers,
  lowStock,
  recentSales,
}) {
  const sales     = stats.sales || {};
  const customers = stats.customers || {};
  const suppliers = stats.suppliers || {};

  // ===== Datos para sparklines y mini-charts =====
  const last30Series = useMemo(
    () => (salesDaily || []).map((d) => Number(d.total_usd || 0)),
    [salesDaily]
  );

  const chartData = useMemo(() => {
    return (salesDaily || []).map((d) => ({
      day: new Date(`${d.day}T12:00:00`).toLocaleDateString('es-VE', {
        day: '2-digit', month: 'short',
      }),
      total: Number(d.total_usd || 0),
    }));
  }, [salesDaily]);

  const monthTotals = useMemo(() => {
    return (pnlMonth || []).reduce(
      (a, d) => ({
        revenue: a.revenue + Number(d.revenue_usd || 0),
        profit:  a.profit  + Number(d.profit_usd  || 0),
      }),
      { revenue: 0, profit: 0 }
    );
  }, [pnlMonth]);

  const bestDay = useMemo(() => {
    return (pnlMonth || []).reduce(
      (best, d) =>
        Number(d.revenue_usd || 0) > Number(best?.revenue_usd || 0) ? d : best,
      null
    );
  }, [pnlMonth]);

  // Alertas combinadas
  const totalAlerts =
    (overdueCustomers?.length || 0) +
    (overdueSuppliers?.length || 0) +
    (lowStock?.length || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reportes"
        subtitle="Visión general del negocio y acceso a reportes operativos"
      />

      {/* ============ KPIs principales ============ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Ventas hoy"
          value={formatMoney(sales.sales_today_usd)}
          hint={`${sales.transactions_today || 0} transacciones`}
          icon={DollarSign}
          accent="brand"
        />
        <KPICard
          label="Ventas semana"
          value={formatMoney(sales.sales_week_usd)}
          hint="últimos 7 días"
          icon={Receipt}
          accent="violet"
        />
        <KPICard
          label="Ventas mes"
          value={formatMoney(sales.sales_month_usd)}
          hint="mes en curso"
          icon={ShoppingBag}
          accent="brand"
        />
        <KPICard
          label="Ganancia mes"
          value={formatMoney(sales.profit_month_usd)}
          hint={
            sales.sales_month_usd > 0
              ? `Margen ${((Number(sales.profit_month_usd) / Number(sales.sales_month_usd)) * 100).toFixed(1)}%`
              : 'Sin ventas aún'
          }
          icon={TrendingUp}
          accent="emerald"
        />
      </div>

      {/* ============ Cards de reportes con sparklines ============ */}
      <div>
        <SectionHeading>Reportes disponibles</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportCard
            href="/reportes/ventas"
            icon={BarChart3}
            title="Ventas"
            description="Cajero, método, categoría, hora. P&L diario y comparativo."
            accent="brand"
            sparkData={last30Series}
            sparkAccent="brand"
            stats={[
              { label: 'Hoy', value: formatMoney(sales.sales_today_usd) },
              { label: 'Mes', value: formatMoney(sales.sales_month_usd) },
            ]}
          />
          <ReportCard
            href="/reportes/inventario"
            icon={Boxes}
            title="Inventario"
            description="Valuación por categoría, bajo mínimo y kardex por producto."
            accent={lowStock?.length > 0 ? 'amber' : 'emerald'}
            stats={[
              {
                label: 'Bajo mínimo',
                value: lowStock?.length || 0,
                warn: (lowStock?.length || 0) > 0,
              },
            ]}
          />
          <ReportCard
            href="/reportes/productos"
            icon={Package}
            title="Productos"
            description="Top vendidos, rentabilidad por SKU y sin movimiento en 90 días."
            accent="violet"
            stats={[
              { label: 'Ganancia mes', value: formatMoney(sales.profit_month_usd) },
            ]}
          />
          <ReportCard
            href="/reportes/cartera"
            icon={CreditCard}
            title="Cartera (AR/AP)"
            description="Por cobrar (clientes) y por pagar (proveedores). Aging y top deudores."
            accent={
              Number(customers.overdue_ar_balance) > 0 ||
              Number(suppliers.overdue_ap_balance) > 0
                ? 'rose'
                : Number(customers.total_ar_balance) > 0 ||
                  Number(suppliers.total_ap_balance) > 0
                ? 'amber'
                : 'emerald'
            }
            stats={[
              { label: 'Por cobrar', value: formatMoney(customers.total_ar_balance) },
              { label: 'Por pagar',  value: formatMoney(suppliers.total_ap_balance) },
            ]}
          />
        </div>

        {/* Segunda fila: reportes operativos */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ReportCard
            href="/reportes/vencimientos"
            icon={CalendarIcon}
            title="Vencimientos"
            description="Lotes por vencer o vencidos. Útil para rotar perecederos antes de perder stock."
            accent={
              Number(sales?.expiring_batches_count) > 0 ? 'rose' : 'emerald'
            }
            stats={[
              {
                label: 'Por vencer (7d)',
                value: Number(sales?.expiring_batches_count) || 0,
                warn: Number(sales?.expiring_batches_count) > 0,
              },
              {
                label: 'En riesgo',
                value: formatMoney(sales?.expiring_value_usd),
              },
            ]}
          />
        </div>
      </div>

      {/* ============ Mini-chart: ventas últimos 30 días ============ */}
      <div className="card p-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Ventas — últimos 30 días
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {bestDay
                ? `Mejor día del mes: ${new Date(`${bestDay.day}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'long' })} con ${formatMoney(bestDay.revenue_usd)}`
                : 'Total diario en USD'}
            </p>
          </div>
          <Link
            href="/reportes/ventas"
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            Ver reporte completo
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            Aún no hay ventas registradas para mostrar el gráfico.
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="hubArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#0284c7" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={50} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#0284c7"
                  strokeWidth={2}
                  fill="url(#hubArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ============ Atención requerida (alertas) ============ */}
      <div>
        <SectionHeading>
          Atención requerida
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
              totalAlerts > 0
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
            }`}
          >
            {totalAlerts > 0 ? totalAlerts : 'Todo OK'}
          </span>
        </SectionHeading>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AlertList
              icon={AlertTriangle}
              title="Bajo stock mínimo"
              accent="amber"
              empty="Sin productos bajo mínimo."
              items={(lowStock || []).map((p) => ({
                key: p.product_id,
                primary: p.name,
                secondary: p.sku || p.category_name,
                value: `${Number(p.stock).toFixed(0)} / ${Number(p.min_stock).toFixed(0)}`,
                valueClass: 'text-amber-700 dark:text-amber-400',
                href: `/productos/${p.product_id}`,
              }))}
              footerHref="/reportes/inventario"
              footerLabel="Ver inventario"
            />
            <AlertList
              icon={Users}
              title="Clientes con deuda vencida"
              accent="rose"
              empty="Sin clientes con vencidos."
              items={(overdueCustomers || []).map((c) => ({
                key: c.customer_id,
                primary: c.name,
                secondary: `${c.overdue_count} crédito${c.overdue_count === 1 ? '' : 's'} vencido${c.overdue_count === 1 ? '' : 's'}`,
                value: formatMoney(c.overdue_balance_usd),
                valueClass: 'text-rose-700 dark:text-rose-400',
                href: `/clientes/${c.customer_id}`,
              }))}
              footerHref="/reportes/cartera"
              footerLabel="Ver cartera AR"
            />
            <AlertList
              icon={Truck}
              title="Proveedores vencidos"
              accent="rose"
              empty="Sin proveedores con vencidos."
              items={(overdueSuppliers || []).map((s) => ({
                key: s.supplier_id,
                primary: s.name,
                secondary: `${s.overdue_count} pago${s.overdue_count === 1 ? '' : 's'} vencido${s.overdue_count === 1 ? '' : 's'}`,
                value: formatMoney(s.overdue_balance_usd),
                valueClass: 'text-rose-700 dark:text-rose-400',
                href: `/proveedores/${s.supplier_id}`,
              }))}
              footerHref="/reportes/cartera"
              footerLabel="Ver cartera AP"
            />
        </div>
      </div>

      {/* ============ Top del mes ============ */}
      <div>
        <SectionHeading>Top del mes</SectionHeading>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top productos */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Productos más vendidos
                </h3>
              </div>
              <Link
                href="/reportes/productos"
                className="text-xs text-brand-600 hover:underline dark:text-brand-400"
              >
                Ver todo
              </Link>
            </div>
            {topProducts.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">
                Aún no hay productos vendidos este mes.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {topProducts.map((p, i) => (
                  <li key={p.product_id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {p.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {Number(p.units_sold).toFixed(0)} u · {p.category_name || 'Sin categoría'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatMoney(p.revenue_usd)}
                      </div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">
                        +{formatMoney(p.profit_usd)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Top cajeros */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Mejores cajeros
                </h3>
              </div>
              <Link
                href="/reportes/ventas"
                className="text-xs text-brand-600 hover:underline dark:text-brand-400"
              >
                Ver todo
              </Link>
            </div>
            {topCashiers.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">
                Aún no hay ventas registradas este mes.
              </p>
            ) : (
              <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {topCashiers.map((c, i) => {
                  const max = Number(topCashiers[0]?.total_usd || 1);
                  const pct = max > 0 ? (Number(c.total_usd) / max) * 100 : 0;
                  return (
                    <li key={c.cashier_id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {c.cashier_name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {c.tx_count} ventas
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatMoney(c.total_usd)}
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full bg-violet-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>

      {/* ============ Actividad reciente ============ */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Últimas ventas
            </h3>
          </div>
          <Link
            href="/ventas"
            className="text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            Ver todas
          </Link>
        </div>
        {recentSales.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            Sin ventas registradas todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Factura</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Cajero</th>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Método</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {recentSales.map((s) => (
                  <tr key={s.id} className="text-sm">
                    <td className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                      #{s.invoice_number}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                      {normalizeSpaces(new Date(s.created_at).toLocaleString('es-VE', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      }))}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                      {s.profiles?.full_name || '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                      {s.customers?.name || <span className="text-slate-400">Mostrador</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                      {PAYMENT_LABELS[s.payment_method] || s.payment_method}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatMoney(s.total_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
        <p>
          <strong className="text-slate-900 dark:text-slate-100">Tip:</strong>{' '}
          Cada reporte tiene filtros por rango de fecha y permite exportar a{' '}
          <strong>CSV</strong> (Excel), <strong>PDF</strong> o imprimir directamente.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionHeading({ children }) {
  return (
    <h2 className="mb-3 flex items-center text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h2>
  );
}

const ACCENT = {
  brand:   { gradient: 'from-brand-500/15 to-brand-500/0',     icon: 'text-brand-600 dark:text-brand-400' },
  emerald: { gradient: 'from-emerald-500/15 to-emerald-500/0', icon: 'text-emerald-600 dark:text-emerald-400' },
  violet:  { gradient: 'from-violet-500/15 to-violet-500/0',   icon: 'text-violet-600 dark:text-violet-400' },
  amber:   { gradient: 'from-amber-500/15 to-amber-500/0',     icon: 'text-amber-600 dark:text-amber-400' },
  rose:    { gradient: 'from-rose-500/15 to-rose-500/0',       icon: 'text-rose-600 dark:text-rose-400' },
};

function ReportCard({
  href, icon: Icon, title, description, stats, accent,
  sparkData, sparkAccent,
}) {
  const a = ACCENT[accent] || ACCENT.brand;
  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500/40"
    >
      <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${a.gradient}`} />

      <div className="relative">
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/80 backdrop-blur dark:bg-slate-900/80 ${a.icon}`}>
          <Icon className="h-5 w-5" />
        </div>

        <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      {sparkData && sparkData.length >= 2 && (
        <div className="relative mt-4">
          <Sparkline
            data={sparkData}
            accent={sparkAccent || 'brand'}
            className="h-10 w-full"
          />
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                {s.label}
              </div>
              <div className={`text-sm font-semibold tabular-nums ${
                s.warn
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}>
                {s.warn && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="relative mt-4 flex items-center text-xs font-medium text-brand-600 dark:text-brand-400">
        Abrir reporte
        <ArrowRight className="ml-1 h-3 w-3 transition group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

function AlertList({ icon: Icon, title, items, accent, empty, footerHref, footerLabel }) {
  const iconClass = accent === 'rose'
    ? 'text-rose-500'
    : accent === 'amber'
    ? 'text-amber-500'
    : 'text-slate-500';
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconClass}`} />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="flex-1 p-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((it) => (
            <li key={it.key} className="px-4 py-2.5">
              <Link
                href={it.href}
                className="flex items-center gap-3 group/item"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900 group-hover/item:text-brand-700 dark:text-slate-100 dark:group-hover/item:text-brand-400">
                    {it.primary}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {it.secondary}
                  </div>
                </div>
                <div className={`text-sm font-semibold tabular-nums ${it.valueClass || ''}`}>
                  {it.value}
                </div>
                <ExternalLink className="h-3 w-3 flex-shrink-0 text-slate-300 group-hover/item:text-brand-500 dark:text-slate-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={footerHref}
        className="border-t border-slate-100 px-4 py-2 text-center text-xs font-medium text-brand-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-brand-400 dark:hover:bg-slate-800/50"
      >
        {footerLabel} →
      </Link>
    </div>
  );
}
