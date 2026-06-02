'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Search, Ban, CheckCircle2, X, Receipt,
  Wallet, BarChart3,
  Banknote, Smartphone, ArrowLeftRight, CreditCard, Clock,
  DollarSign, ShoppingBag,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { formatMoney } from '@/lib/pricing';
import { formatShortDateTime, veDateStr, normalizeSpaces } from '@/lib/dates';
import KPICard from './KPICard';
import SaleDetailModal from './SaleDetailModal';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';

const PAYMENT_META = {
  efectivo:      { label: 'Efectivo',      icon: Banknote },
  pago_movil:    { label: 'Pago móvil',    icon: Smartphone },
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  tarjeta:       { label: 'Tarjeta',       icon: CreditCard },
  credito:       { label: 'Crédito',       icon: Clock },
};

const FILTERS = [
  { value: 'all',        label: 'Todas' },
  { value: 'completada', label: 'Completadas' },
  { value: 'anulada',    label: 'Anuladas' },
];

export default function SalesClient({ initialSales, role }) {
  const [sales, setSales] = useState(initialSales);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [success, setSuccess] = useState('');
  const [detailSaleId, setDetailSaleId] = useState(null);

  const filtered = useMemo(() => {
    let list = sales;
    if (statusFilter !== 'all') list = list.filter((s) => s.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          String(s.invoice_number).includes(q) ||
          (s.profiles?.full_name || '').toLowerCase().includes(q) ||
          (s.customers?.name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [sales, search, statusFilter]);

  const counts = useMemo(() => ({
    total: sales.length,
    completadas: sales.filter((s) => s.status === 'completada').length,
    anuladas: sales.filter((s) => s.status === 'anulada').length,
  }), [sales]);

  function handleVoided({ saleId, invoiceNumber, reason }) {
    setSales((prev) =>
      prev.map((s) =>
        s.id === saleId
          ? { ...s, status: 'anulada', voided_at: new Date().toISOString(), void_reason: reason }
          : s
      )
    );
    setSuccess(`Venta #${String(invoiceNumber).padStart(6, '0')} anulada correctamente. El stock fue devuelto al inventario.`);
    setTimeout(() => setSuccess(''), 5000);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ventas"
        subtitle={
          <>
            <span className="font-medium text-slate-700 dark:text-slate-300">{counts.completadas}</span> completadas
            {counts.anuladas > 0 && (
              <>
                {' · '}
                <span className="font-medium text-slate-700 dark:text-slate-300">{counts.anuladas}</span> anuladas
              </>
            )}
            {' · últimas 100 transacciones'}
          </>
        }
      />

      {success && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <AnalyticsSection sales={sales} />

      {/* Búsqueda + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por #factura, cajero o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input h-12 pl-12 pr-12 text-base"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Limpiar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {FILTERS.map((opt) => {
            const active = statusFilter === opt.value;
            const count =
              opt.value === 'all' ? counts.total
              : opt.value === 'completada' ? counts.completadas
              : counts.anuladas;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Factura</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fecha</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cajero</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cliente</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pago</th>
                <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total</th>
                <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {filtered.map((s) => {
                const anulada = s.status === 'anulada';
                const Pay = PAYMENT_META[s.payment_method] || { label: s.payment_method, icon: Receipt };
                const PayIco = Pay.icon;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setDetailSaleId(s.id)}
                    className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${anulada ? 'opacity-60' : ''}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      #{String(s.invoice_number).padStart(6, '0')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {formatShortDateTime(s.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-700 dark:text-slate-300">
                      {s.profiles?.full_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {s.customers?.name || 'Genérico'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <PayIco className="h-3.5 w-3.5 text-slate-400" />
                        {Pay.label}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold ${anulada ? 'line-through' : ''} text-slate-900 dark:text-slate-100`}>
                      {formatMoney(s.total_usd)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {anulada ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <Ban className="h-3 w-3" />
                          Anulada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Completada
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={Receipt}
                      title={
                        search || statusFilter !== 'all'
                          ? 'Ninguna venta coincide con los filtros'
                          : 'Aún no hay ventas registradas'
                      }
                      description={
                        search || statusFilter !== 'all'
                          ? 'Intenta cambiar los filtros o limpiar la búsqueda.'
                          : 'Las ventas que registres en el POS aparecerán aquí.'
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SaleDetailModal
        saleId={detailSaleId}
        role={role}
        onClose={() => setDetailSaleId(null)}
        onVoided={handleVoided}
      />
    </div>
  );
}

// =========================================================================
// Analytics: KPIs + 2 gráficos
// =========================================================================

const METHOD_COLORS = {
  efectivo:      '#10b981',
  pago_movil:    '#0ea5e9',
  transferencia: '#8b5cf6',
  tarjeta:       '#f59e0b',
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

function AnalyticsSection({ sales }) {
  const stats = useMemo(() => {
    const completadas = sales.filter((s) => s.status === 'completada');
    const anuladas = sales.filter((s) => s.status === 'anulada');
    const totalUsd = completadas.reduce((acc, s) => acc + Number(s.total_usd || 0), 0);
    const avgTicket = completadas.length > 0 ? totalUsd / completadas.length : 0;
    const voidRate = sales.length > 0 ? (anuladas.length / sales.length) * 100 : 0;

    const dailyMap = new Map();
    for (let i = 6; i >= 0; i--) {
      // Construir cada día en zona Caracas usando "mediodía VE" para evitar
      // que la fecha brinque por la zona horaria.
      const ref = new Date();
      ref.setDate(ref.getDate() - i);
      const key = veDateStr(ref);
      dailyMap.set(key, {
        dateKey: key,
        label: normalizeSpaces(
          new Date(`${key}T12:00:00-04:00`).toLocaleDateString('es-VE', {
            weekday: 'short', day: '2-digit', timeZone: 'America/Caracas',
          })
        ),
        total: 0, count: 0,
      });
    }
    for (const s of completadas) {
      const key = veDateStr(s.created_at);
      if (dailyMap.has(key)) {
        const e = dailyMap.get(key);
        e.total += Number(s.total_usd) || 0;
        e.count += 1;
      }
    }
    const daily = Array.from(dailyMap.values());

    const methodAgg = {};
    for (const s of completadas) {
      const m = s.payment_method;
      if (!methodAgg[m]) methodAgg[m] = { method: m, count: 0, total: 0 };
      methodAgg[m].count += 1;
      methodAgg[m].total += Number(s.total_usd || 0);
    }
    const methods = Object.values(methodAgg).sort((a, b) => b.total - a.total);

    return {
      totalUsd, avgTicket, voidRate,
      countCompletadas: completadas.length,
      countAnuladas: anuladas.length,
      daily, methods,
    };
  }, [sales]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label="Total cobrado"
          value={formatMoney(stats.totalUsd)}
          hint={`${stats.countCompletadas} ventas completadas`}
          icon={DollarSign}
          accent="emerald"
        />
        <KPICard
          label="Ticket promedio"
          value={formatMoney(stats.avgTicket)}
          hint="por transacción"
          icon={Receipt}
          accent="brand"
        />
        <KPICard
          label="Transacciones"
          value={stats.countCompletadas}
          hint="últimas 100"
          icon={ShoppingBag}
          accent="violet"
        />
        <KPICard
          label="Tasa anulación"
          value={`${stats.voidRate.toFixed(1)}%`}
          hint={`${stats.countAnuladas} anuladas`}
          icon={Ban}
          accent={stats.voidRate > 5 ? 'rose' : 'amber'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <DailyBarChart data={stats.daily} />
        <PaymentDonut methods={stats.methods} />
      </div>
    </div>
  );
}

function DailyBarChart({ data }) {
  const isDark = useIsDark();
  const hasData = data.some((d) => d.total > 0);

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const barColor = isDark ? '#34d399' : '#10b981';
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f1f5f9' : '#0f172a';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Ventas por día
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Últimos 7 días</p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="Sin ventas en los últimos 7 días"
          description="Cuando registres ventas en el POS, aparecerán aquí."
          size="compact"
        />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" stroke={axisColor} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={axisColor} fontSize={11} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 8,
                color: tooltipText,
                fontSize: 12,
              }}
              cursor={{ fill: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.08)' }}
              formatter={(v, name, payload) => [
                <span key="v">
                  <span style={{ fontWeight: 600 }}>{formatMoney(v)}</span>
                  <span style={{ opacity: 0.7, marginLeft: 6 }}>
                    {payload.payload.count} {payload.payload.count === 1 ? 'venta' : 'ventas'}
                  </span>
                </span>,
                'Total',
              ]}
              labelFormatter={(l) => l}
              labelStyle={{ color: tooltipText, fontWeight: 500 }}
            />
            <Bar dataKey="total" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function PaymentDonut({ methods }) {
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
        <p className="text-xs text-slate-500 dark:text-slate-400">Distribución de ventas completadas</p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={Wallet}
          title="Sin datos"
          description="No hay ventas completadas para mostrar."
          size="compact"
        />
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative h-32 w-32 flex-shrink-0">
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