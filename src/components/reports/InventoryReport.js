'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes, AlertTriangle, BookOpen, Package, DollarSign, TrendingUp,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import KPICard from '../KPICard';
import ReportToolbar from './ReportToolbar';
import MigrationErrorBanner from './MigrationErrorBanner';
import { formatMoney } from '@/lib/pricing';
import { fmt } from '@/lib/export';
import { todayStr, normalizeSpaces } from '@/lib/dates';

const TABS = [
  { value: 'valuacion',  label: 'Valuación',  icon: DollarSign },
  { value: 'bajo',       label: 'Bajo mínimo', icon: AlertTriangle },
  { value: 'kardex',     label: 'Kardex',     icon: BookOpen },
];

const MOVEMENT_LABELS = {
  entrada:    'Entrada',
  salida:     'Salida',
  ajuste:     'Ajuste',
  venta:      'Venta',
  devolucion: 'Devolución',
};

const MOVEMENT_COLORS = {
  entrada:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  salida:     'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  ajuste:     'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  venta:      'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  devolucion: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
};

// ---------------------------------------------------------------------------

export default function InventoryReport({
  valuation, byCategory, products, selectedProductId, kardex, error,
}) {
  const router = useRouter();
  const [tab, setTab] = useState(selectedProductId ? 'kardex' : 'valuacion');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Totales
  const totals = useMemo(() => {
    const active = valuation.filter((v) => v.active);
    return {
      sku:          active.length,
      units:        active.reduce((a, v) => a + Number(v.stock || 0), 0),
      cost:         active.reduce((a, v) => a + Number(v.stock_cost_usd || 0), 0),
      value:        active.reduce((a, v) => a + Number(v.stock_value_usd || 0), 0),
      potential:    active.reduce((a, v) => a + Number(v.potential_profit_usd || 0), 0),
      lowStock:     active.filter((v) => v.is_low_stock).length,
    };
  }, [valuation]);

  const lowStockItems = useMemo(
    () => valuation.filter((v) => v.is_low_stock && v.active),
    [valuation]
  );

  const filteredValuation = useMemo(() => {
    const q = search.trim().toLowerCase();
    return valuation.filter((v) => {
      if (!v.active) return false;
      if (categoryFilter !== 'all' && v.category_id !== categoryFilter) return false;
      if (q) {
        const haystack = `${v.name} ${v.sku || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [valuation, search, categoryFilter]);

  const categoryOptions = useMemo(() => {
    const seen = new Map();
    for (const v of valuation) {
      if (v.category_id && !seen.has(v.category_id)) {
        seen.set(v.category_id, v.category_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [valuation]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  function onProductChange(productId) {
    const params = new URLSearchParams();
    if (productId) params.set('product', productId);
    router.push(`/reportes/inventario?${params.toString()}`);
  }

  // Exports según tab
  const exportsConfig = useMemo(() => {
    if (tab === 'valuacion') {
      return buildExports({
        slug: 'inventario-valuacion',
        title: 'Reporte de Inventario — Valuación',
        rows: filteredValuation,
        columns: [
          { key: 'sku',                  label: 'SKU' },
          { key: 'name',                 label: 'Producto' },
          { key: 'category_name',        label: 'Categoría' },
          { key: 'stock',                label: 'Stock',    align: 'right', fmt: (v) => fmt.num(v, 2) },
          { key: 'cost_avg',             label: 'Costo prom', align: 'right', fmt: formatMoney },
          { key: 'price_usd',            label: 'Precio',   align: 'right', fmt: formatMoney },
          { key: 'stock_cost_usd',       label: 'Costo total', align: 'right', fmt: formatMoney },
          { key: 'stock_value_usd',      label: 'Valor venta', align: 'right', fmt: formatMoney },
          { key: 'potential_profit_usd', label: 'Ganancia potencial', align: 'right', fmt: formatMoney },
        ],
      });
    }
    if (tab === 'bajo') {
      return buildExports({
        slug: 'inventario-bajo-minimo',
        title: 'Reporte de Inventario — Bajo mínimo',
        rows: lowStockItems,
        columns: [
          { key: 'sku',           label: 'SKU' },
          { key: 'name',          label: 'Producto' },
          { key: 'category_name', label: 'Categoría' },
          { key: 'stock',         label: 'Stock actual', align: 'right', fmt: (v) => fmt.num(v, 2) },
          { key: 'min_stock',     label: 'Stock mínimo', align: 'right', fmt: (v) => fmt.num(v, 2) },
          { key: 'cost_avg',      label: 'Costo prom',   align: 'right', fmt: formatMoney },
        ],
      });
    }
    if (tab === 'kardex' && selectedProduct) {
      return buildExports({
        slug: `kardex-${selectedProduct.sku || 'producto'}`,
        title: `Kardex — ${selectedProduct.name}`,
        subtitle: selectedProduct.sku ? `SKU ${selectedProduct.sku}` : undefined,
        rows: kardex,
        columns: [
          { key: 'created_at',     label: 'Fecha',      fmt: fmt.datetime },
          { key: 'movement_type',  label: 'Tipo',       fmt: (v) => MOVEMENT_LABELS[v] || v },
          { key: 'quantity',       label: 'Cantidad',   align: 'right', fmt: (v) => fmt.num(v, 2) },
          { key: 'balance_after',  label: 'Saldo',      align: 'right', fmt: (v) => fmt.num(v, 2) },
          { key: 'unit_cost_usd',  label: 'Costo unit', align: 'right', fmt: formatMoney },
          { key: 'reference_type', label: 'Referencia' },
          { key: 'notes',          label: 'Notas' },
        ],
      });
    }
    return null;
  }, [tab, filteredValuation, lowStockItems, kardex, selectedProduct]);

  return (
    <div className="space-y-6">
      <ReportToolbar
        title="Reporte de Inventario"
        subtitle="Valuación de stock, productos bajo mínimo y kardex"
        exports={exportsConfig}
      />

      {error && <MigrationErrorBanner error={error} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="SKUs activos"
          value={totals.sku}
          hint={`${fmt.int(totals.units)} unidades`}
          icon={Package}
          accent="brand"
        />
        <KPICard
          label="Valor a costo"
          value={formatMoney(totals.cost)}
          hint="Inversión en stock"
          icon={DollarSign}
          accent="violet"
        />
        <KPICard
          label="Valor a precio"
          value={formatMoney(totals.value)}
          hint={`Potencial ${formatMoney(totals.potential)}`}
          icon={TrendingUp}
          accent="emerald"
        />
        <KPICard
          label="Bajo mínimo"
          value={totals.lowStock}
          hint="Productos a reordenar"
          icon={AlertTriangle}
          accent={totals.lowStock > 0 ? 'amber' : 'emerald'}
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

      {tab === 'valuacion' && (
        <ValuacionTab
          rows={filteredValuation}
          byCategory={byCategory}
          search={search}
          onSearch={setSearch}
          categoryOptions={categoryOptions}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
        />
      )}
      {tab === 'bajo' && <BajoMinimoTab items={lowStockItems} />}
      {tab === 'kardex' && (
        <KardexTab
          products={products}
          selectedProductId={selectedProductId}
          onProductChange={onProductChange}
          kardex={kardex}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ValuacionTab({
  rows, byCategory, search, onSearch, categoryOptions, categoryFilter, onCategoryChange,
}) {
  const chartData = byCategory
    .map((c) => ({
      name: c.category_name,
      Costo: Number(c.total_cost_usd || 0),
      Venta: Number(c.total_value_usd || 0),
    }))
    .sort((a, b) => b.Venta - a.Venta);

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Valuación por categoría
        </h3>
        {chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">
            Sin datos de inventario.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => formatMoney(v)} />
                <Bar dataKey="Costo" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Venta" fill="#0284c7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-3 p-3 print:hidden">
        <input
          type="text"
          placeholder="Buscar por SKU o nombre..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="input min-w-[200px] flex-1"
        />
        <select
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="input w-auto"
        >
          <option value="all">Todas las categorías</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Detalle por producto ({rows.length})
          </h3>
        </div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Sin productos con los filtros aplicados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Costo prom</th>
                  <th className="px-4 py-3 text-right">Precio</th>
                  <th className="px-4 py-3 text-right">Costo total</th>
                  <th className="px-4 py-3 text-right">Valor venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {rows.map((r) => (
                  <tr key={r.product_id} className="text-sm">
                    <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.sku || '—'}</td>
                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        {r.name}
                        {r.is_low_stock && (
                          <AlertTriangle className="h-3 w-3 text-amber-500" title="Bajo mínimo" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{r.category_name || '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmt.num(r.stock, 2)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(r.cost_avg)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(r.price_usd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(r.stock_cost_usd)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatMoney(r.stock_value_usd)}</td>
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

function BajoMinimoTab({ items }) {
  if (items.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Boxes className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Todos los productos están sobre su stock mínimo.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Productos bajo o en mínimo ({items.length})
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Reordenar próximamente
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Stock actual</th>
              <th className="px-4 py-3 text-right">Stock mínimo</th>
              <th className="px-4 py-3 text-right">Falta</th>
              <th className="px-4 py-3 text-right">Costo prom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {items.map((r) => {
              const falta = Math.max(0, Number(r.min_stock || 0) - Number(r.stock || 0));
              return (
                <tr key={r.product_id} className="text-sm">
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.sku || '—'}</td>
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{r.category_name || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-rose-600 dark:text-rose-400">
                    {fmt.num(r.stock, 2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {fmt.num(r.min_stock, 2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-600 dark:text-amber-400">
                    {fmt.num(falta, 2)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {formatMoney(r.cost_avg)}
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

function KardexTab({ products, selectedProductId, onProductChange, kardex }) {
  return (
    <div className="space-y-4">
      <div className="card p-4 print:hidden">
        <label className="label">Producto</label>
        <select
          value={selectedProductId || ''}
          onChange={(e) => onProductChange(e.target.value)}
          className="input"
        >
          <option value="">Selecciona un producto...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku ? `${p.sku} — ` : ''}{p.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedProductId ? (
        <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Selecciona un producto arriba para ver su kardex (últimos 200 movimientos).
        </div>
      ) : kardex.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Este producto no tiene movimientos registrados.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Movimientos ({kardex.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Costo unit</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {kardex.map((m) => {
                  const positive = Number(m.quantity) >= 0;
                  const cls = MOVEMENT_COLORS[m.movement_type] || '';
                  return (
                    <tr key={m.id} className="text-sm">
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{fmt.datetime(m.created_at)}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
                          {MOVEMENT_LABELS[m.movement_type] || m.movement_type}
                        </span>
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${
                        positive
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}>
                        {positive ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />}{' '}
                        {fmt.num(Math.abs(Number(m.quantity)), 2)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                        {fmt.num(m.balance_after, 2)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {m.unit_cost_usd ? formatMoney(m.unit_cost_usd) : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                        {m.profiles?.full_name || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {m.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function buildExports({ slug, title, subtitle, rows, columns }) {
  const today = todayStr();
  const filename = `${slug}-${today}`;
  return {
    csv: { filename, columns, rows },
    pdf: {
      filename,
      title,
      subtitle: subtitle || `Generado el ${normalizeSpaces(new Date().toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }))}`,
      meta: [['Filas', rows.length]],
      tables: [{ columns, rows }],
      orientation: columns.length > 5 ? 'landscape' : 'portrait',
    },
  };
}
