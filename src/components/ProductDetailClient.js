'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowLeft, Package, ShoppingBag, DollarSign, TrendingUp, Hash,
  Truck, Boxes, AlertTriangle, FileText, Receipt, Tag,
} from 'lucide-react';
import KPICard from './KPICard';
import ProductHistoryChart from './ProductHistoryChart';
import { formatMoney } from '@/lib/pricing';

const MOVEMENT_LABELS = {
  entrada: { label: 'Entrada', cls: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400' },
  salida: { label: 'Salida', cls: 'text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400' },
  ajuste: { label: 'Ajuste', cls: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400' },
  venta: { label: 'Venta', cls: 'text-sky-700 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-400' },
  devolucion: { label: 'Devolución', cls: 'text-violet-700 bg-violet-50 dark:bg-violet-500/10 dark:text-violet-400' },
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Caracas',
  });
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Caracas',
  }).replace(/[   ]/g, ' ');
}

function formatQty(qty, unit) {
  const n = Number(qty || 0);
  return `${n.toLocaleString('es-VE', { maximumFractionDigits: 3 })} ${unit || 'unid.'}`;
}

export default function ProductDetailClient({
  product,
  saleItems,
  purchaseItems,
  movements,
  role,
}) {
  const [tab, setTab] = useState('ventas');
  const showCosts = role === 'admin' || role === 'supervisor';

  // KPIs agregados a partir del histórico de ventas.
  // IMPORTANTE: las ventas anuladas se descartan — su stock fue devuelto al
  // inventario por la función void_sale, así que para fines contables esos
  // ingresos y ese costo nunca ocurrieron.
  const kpis = useMemo(() => {
    let unitsSold = 0;
    let revenue = 0;
    let costTotal = 0;
    const seenSales = new Set();

    for (const item of saleItems) {
      if (item.sales?.status !== 'completada') continue;
      const qty = Number(item.quantity) || 0;
      unitsSold += qty;
      revenue += Number(item.line_total_usd) || 0;
      costTotal += qty * (Number(item.unit_cost_usd) || 0);
      if (item.sales?.id) seenSales.add(item.sales.id);
    }
    const profit = revenue - costTotal;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

    return {
      unitsSold,
      revenue,
      profit,
      marginPct,
      txCount: seenSales.size,
    };
  }, [saleItems]);

  const lowStock = Number(product.stock) <= Number(product.min_stock || 0) && Number(product.min_stock) > 0;
  const negativeMargin =
    showCosts &&
    Number(product.cost_avg) > 0 &&
    Number(product.price_usd) > 0 &&
    Number(product.price_usd) < Number(product.cost_avg);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/productos"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a productos
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {product.name}
              </h1>
              {!product.active && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Inactivo
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              {product.sku && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Hash className="h-3.5 w-3.5" />
                  {product.sku}
                </span>
              )}
              {product.categories?.name && (
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  {product.categories.name}
                </span>
              )}
            </div>
          </div>

          {/* Avisos en línea */}
          <div className="flex flex-wrap gap-2">
            {lowStock && (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Stock bajo el mínimo
              </div>
            )}
            {negativeMargin && (
              <div className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Margen negativo
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Unidades vendidas"
          value={kpis.unitsSold.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
          hint={`En ${kpis.txCount} ventas`}
          icon={ShoppingBag}
          accent="brand"
        />
        <KPICard
          label="Ingresos totales"
          value={formatMoney(kpis.revenue)}
          hint="USD acumulado"
          icon={DollarSign}
          accent="emerald"
        />
        {showCosts ? (
          <>
            <KPICard
              label="Ganancia"
              value={formatMoney(kpis.profit)}
              hint="Ingresos − costo"
              icon={TrendingUp}
              accent={kpis.profit >= 0 ? 'violet' : 'rose'}
            />
            <KPICard
              label="Margen promedio"
              value={`${kpis.marginPct.toFixed(1)}%`}
              hint="Sobre ingresos"
              icon={TrendingUp}
              accent={kpis.marginPct >= 0 ? 'emerald' : 'rose'}
            />
          </>
        ) : (
          <>
            <KPICard
              label="Stock actual"
              value={`${Number(product.stock).toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
              hint={product.unit || 'unidades'}
              icon={Boxes}
              accent={lowStock ? 'amber' : 'emerald'}
            />
            <KPICard
              label="Precio actual"
              value={formatMoney(product.price_usd)}
              hint="USD"
              icon={DollarSign}
              accent="brand"
            />
          </>
        )}
      </div>

      {/* Info + Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tarjeta de información */}
        <div className="card p-5 lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Package className="h-4 w-4" />
            Información del producto
          </h2>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Stock actual</dt>
              <dd className={`font-semibold ${lowStock ? 'text-amber-600 dark:text-amber-500' : 'text-slate-900 dark:text-slate-100'}`}>
                {Number(product.stock).toLocaleString('es-VE', { maximumFractionDigits: 3 })} {product.unit}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Stock mínimo</dt>
              <dd className="font-medium text-slate-700 dark:text-slate-300">
                {Number(product.min_stock).toLocaleString('es-VE', { maximumFractionDigits: 3 })} {product.unit}
              </dd>
            </div>

            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Precio USD</dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                {formatMoney(product.price_usd, 'USD')}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Precio VES</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">
                {formatMoney(product.price_ves, 'VES')}
              </dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Precio COP</dt>
              <dd className="font-mono text-slate-700 dark:text-slate-300">
                {formatMoney(product.price_cop, 'COP')}
              </dd>
            </div>

            {showCosts && (
              <>
                <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <dt className="text-slate-500 dark:text-slate-400">Costo promedio</dt>
                  <dd className={`font-mono font-semibold ${negativeMargin ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                    {formatMoney(product.cost_avg)}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <dt className="text-slate-500 dark:text-slate-400">Margen objetivo</dt>
                  <dd className="font-medium text-slate-700 dark:text-slate-300">
                    {Number(product.target_margin).toFixed(1)}%
                  </dd>
                </div>
              </>
            )}

            <div className="flex justify-between text-xs">
              <dt className="text-slate-400 dark:text-slate-500">Creado</dt>
              <dd className="text-slate-500 dark:text-slate-400">{formatDate(product.created_at)}</dd>
            </div>
          </dl>
        </div>

        {/* Gráfico de evolución */}
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <TrendingUp className="h-4 w-4" />
                Evolución de precio y costo
              </h2>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Snapshot de cada venta y compra (últimos 12 meses, USD)
              </p>
            </div>
          </div>
          <ProductHistoryChart
            salePoints={saleItems
              .filter((it) => it.sales?.status === 'completada')
              .map((it) => ({
                created_at: it.created_at,
                unit_price_usd: it.unit_price_usd,
              }))}
            purchasePoints={
              showCosts
                ? purchaseItems.map((it) => ({
                    created_at: it.created_at,
                    unit_cost_usd: it.unit_cost_usd,
                  }))
                : []
            }
          />
        </div>
      </div>

      {/* Tabs de historial */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 dark:border-slate-700">
          <TabBtn active={tab === 'ventas'} onClick={() => setTab('ventas')} icon={Receipt}>
            Historial de ventas
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {saleItems.length}
            </span>
          </TabBtn>

          {showCosts && (
            <TabBtn active={tab === 'compras'} onClick={() => setTab('compras')} icon={Truck}>
              Compras
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {purchaseItems.length}
              </span>
            </TabBtn>
          )}

          {showCosts && (
            <TabBtn active={tab === 'kardex'} onClick={() => setTab('kardex')} icon={FileText}>
              Kardex
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {movements.length}
              </span>
            </TabBtn>
          )}
        </div>

        {tab === 'ventas' && (
          <SalesTable items={saleItems} unit={product.unit} showCosts={showCosts} />
        )}
        {tab === 'compras' && showCosts && (
          <PurchasesTable items={purchaseItems} unit={product.unit} />
        )}
        {tab === 'kardex' && showCosts && (
          <KardexTable items={movements} unit={product.unit} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition ${
        active
          ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function SalesTable({ items, unit, showCosts }) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
        Este producto aún no tiene ventas registradas.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <Th>Fecha</Th>
            <Th>Factura</Th>
            <Th>Cajero</Th>
            <Th align="right">Cantidad</Th>
            <Th align="right">Precio unit.</Th>
            {showCosts && <Th align="right">Costo unit.</Th>}
            <Th align="right">Total</Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
          {items.map((it) => {
            const sale = it.sales || {};
            const voided = sale.status === 'anulada';
            return (
              <tr
                key={it.id}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${voided ? 'opacity-60' : ''}`}
              >
                <Td>{formatDateTime(it.created_at)}</Td>
                <Td className="font-mono">
                  #{String(sale.invoice_number || 0).padStart(6, '0')}
                </Td>
                <Td className="text-slate-600 dark:text-slate-400">
                  {sale.profiles?.full_name || '—'}
                </Td>
                <Td align="right">{formatQty(it.quantity, unit)}</Td>
                <Td align="right" className="font-mono">{formatMoney(it.unit_price_usd)}</Td>
                {showCosts && (
                  <Td align="right" className="font-mono text-slate-500 dark:text-slate-400">
                    {formatMoney(it.unit_cost_usd)}
                  </Td>
                )}
                <Td align="right" className="font-mono font-semibold">{formatMoney(it.line_total_usd)}</Td>
                <Td>
                  {voided ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                      Anulada
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      Completada
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PurchasesTable({ items, unit }) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
        Este producto aún no tiene compras registradas.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <Th>Fecha</Th>
            <Th>Referencia</Th>
            <Th>Proveedor</Th>
            <Th align="right">Cantidad</Th>
            <Th align="right">Costo unit.</Th>
            <Th align="right">Total</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
          {items.map((it) => {
            const p = it.purchases || {};
            return (
              <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <Td>{formatDate(p.purchase_date || it.created_at)}</Td>
                <Td className="font-mono text-slate-600 dark:text-slate-400">{p.reference || '—'}</Td>
                <Td>{p.suppliers?.name || '—'}</Td>
                <Td align="right">{formatQty(it.quantity, unit)}</Td>
                <Td align="right" className="font-mono">{formatMoney(it.unit_cost_usd)}</Td>
                <Td align="right" className="font-mono font-semibold">{formatMoney(it.line_total_usd)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KardexTable({ items, unit }) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">
        Aún no hay movimientos de inventario para este producto.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <Th>Fecha</Th>
            <Th>Tipo</Th>
            <Th align="right">Cantidad</Th>
            <Th align="right">Saldo</Th>
            <Th align="right">Costo unit.</Th>
            <Th>Notas</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
          {items.map((m) => {
            const meta = MOVEMENT_LABELS[m.movement_type] || { label: m.movement_type, cls: 'text-slate-700 bg-slate-100' };
            const qty = Number(m.quantity);
            return (
              <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <Td>{formatDateTime(m.created_at)}</Td>
                <Td>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                </Td>
                <Td
                  align="right"
                  className={`font-mono ${qty > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
                >
                  {qty > 0 ? '+' : ''}{formatQty(qty, unit)}
                </Td>
                <Td align="right" className="font-mono font-semibold">
                  {formatQty(m.balance_after, unit)}
                </Td>
                <Td align="right" className="font-mono text-slate-500 dark:text-slate-400">
                  {m.unit_cost_usd ? formatMoney(m.unit_cost_usd) : '—'}
                </Td>
                <Td className="text-slate-500 dark:text-slate-400">{m.notes || '—'}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400`}
    >
      {children}
    </th>
  );
}

function Td({ children, align = 'left', className = '' }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-${align} text-sm text-slate-900 dark:text-slate-100 ${className}`}>
      {children}
    </td>
  );
}