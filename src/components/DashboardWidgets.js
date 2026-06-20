'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, Receipt, ShoppingCart, Package, Flame, ArrowRight,
  Banknote, Smartphone, ArrowLeftRight, CreditCard, Clock, Coins,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import Link from 'next/link';
import { formatMoney } from '@/lib/pricing';
import { formatShortDateTime } from '@/lib/dates';
import SaleDetailModal from './SaleDetailModal';

const PAYMENT_META = {
  efectivo:      { label: 'Efectivo',      icon: Banknote },
  pago_movil:    { label: 'Pago móvil',    icon: Smartphone },
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  tarjeta:       { label: 'Tarjeta',       icon: CreditCard },
  binance:       { label: 'Binance',       icon: Coins },
  credito:       { label: 'Crédito',       icon: Clock },
};

const METHOD_COLORS = {
  efectivo:      '#10b981',
  pago_movil:    '#0ea5e9',
  transferencia: '#8b5cf6',
  tarjeta:       '#f59e0b',
  binance:       '#f0b90b',
  credito:       '#f43f5e',
};

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

/**
 * Sección inferior del dashboard:
 *   - Donut de métodos de pago (últimos 30 días)
 *   - Top productos vendidos (últimos 30 días)
 *   - Últimas ventas (clickeables, abren modal de detalle)
 *
 * Recibe los datos como props del server component, maneja modal local.
 */
export default function DashboardWidgets({
  paymentData,    // [{ payment_method, total_usd }]
  topProducts,    // v_top_sold_products rows
  recentSales: initialRecent,
  role,
}) {
  const [recentSales, setRecentSales] = useState(initialRecent || []);
  const [detailSaleId, setDetailSaleId] = useState(null);

  // Aggregar payment_data por método
  const methods = useMemo(() => {
    const agg = {};
    for (const s of paymentData || []) {
      const m = s.payment_method;
      if (!agg[m]) agg[m] = { method: m, count: 0, total: 0 };
      agg[m].count += 1;
      agg[m].total += Number(s.total_usd || 0);
    }
    return Object.values(agg).sort((a, b) => b.total - a.total);
  }, [paymentData]);

  function handleVoided({ saleId }) {
    // Remover la venta anulada de la lista de recientes (filtramos por completada)
    setRecentSales((prev) => prev.filter((s) => s.id !== saleId));
  }

  return (
    <>
      {/* Charts row: donut + top productos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <PaymentDonutCard methods={methods} />
        <TopProductsCard products={topProducts || []} />
      </div>

      {/* Últimas ventas */}
      <RecentSalesCard
        sales={recentSales}
        onRowClick={(id) => setDetailSaleId(id)}
      />

      <SaleDetailModal
        saleId={detailSaleId}
        role={role}
        onClose={() => setDetailSaleId(null)}
        onVoided={handleVoided}
      />
    </>
  );
}

// =========================================================================
// Donut de métodos de pago
// =========================================================================
function PaymentDonutCard({ methods }) {
  const isDark = useIsDark();
  const hasData = methods.length > 0;
  const totalCount = methods.reduce((acc, m) => acc + m.count, 0);
  const totalAmount = methods.reduce((acc, m) => acc + m.total, 0);

  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f1f5f9' : '#0f172a';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Wallet className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          Métodos de pago
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Últimos 30 días</p>
      </div>

      {!hasData ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
          Sin datos en los últimos 30 días.
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative h-36 w-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={methods}
                  dataKey="total"
                  nameKey="method"
                  cx="50%" cy="50%"
                  innerRadius="60%" outerRadius="95%"
                  paddingAngle={2} stroke="none"
                >
                  {methods.map((m) => (
                    <Cell key={m.method} fill={METHOD_COLORS[m.method] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: 8,
                    color: tooltipText,
                    fontSize: 12,
                  }}
                  formatter={(v, _, payload) => [
                    `${formatMoney(v)} | ${payload.payload.count} ${payload.payload.count === 1 ? 'venta' : 'ventas'}`,
                    PAYMENT_META[payload.payload.method]?.label || payload.payload.method,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{totalCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">ventas</p>
            </div>
          </div>

          <ul className="flex-1 space-y-1.5 text-xs">
            {methods.map((m) => {
              const Meta = PAYMENT_META[m.method];
              const Ico = Meta?.icon;
              const pct = totalAmount > 0 ? (m.total / totalAmount) * 100 : 0;
              return (
                <li key={m.method} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                    style={{ background: METHOD_COLORS[m.method] || '#94a3b8' }}
                  />
                  {Ico && <Ico className="h-3 w-3 text-slate-400" />}
                  <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                    {Meta?.label || m.method}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Top productos vendidos
// =========================================================================
function TopProductsCard({ products }) {
  const top = products.slice(0, 5);
  const maxUnits = Math.max(...top.map((p) => Number(p.units_sold_30d) || 0), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Flame className="h-4 w-4 text-amber-500" />
            Más vendidos
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Top 5 — últimos 30 días</p>
        </div>
        <Link
          href="/productos"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Ver todos
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {top.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-slate-400 dark:text-slate-500">
          <Package className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <span>Sin ventas en los últimos 30 días.</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {top.map((p, i) => {
            const units = Number(p.units_sold_30d) || 0;
            const pct = (units / maxUnits) * 100;
            return (
              <li key={p.id} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                  i === 0
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                    : i === 1
                    ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    : i === 2
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {p.name}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {units.toLocaleString('es-VE')}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {p.unit || 'u'}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =========================================================================
// Últimas ventas (clickeables)
// =========================================================================
function RecentSalesCard({ sales, onRowClick }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ShoppingCart className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Últimas ventas
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Toca cualquier venta para ver el detalle completo
          </p>
        </div>
        <Link
          href="/ventas"
          className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Ver todas
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {sales.length === 0 ? (
        <div className="p-12 text-center">
          <Receipt className="mx-auto mb-2 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Aún no hay ventas registradas.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Factura</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cajero</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pago</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fecha</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sales.map((s) => {
                const Pay = PAYMENT_META[s.payment_method] || { label: s.payment_method, icon: Receipt };
                const PayIco = Pay.icon;
                return (
                  <tr
                    key={s.id}
                    onClick={() => onRowClick(s.id)}
                    className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      #{String(s.invoice_number).padStart(6, '0')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {s.profiles?.full_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <PayIco className="h-3.5 w-3.5 text-slate-400" />
                        {Pay.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {formatShortDateTime(s.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(s.total_usd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}