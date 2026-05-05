'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Boxes, AlertTriangle, DollarSign, TrendingUp, Plus,
  Search, Settings2, ExternalLink, ShoppingCart, Sparkles,
} from 'lucide-react';
import KPICard from './KPICard';
import InventoryAdjustModal from './InventoryAdjustModal';
import { formatMoney } from '@/lib/pricing';

const STATUS_META = {
  sin_stock:       { label: 'Sin stock',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  critico:         { label: 'Crítico',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  bajo_minimo:     { label: 'Bajo mínimo',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  saludable:       { label: 'Saludable',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  sin_movimiento:  { label: 'Sin movimiento', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
};

const ABC_META = {
  A: { cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
       hint: 'Top 80% de ingresos' },
  B: { cls: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/30',
       hint: 'Siguiente 15%' },
  C: { cls: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
       hint: 'Cola del 5%' },
};

export default function InventoryClient({ initialItems, categories, suppliers, role }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [adjustTarget, setAdjustTarget] = useState(null);

  const isAdmin = role === 'admin';

  // Sincronizar items con el prop cuando router.refresh() trae datos frescos
  // del servidor. Sin esto, el state local se queda congelado en initialItems
  // y los ajustes no se reflejan hasta un F5 manual.
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // Update optimista: aplica el cambio de stock al item correspondiente
  // INMEDIATAMENTE, sin esperar el roundtrip al servidor. Recalcula también
  // status, días restantes y valor del inventario para que las celdas
  // derivadas se actualicen consistentes.
  function applyOptimisticStock(productId, newStock) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.product_id !== productId) return it;

        const stock = Number(newStock) || 0;
        const cost = Number(it.cost_avg) || 0;
        const vel = Number(it.avg_daily_units) || 0;
        const minStock = Number(it.min_stock) || 0;

        // Días restantes: stock / velocidad (null si nunca se ha vendido)
        let days = null;
        if (stock <= 0) days = 0;
        else if (vel > 0) days = Math.round((stock / vel) * 10) / 10;

        // Recalcular estado con la misma lógica de la vista SQL
        let status;
        if (stock <= 0) status = 'sin_stock';
        else if (vel === 0) status = 'sin_movimiento';
        else if (stock <= minStock) status = 'bajo_minimo';
        else if (days !== null && days <= 7) status = 'critico';
        else status = 'saludable';

        return {
          ...it,
          stock,
          inventory_value_usd: Math.round(stock * cost * 100) / 100,
          days_remaining: days,
          status,
        };
      })
    );
  }

  // KPIs globales (sobre todos los items, sin filtros)
  const kpis = useMemo(() => {
    let total = 0, noStock = 0, lowStock = 0, value = 0;
    for (const it of items) {
      total += 1;
      if (Number(it.stock) <= 0) noStock += 1;
      else if (Number(it.stock) <= Number(it.min_stock)) lowStock += 1;
      value += Number(it.inventory_value_usd) || 0;
    }
    return { total, noStock, lowStock, value };
  }, [items]);

  // Productos en alerta de reorden (bajo mínimo o críticos por días restantes)
  const reorderUrgent = useMemo(
    () => items.filter((it) => it.status === 'sin_stock' || it.status === 'bajo_minimo' || it.status === 'critico'),
    [items]
  );

  const categoryById = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  // Filtro base sin categoría (para conteos de chips)
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (q && !(it.name.toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, search, statusFilter]);

  const categoryCounts = useMemo(() => {
    const map = new Map();
    map.set('all', baseFiltered.length);
    for (const it of baseFiltered) {
      if (it.category_id) map.set(it.category_id, (map.get(it.category_id) || 0) + 1);
    }
    return map;
  }, [baseFiltered]);

  const filtered = useMemo(() => {
    if (categoryId === 'all') return baseFiltered;
    return baseFiltered.filter((it) => it.category_id === categoryId);
  }, [baseFiltered, categoryId]);

  // Refrescar después de un ajuste exitoso.
  // 1) Aplica el cambio en local INMEDIATAMENTE (con el resultado de la RPC).
  // 2) Cierra el modal.
  // 3) Pide al servidor datos frescos para sincronizar columnas derivadas
  //    que dependen de agregaciones (velocidad, ABC, KPIs combinados, etc.).
  function handleAdjusted(result) {
    if (result?.product_id && result?.new_stock !== undefined) {
      applyOptimisticStock(result.product_id, result.new_stock);
    }
    setAdjustTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Inventario</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control de stock, valor del inventario y proyecciones de reorden
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventario/compras/nueva" className="btn-primary">
            <ShoppingCart className="h-4 w-4" />
            Nueva compra
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Productos activos"
          value={kpis.total.toLocaleString('es-VE')}
          hint="En el catálogo"
          icon={Boxes}
          accent="brand"
        />
        <KPICard
          label="Sin stock"
          value={kpis.noStock.toLocaleString('es-VE')}
          hint={`${kpis.total > 0 ? ((kpis.noStock / kpis.total) * 100).toFixed(0) : 0}% del catálogo`}
          icon={AlertTriangle}
          accent={kpis.noStock > 0 ? 'rose' : 'emerald'}
        />
        <KPICard
          label="Bajo mínimo"
          value={kpis.lowStock.toLocaleString('es-VE')}
          hint="A reordenar pronto"
          icon={AlertTriangle}
          accent={kpis.lowStock > 0 ? 'amber' : 'emerald'}
        />
        <KPICard
          label="Valor del inventario"
          value={formatMoney(kpis.value)}
          hint="A costo promedio"
          icon={DollarSign}
          accent="violet"
        />
      </div>

      {/* Banner de reorden urgente */}
      {reorderUrgent.length > 0 && (
        <div className="card border-l-4 border-l-amber-500 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                  {reorderUrgent.length} {reorderUrgent.length === 1 ? 'producto' : 'productos'} para reordenar
                </h2>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  Sin stock, bajo mínimo o con menos de 7 días de inventario al ritmo actual de venta.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStatusFilter('critico')}
              className="btn-secondary"
            >
              Ver lista filtrada
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input max-w-[180px]"
          >
            <option value="all">Todos los estados</option>
            <option value="sin_stock">Sin stock</option>
            <option value="bajo_minimo">Bajo mínimo</option>
            <option value="critico">Crítico (&lt;7 días)</option>
            <option value="saludable">Saludable</option>
            <option value="sin_movimiento">Sin movimiento</option>
          </select>
        </div>

        {categories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <CategoryChip
              active={categoryId === 'all'}
              count={categoryCounts.get('all') || 0}
              onClick={() => setCategoryId('all')}
            >
              Todas
            </CategoryChip>
            {categories.map((c) => {
              const n = categoryCounts.get(c.id) || 0;
              return (
                <CategoryChip
                  key={c.id}
                  active={categoryId === c.id}
                  count={n}
                  disabled={n === 0 && categoryId !== c.id}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </CategoryChip>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabla de inventario */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <Th>Producto</Th>
                <Th className="hidden lg:table-cell">Categoría</Th>
                <Th align="right">Stock</Th>
                <Th align="right" className="hidden md:table-cell">Mín</Th>
                <Th align="right" className="hidden md:table-cell">Vel/día</Th>
                <Th align="right" className="hidden lg:table-cell">Días</Th>
                <Th align="center" className="hidden xl:table-cell">ABC</Th>
                <Th>Estado</Th>
                <Th align="right" className="hidden md:table-cell">Costo</Th>
                <Th align="right" className="hidden lg:table-cell">Valor</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {filtered.map((it) => {
                const status = STATUS_META[it.status] || STATUS_META.sin_movimiento;
                const abc = it.abc_class ? ABC_META[it.abc_class] : null;
                const stockNum = Number(it.stock) || 0;
                const cat = categoryById.get(it.category_id);
                const days = it.days_remaining;
                const vel = Number(it.avg_daily_units) || 0;

                return (
                  <tr key={it.product_id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <Td>
                      <Link
                        href={`/productos/${it.product_id}`}
                        className="text-sm font-medium text-slate-900 hover:text-brand-700 dark:text-slate-100 dark:hover:text-brand-400"
                      >
                        {it.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {it.sku || '—'}
                      </div>
                    </Td>
                    <Td className="hidden lg:table-cell">
                      {cat ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {cat.name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <span className={`font-mono text-sm font-semibold ${
                        stockNum <= 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : stockNum <= Number(it.min_stock)
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}>
                        {stockNum.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                      </span>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">{it.unit || 'unid'}</div>
                    </Td>
                    <Td align="right" className="hidden md:table-cell font-mono text-sm text-slate-500 dark:text-slate-400">
                      {Number(it.min_stock || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                    </Td>
                    <Td align="right" className="hidden md:table-cell">
                      <span className="font-mono text-sm text-slate-600 dark:text-slate-300">
                        {vel > 0 ? vel.toFixed(2) : '—'}
                      </span>
                    </Td>
                    <Td align="right" className="hidden lg:table-cell">
                      {days === null || days === undefined ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <span className={`font-mono text-sm font-semibold ${
                          days <= 0 ? 'text-rose-600 dark:text-rose-400' :
                          days <= 7 ? 'text-amber-600 dark:text-amber-400' :
                          days <= 30 ? 'text-slate-700 dark:text-slate-300' :
                          'text-emerald-700 dark:text-emerald-400'
                        }`}>
                          {Number(days).toFixed(1)}
                        </span>
                      )}
                    </Td>
                    <Td align="center" className="hidden xl:table-cell">
                      {abc ? (
                        <span title={abc.hint} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${abc.cls}`}>
                          {it.abc_class}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </Td>
                    <Td align="right" className="hidden md:table-cell font-mono text-sm text-slate-500 dark:text-slate-400">
                      {formatMoney(it.cost_avg)}
                    </Td>
                    <Td align="right" className="hidden lg:table-cell font-mono text-sm text-slate-700 dark:text-slate-300">
                      {formatMoney(it.inventory_value_usd)}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setAdjustTarget(it)}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-500/10 dark:hover:text-brand-400"
                          title="Ajustar stock"
                        >
                          <Settings2 className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/productos/${it.product_id}`}
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                          title="Ver ficha del producto"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-sm text-slate-400 dark:text-slate-500">
                    Ningún producto coincide con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer informativo */}
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
          <span className="font-medium">Velocidad y días</span> se calculan con las ventas de los últimos 30 días (60% peso al promedio de los últimos 7 días, 40% al de 30 días).
          <span className="mx-2">·</span>
          <span className="font-medium">ABC</span>: A = top 80% de ingresos · B = siguiente 15% · C = último 5% · — = sin ventas en 30 días
        </div>
      </div>

      {/* Modal de ajuste */}
      {adjustTarget && (
        <InventoryAdjustModal
          product={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={handleAdjusted}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes locales
// ─────────────────────────────────────────────────────────────────────────────

function Th({ children, align = 'left', className = '' }) {
  return (
    <th className={`whitespace-nowrap px-3 py-3 text-${align} text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }) {
  return (
    <td className={`whitespace-nowrap px-3 py-3 text-${align} text-sm ${className}`}>
      {children}
    </td>
  );
}

function CategoryChip({ active, count, disabled = false, onClick, children }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition';
  if (active) {
    return (
      <button onClick={onClick} className={`${base} bg-brand-600 text-white shadow-sm hover:bg-brand-700`}>
        <span>{children}</span>
        <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
          {count}
        </span>
      </button>
    );
  }
  if (disabled) {
    return (
      <button
        onClick={onClick}
        disabled
        className={`${base} cursor-not-allowed bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-600`}
      >
        <span>{children}</span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400 dark:bg-slate-900 dark:text-slate-600">
          {count}
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700`}
    >
      <span>{children}</span>
      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        {count}
      </span>
    </button>
  );
}