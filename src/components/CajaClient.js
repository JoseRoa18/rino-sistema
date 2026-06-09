'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote, Smartphone, ArrowLeftRight, CreditCard, Clock, Receipt,
  Printer, Calendar, Users, DollarSign, Wallet, Lock, CheckCircle2,
} from 'lucide-react';
import { formatMoney, convertFromUsd } from '@/lib/pricing';
import { normalizeSpaces } from '@/lib/dates';
import KPICard from './KPICard';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';
import DayCloseDialog from './DayCloseDialog';

const PAYMENT_METHODS = [
  { value: 'efectivo',      label: 'Efectivo',      icon: Banknote,      color: 'emerald' },
  { value: 'pago_movil',    label: 'Pago móvil',    icon: Smartphone,    color: 'brand'   },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight, color: 'violet'  },
  { value: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard,    color: 'amber'   },
  { value: 'credito',       label: 'Crédito',       icon: Clock,         color: 'rose'    },
];

const COLOR_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  brand:   'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
  violet:  'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  rose:    'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
};

const BAR_COLORS = {
  emerald: 'bg-emerald-500 dark:bg-emerald-400',
  brand:   'bg-brand-500 dark:bg-brand-400',
  violet:  'bg-violet-500 dark:bg-violet-400',
  amber:   'bg-amber-500 dark:bg-amber-400',
  rose:    'bg-rose-500 dark:bg-rose-400',
};

export default function CajaClient({
  initialSales, initialSaleItems = [], role, cashiers, date, todayStr, rate,
  dailyClose: initialDailyClose,
}) {
  const router = useRouter();
  const [cashierFilter, setCashierFilter] = useState('all');
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [dailyClose, setDailyClose] = useState(initialDailyClose || null);

  const isCajero = role === 'cajero';
  const canCloseDay = role === 'admin' || role === 'supervisor';
  const isClosed = !!dailyClose;

  function changeDate(newDate) {
    router.push(`/caja?date=${newDate}`);
  }

  const filteredSales = useMemo(() => {
    if (cashierFilter === 'all') return initialSales;
    return initialSales.filter((s) => s.cashier_id === cashierFilter);
  }, [initialSales, cashierFilter]);

  // Totales por método de pago
  const byMethod = useMemo(() => {
    const result = {};
    for (const m of PAYMENT_METHODS) {
      result[m.value] = { count: 0, totalUsd: 0 };
    }
    for (const s of filteredSales) {
      const m = s.payment_method;
      if (!result[m]) result[m] = { count: 0, totalUsd: 0 };
      result[m].count++;
      result[m].totalUsd += Number(s.total_usd) || 0;
    }
    return result;
  }, [filteredSales]);

  // Totales por categoría (Ingresos venta · Ingresos costo · Ganancia)
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const it of initialSaleItems) {
      if (cashierFilter !== 'all' && it.cashier_id !== cashierFilter) continue;
      const key = it.category_name || 'Sin categoría';
      const entry = map.get(key) || {
        category_name: key,
        units_sold: 0, revenue_usd: 0, cogs_usd: 0, profit_usd: 0,
      };
      entry.units_sold  += Number(it.quantity) || 0;
      entry.revenue_usd += Number(it.line_total_usd) || 0;
      entry.cogs_usd    += Number(it.cost_total_usd) || 0;
      entry.profit_usd  += (Number(it.line_total_usd) || 0) - (Number(it.cost_total_usd) || 0);
      map.set(key, entry);
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        margin_pct: r.revenue_usd > 0 ? (r.profit_usd / r.revenue_usd) * 100 : 0,
      }))
      .sort((a, b) => b.revenue_usd - a.revenue_usd);
  }, [initialSaleItems, cashierFilter]);

  // Totales por cajero (solo si no es cajero)
  const byCashier = useMemo(() => {
    if (isCajero) return [];
    const map = new Map();
    for (const s of filteredSales) {
      const id = s.cashier_id;
      const name = s.profiles?.full_name || 'Desconocido';
      if (!map.has(id)) map.set(id, { id, name, count: 0, totalUsd: 0 });
      const entry = map.get(id);
      entry.count++;
      entry.totalUsd += Number(s.total_usd) || 0;
    }
    return Array.from(map.values()).sort((a, b) => b.totalUsd - a.totalUsd);
  }, [filteredSales, isCajero]);

  const totalUsd = filteredSales.reduce((acc, s) => acc + Number(s.total_usd || 0), 0);
  // Equivalentes USD→Bs./COP usados solo en el footer de la tabla por método
  const totalVes = convertFromUsd(totalUsd, 'VES', rate);
  const totalCop = convertFromUsd(totalUsd, 'COP', rate);

  // Recibido por moneda (paid_currency × paid_amount):
  //   - USD: aquí siempre es efectivo (no hay Zelle/transferencia USD operativa)
  //   - VES: aquí siempre es pago móvil / transferencia (nunca efectivo Bs.)
  //   - COP: aquí siempre es efectivo en pesos
  // El crédito no entra (no hay cobro inmediato).
  const receivedByCurrency = useMemo(() => {
    const r = { USD: 0, VES: 0, COP: 0 };
    for (const s of filteredSales) {
      if (s.payment_method === 'credito') continue;
      const cur = s.paid_currency;
      if (cur && r[cur] !== undefined) {
        r[cur] += Number(s.paid_amount) || 0;
      }
    }
    return r;
  }, [filteredSales]);

  const dateLabel = normalizeSpaces(
    new Date(`${date}T12:00:00-04:00`).toLocaleDateString('es-VE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Caracas',
    })
  );

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="print:hidden">
        <PageHeader
          title="Cierre de caja"
          subtitle="Resumen de ventas del día por método de pago"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handlePrint} className="btn-secondary">
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
              {canCloseDay && (
                isClosed ? (
                  <button
                    onClick={() => setCloseDialogOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Día cerrado · ver cierre
                  </button>
                ) : (
                  <button
                    onClick={() => setCloseDialogOpen(true)}
                    className="btn-primary"
                  >
                    <Lock className="h-4 w-4" />
                    Cerrar día
                  </button>
                )
              )}
            </div>
          }
        />
      </div>

      {/* Badge de estado del día */}
      {canCloseDay && isClosed && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 print:hidden">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-900 dark:text-emerald-200">
            <strong>Día cerrado</strong>
            {dailyClose.profiles?.full_name && (
              <> por <strong>{dailyClose.profiles.full_name}</strong></>
            )}
            <> el {normalizeSpaces(new Date(dailyClose.closed_at).toLocaleString('es-VE', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            }))}.</>
          </span>
          <span className="text-xs text-emerald-700/70 dark:text-emerald-400/70">
            Las ventas posteriores siguen registrándose normalmente pero quedan fuera de este snapshot.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="card p-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={date}
              max={todayStr}
              onChange={(e) => changeDate(e.target.value)}
              className="input w-auto"
            />
          </div>
          {!isCajero && cashiers.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              <select
                value={cashierFilter}
                onChange={(e) => setCashierFilter(e.target.value)}
                className="input w-auto"
              >
                <option value="all">Todos los cajeros</option>
                {cashiers.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Encabezado para impresión */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Cierre de caja</h1>
        <p className="text-sm capitalize">{dateLabel}</p>
        {!isCajero && cashierFilter !== 'all' && (
          <p className="text-sm">
            Cajero: {cashiers.find((c) => c.id === cashierFilter)?.full_name}
          </p>
        )}
      </div>

      {/* Resumen general */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="Total vendido"
          value={formatMoney(totalUsd)}
          hint={`${filteredSales.length} ${filteredSales.length === 1 ? 'venta' : 'ventas'}`}
          icon={DollarSign}
          accent="brand"
        />
        <KPICard
          label="Efectivo USD"
          value={formatMoney(receivedByCurrency.USD)}
          hint="Dólares en caja"
          icon={Wallet}
          accent="emerald"
        />
        <KPICard
          label="En Bs."
          value={`Bs. ${receivedByCurrency.VES.toLocaleString('es-VE', { maximumFractionDigits: 2 })}`}
          hint="Pago móvil / transferencia"
          icon={Smartphone}
          accent="sky"
        />
        <KPICard
          label="Efectivo COP"
          value={`$ ${receivedByCurrency.COP.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`}
          hint="Pesos en caja"
          icon={Banknote}
          accent="amber"
        />
      </div>

      {/* Desglose por método de pago */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Por método de pago
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Distribución del total vendido
          </p>
        </div>
        {filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No hay ventas registradas para este día"
            description="Selecciona otra fecha o espera a que se registren ventas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Método</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Trans.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total USD</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 print:hidden">% del total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Equiv. Bs.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Equiv. COP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {PAYMENT_METHODS.map((m) => {
                  const Ico = m.icon;
                  const data = byMethod[m.value] || { count: 0, totalUsd: 0 };
                  if (data.count === 0) return null;
                  const ves = convertFromUsd(data.totalUsd, 'VES', rate);
                  const cop = convertFromUsd(data.totalUsd, 'COP', rate);
                  const pct = totalUsd > 0 ? (data.totalUsd / totalUsd) * 100 : 0;
                  return (
                    <tr key={m.value} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-7 w-7 items-center justify-center rounded ${COLOR_CLASSES[m.color]}`}>
                            <Ico className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {m.label}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm text-slate-700 dark:text-slate-300">
                        {data.count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(data.totalUsd)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 print:hidden">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className={`h-full rounded-full ${BAR_COLORS[m.color]}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                        {ves.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                        {cop.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {filteredSales.length}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(totalUsd)}
                  </td>
                  <td className="px-4 py-3 print:hidden"></td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {totalVes.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {totalCop.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Por categoría */}
      {byCategory.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Por categoría
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ingresos a precio venta, costo, ganancia y margen
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Categoría</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Unidades</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Precio venta</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Precio costo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Ganancia</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {byCategory.map((c) => (
                  <tr key={c.category_name}>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {c.category_name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                      {Number(c.units_sold || 0).toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(c.revenue_usd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                      {formatMoney(c.cogs_usd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatMoney(c.profit_usd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-500 dark:text-slate-400">
                      {Number(c.margin_pct || 0).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-slate-100">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {Number(byCategory.reduce((s, c) => s + Number(c.units_sold || 0), 0))
                      .toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(byCategory.reduce((s, c) => s + Number(c.revenue_usd || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatMoney(byCategory.reduce((s, c) => s + Number(c.cogs_usd || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {formatMoney(byCategory.reduce((s, c) => s + Number(c.profit_usd || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100">
                    {(() => {
                      const rev = byCategory.reduce((s, c) => s + Number(c.revenue_usd || 0), 0);
                      const prof = byCategory.reduce((s, c) => s + Number(c.profit_usd || 0), 0);
                      return rev > 0 ? `${((prof / rev) * 100).toFixed(1)}%` : '—';
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Por cajero (solo admin/supervisor) */}
      {!isCajero && byCashier.length > 1 && cashierFilter === 'all' && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Por cajero
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Cajero</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Ventas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 print:hidden">% del total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {byCashier.map((c) => {
                  const pct = totalUsd > 0 ? (c.totalUsd / totalUsd) * 100 : 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {c.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm text-slate-700 dark:text-slate-300">
                        {c.count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 print:hidden">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                            <div
                              className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 w-10 text-right">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(c.totalUsd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {closeDialogOpen && canCloseDay && (
        <DayCloseDialog
          date={date}
          existingClose={dailyClose}
          onClose={() => setCloseDialogOpen(false)}
          onClosed={(result) => {
            setCloseDialogOpen(false);
            // El refresh trae el dailyClose fresco desde el server,
            // pero también actualizamos local para feedback inmediato.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
