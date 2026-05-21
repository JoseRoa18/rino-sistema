'use client';

import { useMemo, useState } from 'react';
import {
  Trophy, Percent, MoonStar, Package, DollarSign, TrendingUp, AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import KPICard from '../KPICard';
import ReportToolbar from './ReportToolbar';
import MigrationErrorBanner from './MigrationErrorBanner';
import { formatMoney } from '@/lib/pricing';
import { fmt } from '@/lib/export';

const TABS = [
  { value: 'top',         label: 'Top vendidos',  icon: Trophy },
  { value: 'rentables',   label: 'Rentabilidad',  icon: Percent },
  { value: 'sinmov',      label: 'Sin movimiento', icon: MoonStar },
];

// ---------------------------------------------------------------------------

export default function ProductsReport({ rows, error }) {
  const [tab, setTab] = useState('top');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categoryOptions = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      if (r.category_id && !seen.has(r.category_id)) {
        seen.set(r.category_id, r.category_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  // Filtros aplicados
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== 'all' && r.category_id !== categoryFilter) return false;
      if (q) {
        const haystack = `${r.name} ${r.sku || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, categoryFilter]);

  // Datasets por tab
  const top10 = useMemo(
    () => [...filtered]
      .filter((r) => Number(r.units_sold) > 0)
      .sort((a, b) => Number(b.units_sold) - Number(a.units_sold))
      .slice(0, 20),
    [filtered]
  );

  const profitable = useMemo(
    () => [...filtered]
      .filter((r) => Number(r.revenue_usd) > 0)
      .sort((a, b) => Number(b.profit_usd) - Number(a.profit_usd)),
    [filtered]
  );

  const noMovement = useMemo(
    () => [...filtered]
      .filter((r) => r.days_since_last_sale === null || Number(r.days_since_last_sale) >= 90)
      .sort((a, b) => {
        const aDays = a.days_since_last_sale === null ? Infinity : Number(a.days_since_last_sale);
        const bDays = b.days_since_last_sale === null ? Infinity : Number(b.days_since_last_sale);
        return bDays - aDays;
      }),
    [filtered]
  );

  const totals = useMemo(() => {
    const sold     = filtered.filter((r) => Number(r.revenue_usd) > 0);
    const revenue  = sold.reduce((a, r) => a + Number(r.revenue_usd || 0), 0);
    const profit   = sold.reduce((a, r) => a + Number(r.profit_usd || 0), 0);
    const units    = sold.reduce((a, r) => a + Number(r.units_sold || 0), 0);
    return {
      total_sku:   filtered.length,
      sold_sku:    sold.length,
      revenue,
      profit,
      units,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      no_mov:  noMovement.length,
    };
  }, [filtered, noMovement]);

  const exportsConfig = useMemo(() => {
    if (tab === 'top') {
      return buildExports({
        slug: 'productos-top-vendidos',
        title: 'Reporte de Productos — Top vendidos',
        rows: top10,
        columns: [
          { key: 'sku',           label: 'SKU' },
          { key: 'name',          label: 'Producto' },
          { key: 'category_name', label: 'Categoría' },
          { key: 'units_sold',    label: 'Unidades', align: 'right', fmt: fmt.int },
          { key: 'revenue_usd',   label: 'Ingresos', align: 'right', fmt: formatMoney },
          { key: 'profit_usd',    label: 'Ganancia', align: 'right', fmt: formatMoney },
          { key: 'margin_pct',    label: 'Margen %', align: 'right', fmt: (v) => fmt.pct(v) },
        ],
      });
    }
    if (tab === 'rentables') {
      return buildExports({
        slug: 'productos-rentabilidad',
        title: 'Reporte de Productos — Rentabilidad',
        rows: profitable,
        columns: [
          { key: 'sku',           label: 'SKU' },
          { key: 'name',          label: 'Producto' },
          { key: 'category_name', label: 'Categoría' },
          { key: 'units_sold',    label: 'Vendido',  align: 'right', fmt: fmt.int },
          { key: 'cost_avg',      label: 'Costo prom', align: 'right', fmt: formatMoney },
          { key: 'price_usd',     label: 'Precio',   align: 'right', fmt: formatMoney },
          { key: 'revenue_usd',   label: 'Ingresos', align: 'right', fmt: formatMoney },
          { key: 'profit_usd',    label: 'Ganancia', align: 'right', fmt: formatMoney },
          { key: 'margin_pct',    label: 'Margen %', align: 'right', fmt: (v) => fmt.pct(v) },
        ],
      });
    }
    if (tab === 'sinmov') {
      return buildExports({
        slug: 'productos-sin-movimiento',
        title: 'Reporte de Productos — Sin movimiento ≥ 90 días',
        rows: noMovement,
        columns: [
          { key: 'sku',           label: 'SKU' },
          { key: 'name',          label: 'Producto' },
          { key: 'category_name', label: 'Categoría' },
          { key: 'stock',         label: 'Stock',    align: 'right', fmt: (v) => fmt.num(v, 2) },
          { key: 'cost_avg',      label: 'Costo prom', align: 'right', fmt: formatMoney },
          { key: 'days_since_last_sale', label: 'Días sin venta', align: 'right',
            fmt: (v) => v === null ? 'Nunca' : `${v}d` },
          { key: 'last_sold_at', label: 'Última venta', fmt: fmt.date },
        ],
      });
    }
    return null;
  }, [tab, top10, profitable, noMovement]);

  return (
    <div className="space-y-6">
      <ReportToolbar
        title="Reporte de Productos"
        subtitle="Top vendidos, rentabilidad por SKU y productos sin movimiento"
        exports={exportsConfig}
      />

      {error && <MigrationErrorBanner error={error} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Productos"
          value={totals.total_sku}
          hint={`${totals.sold_sku} con ventas`}
          icon={Package}
          accent="brand"
        />
        <KPICard
          label="Ingresos histórico"
          value={formatMoney(totals.revenue)}
          hint={`${fmt.int(totals.units)} unidades`}
          icon={DollarSign}
          accent="violet"
        />
        <KPICard
          label="Ganancia histórica"
          value={formatMoney(totals.profit)}
          hint={`Margen ${totals.margin.toFixed(1)}%`}
          icon={TrendingUp}
          accent="emerald"
        />
        <KPICard
          label="Sin movimiento"
          value={totals.no_mov}
          hint="≥90 días sin venta"
          icon={AlertCircle}
          accent={totals.no_mov > 0 ? 'amber' : 'emerald'}
        />
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-3 p-3 print:hidden">
        <input
          type="text"
          placeholder="Buscar por SKU o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input min-w-[200px] flex-1"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Todas las categorías</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
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

      {tab === 'top'       && <TopTab data={top10} />}
      {tab === 'rentables' && <RentablesTab data={profitable} />}
      {tab === 'sinmov'    && <SinMovTab data={noMovement} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TopTab({ data }) {
  if (data.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Sin productos vendidos con los filtros aplicados.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Top 20 productos por unidades vendidas
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="#94a3b8" width={140} />
              <Tooltip />
              <Bar dataKey="units_sold" name="Unidades" fill="#0284c7" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Top vendidos ({data.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Unidades</th>
                <th className="px-4 py-3 text-right">Ingresos</th>
                <th className="px-4 py-3 text-right">Ganancia</th>
                <th className="px-4 py-3 text-right">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {data.map((r, i) => (
                <tr key={r.product_id} className="text-sm">
                  <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.sku || '—'}</td>
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{r.category_name || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{fmt.int(r.units_sold)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(r.revenue_usd)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(r.profit_usd)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <MarginBadge value={Number(r.margin_pct)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RentablesTab({ data }) {
  if (data.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Sin datos de rentabilidad para los filtros aplicados.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Rentabilidad por producto ({data.length})
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ordenado por ganancia (USD)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3 text-right">Vendido</th>
              <th className="px-4 py-3 text-right">Costo prom</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right">Ingresos</th>
              <th className="px-4 py-3 text-right">Ganancia</th>
              <th className="px-4 py-3 text-right">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {data.map((r) => (
              <tr key={r.product_id} className="text-sm">
                <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.sku || '—'}</td>
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{r.name}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmt.int(r.units_sold)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(r.cost_avg)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(r.price_usd)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(r.revenue_usd)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{formatMoney(r.profit_usd)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <MarginBadge value={Number(r.margin_pct)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SinMovTab({ data }) {
  if (data.length === 0) {
    return (
      <div className="card p-8 text-center">
        <MoonStar className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Todos los productos han tenido ventas en los últimos 90 días.
        </p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Productos sin movimiento ≥ 90 días ({data.length})
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Candidatos para revisión: promociones, descontinuar o devolver al proveedor
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Costo prom</th>
              <th className="px-4 py-3 text-right">Capital inmovilizado</th>
              <th className="px-4 py-3 text-right">Sin venta</th>
              <th className="px-4 py-3">Última venta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {data.map((r) => {
              const capital = Number(r.stock || 0) * Number(r.cost_avg || 0);
              const days = r.days_since_last_sale;
              return (
                <tr key={r.product_id} className="text-sm">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.sku || '—'}</td>
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{r.category_name || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmt.num(r.stock, 2)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(r.cost_avg)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">{formatMoney(capital)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                    {days === null ? 'Nunca' : `${days}d`}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {r.last_sold_at ? fmt.date(r.last_sold_at) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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

function buildExports({ slug, title, rows, columns }) {
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${slug}-${today}`;
  return {
    csv: { filename, columns, rows },
    pdf: {
      filename,
      title,
      subtitle: `Generado el ${new Date().toLocaleDateString('es-VE')}`,
      meta: [['Filas', rows.length]],
      tables: [{ columns, rows }],
      orientation: columns.length > 5 ? 'landscape' : 'portrait',
    },
  };
}
