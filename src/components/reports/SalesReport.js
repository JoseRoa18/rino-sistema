'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Users, CreditCard, Layers, Clock, TrendingUp,
  TrendingDown, DollarSign, ShoppingBag, Percent,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Line, ComposedChart, Cell,
} from 'recharts';
import KPICard from '../KPICard';
import ReportToolbar from './ReportToolbar';
import MigrationErrorBanner from './MigrationErrorBanner';
import { formatMoney } from '@/lib/pricing';
import { fmt } from '@/lib/export';
import { dayOfWeekName, formatRange } from '@/lib/dates';

const PAYMENT_LABELS = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  pago_movil:    'Pago móvil',
  tarjeta:       'Tarjeta',
  binance:       'Binance',
  credito:       'Crédito',
  mixto:         'Mixto',
};

const TABS = [
  { value: 'resumen',   label: 'Resumen',     icon: BarChart3 },
  { value: 'cajero',    label: 'Por cajero',  icon: Users },
  { value: 'metodo',    label: 'Por método',  icon: CreditCard },
  { value: 'categoria', label: 'Categorías',  icon: Layers },
  { value: 'hora',      label: 'Hora del día', icon: Clock },
];

// ---------------------------------------------------------------------------

export default function SalesReport({
  initialRange,
  pnlDaily,
  byCashier,
  byPayment,
  byCategory,
  byHour,
  previousPnl,
  previousRange,
  error,
}) {
  const router = useRouter();
  const [range, setRange] = useState(initialRange);
  const [tab, setTab] = useState('resumen');

  // Mantener range alineado con la URL (back/forward del navegador)
  useEffect(() => { setRange(initialRange); }, [initialRange.from, initialRange.to]);

  function applyRange(next) {
    setRange(next);
    const params = new URLSearchParams({ from: next.from, to: next.to });
    router.push(`/reportes/ventas?${params.toString()}`);
  }

  // ===== Totales del período =====
  const totals = useMemo(() => {
    const t = pnlDaily.reduce(
      (acc, d) => ({
        revenue: acc.revenue + Number(d.revenue_usd || 0),
        cogs:    acc.cogs    + Number(d.cogs_usd    || 0),
        profit:  acc.profit  + Number(d.profit_usd  || 0),
        tx:      acc.tx      + Number(d.tx_count    || 0),
      }),
      { revenue: 0, cogs: 0, profit: 0, tx: 0 }
    );
    t.margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
    t.avgTicket = t.tx > 0 ? t.revenue / t.tx : 0;
    return t;
  }, [pnlDaily]);

  const prevTotals = useMemo(() => {
    const t = previousPnl.reduce(
      (acc, d) => ({
        revenue: acc.revenue + Number(d.revenue_usd || 0),
        profit:  acc.profit  + Number(d.profit_usd  || 0),
        tx:      acc.tx      + Number(d.tx_count    || 0),
      }),
      { revenue: 0, profit: 0, tx: 0 }
    );
    t.margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
    return t;
  }, [previousPnl]);

  const variations = useMemo(() => ({
    revenue: pctChange(totals.revenue, prevTotals.revenue),
    profit:  pctChange(totals.profit,  prevTotals.profit),
    tx:      pctChange(totals.tx,      prevTotals.tx),
  }), [totals, prevTotals]);

  // ===== Configuración de exportes según tab activo =====
  const exportsConfig = useMemo(() => {
    if (tab === 'resumen') {
      return buildExports({
        slug: 'ventas-resumen',
        title: 'Reporte de Ventas — Resumen',
        range,
        columns: [
          { key: 'day',         label: 'Día',         fmt: fmt.date },
          { key: 'tx_count',    label: 'Ventas',      fmt: fmt.int,   align: 'right' },
          { key: 'revenue_usd', label: 'Ingresos USD', fmt: fmt.money, align: 'right' },
          { key: 'cogs_usd',    label: 'Costo USD',   fmt: fmt.money, align: 'right' },
          { key: 'profit_usd',  label: 'Ganancia USD', fmt: fmt.money, align: 'right' },
          { key: 'margin_pct',  label: 'Margen %',    fmt: (v) => fmt.pct(v), align: 'right' },
        ],
        rows: pnlDaily,
      });
    }
    if (tab === 'cajero') {
      return buildExports({
        slug: 'ventas-por-cajero',
        title: 'Reporte de Ventas — Por cajero',
        range,
        columns: [
          { key: 'cashier_name', label: 'Cajero' },
          { key: 'tx_count',     label: 'Ventas',      fmt: fmt.int,   align: 'right' },
          { key: 'void_count',   label: 'Anuladas',    fmt: fmt.int,   align: 'right' },
          { key: 'total_usd',    label: 'Total USD',   fmt: fmt.money, align: 'right' },
          { key: 'voided_usd',   label: 'Anulado USD', fmt: fmt.money, align: 'right' },
        ],
        rows: aggregateByCashier(byCashier),
      });
    }
    if (tab === 'metodo') {
      return buildExports({
        slug: 'ventas-por-metodo',
        title: 'Reporte de Ventas — Por método de pago',
        range,
        columns: [
          { key: 'payment_method', label: 'Método', fmt: (v) => PAYMENT_LABELS[v] || v },
          { key: 'tx_count',       label: 'Ventas',     fmt: fmt.int,   align: 'right' },
          { key: 'total_usd',      label: 'Total USD',  fmt: fmt.money, align: 'right' },
          { key: 'pct',            label: '% del total', fmt: (v) => fmt.pct(v), align: 'right' },
        ],
        rows: aggregateByPayment(byPayment),
      });
    }
    if (tab === 'categoria') {
      return buildExports({
        slug: 'ventas-por-categoria',
        title: 'Reporte de Ventas — Por categoría',
        range,
        columns: [
          { key: 'category_name', label: 'Categoría' },
          { key: 'units_sold',    label: 'Unidades',      fmt: fmt.int,   align: 'right' },
          { key: 'revenue_usd',   label: 'Precio venta',  fmt: fmt.money, align: 'right' },
          { key: 'cogs_usd',      label: 'Precio costo',  fmt: fmt.money, align: 'right' },
          { key: 'profit_usd',    label: 'Ganancia',      fmt: fmt.money, align: 'right' },
          { key: 'margin_pct',    label: 'Margen %',      fmt: (v) => fmt.pct(v), align: 'right' },
        ],
        rows: aggregateByCategory(byCategory),
      });
    }
    if (tab === 'hora') {
      return buildExports({
        slug: 'ventas-por-hora',
        title: 'Reporte de Ventas — Por hora (últimos 90d)',
        range,
        columns: [
          { key: 'dow_name', label: 'Día' },
          { key: 'hour',     label: 'Hora',     align: 'right' },
          { key: 'tx_count', label: 'Ventas',   fmt: fmt.int,   align: 'right' },
          { key: 'total_usd', label: 'Total USD', fmt: fmt.money, align: 'right' },
        ],
        rows: byHour.map((h) => ({ ...h, dow_name: dayOfWeekName(h.dow) })),
      });
    }
    return null;
  }, [tab, pnlDaily, byCashier, byPayment, byCategory, byHour, range]);

  return (
    <div className="space-y-6">
      <ReportToolbar
        title="Reporte de Ventas"
        subtitle={`Período: ${formatRange(range)} · Comparado vs ${formatRange(previousRange)}`}
        range={range}
        onRangeChange={applyRange}
        exports={exportsConfig}
      />

      {error && <MigrationErrorBanner error={error} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Ingresos"
          value={formatMoney(totals.revenue)}
          hint={renderVariation(variations.revenue, 'vs período previo')}
          icon={DollarSign}
          accent="brand"
        />
        <KPICard
          label="Ganancia"
          value={formatMoney(totals.profit)}
          hint={renderVariation(variations.profit, 'vs período previo')}
          icon={TrendingUp}
          accent="emerald"
        />
        <KPICard
          label="Transacciones"
          value={totals.tx}
          hint={`Ticket prom. ${formatMoney(totals.avgTicket)}`}
          icon={ShoppingBag}
          accent="violet"
        />
        <KPICard
          label="Margen bruto"
          value={`${totals.margin.toFixed(1)}%`}
          hint={`Costo ${formatMoney(totals.cogs)}`}
          icon={Percent}
          accent={totals.margin < 15 ? 'rose' : totals.margin < 25 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 print:hidden dark:border-slate-700">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === 'resumen'   && <ResumenTab pnlDaily={pnlDaily} />}
      {tab === 'cajero'    && <CajeroTab data={aggregateByCashier(byCashier)} totalRevenue={totals.revenue} />}
      {tab === 'metodo'    && <MetodoTab data={aggregateByPayment(byPayment)} />}
      {tab === 'categoria' && <CategoriaTab data={aggregateByCategory(byCategory)} />}
      {tab === 'hora'      && <HoraTab data={byHour} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function ResumenTab({ pnlDaily }) {
  const chartData = pnlDaily.map((d) => ({
    day: new Date(`${d.day}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
    Ingresos: Number(d.revenue_usd || 0),
    Ganancia: Number(d.profit_usd  || 0),
    Margen:   Number(d.margin_pct  || 0),
  }));

  return (
    <div className="space-y-6">
      {/* Chart */}
      <div className="card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ingresos, ganancia y margen diario
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Barras = ingresos / ganancia · Línea = % margen
          </p>
        </div>
        {chartData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-400">
            Sin ventas en el período seleccionado.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
                <Tooltip formatter={(v, name) => name === 'Margen' ? `${Number(v).toFixed(1)}%` : formatMoney(v)} />
                <Bar yAxisId="left" dataKey="Ingresos" fill="#0284c7" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="left" dataKey="Ganancia" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" dataKey="Margen" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabla P&L diaria */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            P&amp;L diario
          </h3>
        </div>
        {pnlDaily.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Sin datos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Día</th>
                  <th className="px-4 py-3 text-right">Ventas</th>
                  <th className="px-4 py-3 text-right">Ingresos</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Ganancia</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {pnlDaily.map((d) => (
                  <tr key={d.day} className="text-sm">
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{fmt.date(d.day)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{d.tx_count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatMoney(d.revenue_usd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(d.cogs_usd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(d.profit_usd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <MarginBadge value={Number(d.margin_pct)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CajeroTab({ data, totalRevenue }) {
  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Distribución de ventas por cajero
        </h3>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            Sin ventas en el período.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis dataKey="cashier_name" type="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={120} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="total_usd" fill="#0284c7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <DataTable
        title="Detalle por cajero"
        columns={[
          { key: 'cashier_name', label: 'Cajero' },
          { key: 'tx_count',     label: 'Ventas',      align: 'right' },
          { key: 'void_count',   label: 'Anuladas',    align: 'right', fmt: fmt.int },
          { key: 'total_usd',    label: 'Total',       align: 'right', fmt: formatMoney },
          { key: 'voided_usd',   label: 'Anulado',     align: 'right', fmt: formatMoney },
          { key: 'pct',          label: '% del total', align: 'right', fmt: (v) => fmt.pct(v) },
        ]}
        rows={data.map((r) => ({
          ...r,
          pct: totalRevenue > 0 ? (Number(r.total_usd) / totalRevenue) * 100 : 0,
        }))}
      />
    </div>
  );
}

function MetodoTab({ data }) {
  const colors = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
  const total  = data.reduce((acc, r) => acc + Number(r.total_usd || 0), 0);
  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Ingresos por método de pago
        </h3>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            Sin ventas en el período.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="payment_method" tickFormatter={(v) => PAYMENT_LABELS[v] || v} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  labelFormatter={(v) => PAYMENT_LABELS[v] || v}
                  formatter={(v) => formatMoney(v)}
                />
                <Bar dataKey="total_usd" radius={[4, 4, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <DataTable
        title="Detalle por método"
        columns={[
          { key: 'payment_method', label: 'Método',     fmt: (v) => PAYMENT_LABELS[v] || v },
          { key: 'tx_count',       label: 'Ventas',     align: 'right' },
          { key: 'total_usd',      label: 'Total',      align: 'right', fmt: formatMoney },
          { key: 'pct',            label: '% del total', align: 'right', fmt: (v) => fmt.pct(v) },
        ]}
        rows={data.map((r) => ({
          ...r,
          pct: total > 0 ? (Number(r.total_usd) / total) * 100 : 0,
        }))}
      />
    </div>
  );
}

function CategoriaTab({ data }) {
  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Ingresos y ganancia por categoría
        </h3>
        {data.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-400">
            Sin ventas en el período.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis dataKey="category_name" type="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={120} />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="revenue_usd" name="Ingresos" fill="#0284c7" radius={[0, 3, 3, 0]} />
                <Bar dataKey="profit_usd"  name="Ganancia" fill="#10b981" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <DataTable
        title="Detalle por categoría"
        columns={[
          { key: 'category_name', label: 'Categoría' },
          { key: 'units_sold',    label: 'Unidades',         align: 'right', fmt: fmt.int },
          { key: 'revenue_usd',   label: 'Precio venta',     align: 'right', fmt: formatMoney },
          { key: 'cogs_usd',      label: 'Precio costo',     align: 'right', fmt: formatMoney },
          { key: 'profit_usd',    label: 'Ganancia',         align: 'right', fmt: formatMoney },
          { key: 'margin_pct',    label: 'Margen',           align: 'right', fmt: (v) => fmt.pct(v) },
        ]}
        rows={data}
      />
    </div>
  );
}

function HoraTab({ data }) {
  // Construir matriz 7 días x 24 horas
  const matrix = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const r of data) {
      m[r.dow][r.hour] = Number(r.total_usd || 0);
      if (m[r.dow][r.hour] > max) max = m[r.dow][r.hour];
    }
    return { m, max };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Mapa de calor: día vs hora
        </h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Concentración de ventas USD por día de la semana y hora — últimos 90 días
        </p>

        {matrix.max === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            Sin datos en los últimos 90 días.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="w-12 pr-2 text-right text-[10px] font-medium text-slate-400"></th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="px-1 pb-1 text-center text-[10px] text-slate-400">
                      {h % 3 === 0 ? `${h}h` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                  <tr key={dow}>
                    <td className="w-12 pr-2 text-right text-[11px] font-medium text-slate-500">
                      {dayOfWeekName(dow)}
                    </td>
                    {matrix.m[dow].map((v, h) => {
                      const intensity = matrix.max > 0 ? v / matrix.max : 0;
                      const opacity = intensity === 0 ? 0 : Math.max(0.08, intensity);
                      return (
                        <td
                          key={h}
                          title={v > 0 ? `${dayOfWeekName(dow)} ${h}h — ${formatMoney(v)}` : ''}
                          className="h-7 w-7 border border-slate-100 dark:border-slate-800"
                          style={{
                            backgroundColor: intensity > 0
                              ? `rgba(2, 132, 199, ${opacity})`
                              : 'transparent',
                          }}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-400">
              Menos
              <div className="flex gap-1">
                {[0.1, 0.3, 0.5, 0.7, 1].map((o) => (
                  <div
                    key={o}
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: `rgba(2, 132, 199, ${o})` }}
                  />
                ))}
              </div>
              Más
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aggregateByCashier(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.cashier_id || 'unknown';
    const existing = map.get(key) || {
      cashier_id: r.cashier_id,
      cashier_name: r.cashier_name || 'Desconocido',
      tx_count: 0, void_count: 0, total_usd: 0, voided_usd: 0,
    };
    existing.tx_count   += Number(r.tx_count   || 0);
    existing.void_count += Number(r.void_count || 0);
    existing.total_usd  += Number(r.total_usd  || 0);
    existing.voided_usd += Number(r.voided_usd || 0);
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.total_usd - a.total_usd);
}

function aggregateByPayment(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.payment_method;
    const existing = map.get(key) || {
      payment_method: key,
      tx_count: 0, total_usd: 0,
    };
    existing.tx_count  += Number(r.tx_count  || 0);
    existing.total_usd += Number(r.total_usd || 0);
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.total_usd - a.total_usd);
}

function aggregateByCategory(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.category_id;
    const existing = map.get(key) || {
      category_id: key,
      category_name: r.category_name,
      units_sold: 0, revenue_usd: 0, profit_usd: 0,
    };
    existing.units_sold  += Number(r.units_sold  || 0);
    existing.revenue_usd += Number(r.revenue_usd || 0);
    existing.profit_usd  += Number(r.profit_usd  || 0);
    map.set(key, existing);
  }
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      // Costo (precio costo): ingresos − ganancia
      cogs_usd:   r.revenue_usd - r.profit_usd,
      margin_pct: r.revenue_usd > 0 ? (r.profit_usd / r.revenue_usd) * 100 : 0,
    }))
    .sort((a, b) => b.revenue_usd - a.revenue_usd);
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function renderVariation(pct, suffix) {
  if (pct === null || !Number.isFinite(pct)) return suffix;
  const positive = pct >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 ${
      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
    }`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}% {suffix}
    </span>
  );
}

function buildExports({ slug, title, range, columns, rows }) {
  const dateLabel = formatRange(range);
  const filename = `${slug}-${range.from}-${range.to}`;
  return {
    csv: { filename, columns, rows },
    pdf: {
      filename,
      title,
      subtitle: dateLabel,
      meta: [
        ['Generado', new Date().toLocaleString('es-VE')],
        ['Filas',    rows.length],
      ],
      tables: [{ columns, rows }],
      orientation: columns.length > 5 ? 'landscape' : 'portrait',
    },
  };
}

function MarginBadge({ value }) {
  const cls =
    value < 15 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
    : value < 25 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {value.toFixed(1)}%
    </span>
  );
}

function DataTable({ title, columns, rows }) {
  return (
    <div className="card overflow-hidden">
      {title && (
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">Sin datos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {rows.map((row, i) => (
                <tr key={i} className="text-sm">
                  {columns.map((c) => {
                    const raw = row[c.key];
                    const value = c.fmt ? c.fmt(raw, row) : raw;
                    return (
                      <td
                        key={c.key}
                        className={`px-4 py-2 ${
                          c.align === 'right'
                            ? 'text-right tabular-nums text-slate-900 dark:text-slate-100'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {value ?? '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
