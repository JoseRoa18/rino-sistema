'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Home, Plus, DollarSign, Package, Calendar, Trophy, AlertTriangle,
  ChevronDown, ChevronRight, Trash2, BarChart3,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import KPICard from './KPICard';
import PageHeader from './PageHeader';
import FamilyConsumptionForm from './FamilyConsumptionForm';
import { formatMoney } from '@/lib/pricing';
import {
  registerFamilyConsumptionAction,
  voidFamilyConsumptionAction,
} from '@/app/(dashboard)/familia/actions';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function FamilyClient({
  kpis, daily, topProducts, recentConsumptions, products, role, error,
}) {
  const router = useRouter();
  const [formOpen, setFormOpen]   = useState(false);
  const [expanded, setExpanded]   = useState(null);   // sale_id expandido
  const [actionError, setActionError] = useState('');

  // Chart de últimos 30 días (sumando por día)
  const chartData = useMemo(() => {
    const sorted = [...daily].sort((a, b) => new Date(a.day) - new Date(b.day));
    return sorted.slice(-30).map((d) => ({
      day: new Date(`${d.day}T12:00:00`).toLocaleDateString('es-VE', {
        day: '2-digit', month: 'short',
      }),
      cost: Number(d.cost_usd || 0),
    }));
  }, [daily]);

  async function handleSave(payload) {
    setActionError('');
    const result = await registerFamilyConsumptionAction(payload);
    if (!result.ok) return result;
    setFormOpen(false);
    router.refresh();
    return result;
  }

  async function handleVoid(saleId, invoice) {
    setActionError('');
    const reason = window.prompt(
      `Anular consumo #${invoice}?\n\nMotivo de la anulación:`,
      'Error de registro'
    );
    if (!reason || reason.trim().length < 3) return;
    const result = await voidFamilyConsumptionAction(saleId, reason.trim());
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    router.refresh();
  }

  const hasConsumption = recentConsumptions.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Consumo familiar"
        subtitle="Control interno de productos del negocio destinados al consumo familiar"
        actions={
          <button onClick={() => setFormOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Registrar consumo
          </button>
        }
      />

      {/* Banner explicativo */}
      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
        <Home className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <strong>¿Cómo funciona?</strong> Cada consumo descuenta del stock real
          y queda en el kardex, pero se factura a <strong>precio costo</strong> y
          <strong> no entra en los reportes financieros</strong> (ventas, ganancias,
          P&amp;L). Sí afecta los reportes de inventario y forecasting para que sepas
          cuándo reponer.
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">No se pudieron cargar todos los datos.</p>
            <p className="text-xs">
              Error: <code className="rounded bg-rose-100 px-1 dark:bg-rose-500/20">{error}</code>
            </p>
            <p className="text-xs">
              Verifica que la migración{' '}
              <code className="rounded bg-rose-100 px-1 dark:bg-rose-500/20">
                011_family_module.sql
              </code>{' '}
              esté aplicada en Supabase.
            </p>
          </div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Consumo del mes"
          value={formatMoney(kpis.cost_month_usd)}
          hint={`${kpis.consumption_count_month || 0} registros`}
          icon={DollarSign}
          accent="sky"
        />
        <KPICard
          label="Consumo del año"
          value={formatMoney(kpis.cost_year_usd)}
          hint="acumulado anual"
          icon={Calendar}
          accent="brand"
        />
        <KPICard
          label="Hoy"
          value={formatMoney(kpis.cost_today_usd)}
          hint={
            kpis.last_consumption_at
              ? `Último: ${fmtDate(kpis.last_consumption_at)}`
              : 'Sin consumos hoy'
          }
          icon={Home}
          accent="emerald"
        />
        <KPICard
          label="Productos del mes"
          value={kpis.unique_products_month || 0}
          hint="SKUs únicos consumidos"
          icon={Package}
          accent="amber"
        />
      </div>

      {/* Chart + Top productos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart */}
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Consumo diario (últimos 30 días)
            </h3>
          </div>
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              Aún no hay consumos registrados.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Bar dataKey="cost" name="Costo" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top productos */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Más consumidos
            </h3>
          </div>
          {topProducts.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Sin consumos aún.</p>
          ) : (
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
              {topProducts.slice(0, 8).map((p, i) => (
                <li key={p.product_id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-sky-100 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {p.product_name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {Number(p.units_consumed).toFixed(0)} {p.unit || 'u'} · {p.times_consumed} veces
                    </div>
                  </div>
                  <div className="text-right tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(p.cost_usd)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Historial de consumos
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Últimos 30 registros — haz click en una fila para ver detalle
          </p>
        </div>
        {!hasConsumption ? (
          <div className="p-8 text-center">
            <Home className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aún no hay consumos familiares registrados.
            </p>
            <button
              onClick={() => setFormOpen(true)}
              className="btn-primary mt-3"
            >
              <Plus className="h-4 w-4" />
              Registrar el primero
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-4 py-2.5"></th>
                  <th className="px-4 py-2.5">Folio</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Registró</th>
                  <th className="px-4 py-2.5">Notas</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Costo total</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {recentConsumptions.map((s) => {
                  const isOpen = expanded === s.id;
                  const items = s.sale_items || [];
                  const isVoided = s.status === 'anulada';
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : s.id)}
                        className={`cursor-pointer text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                          isVoided ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-2 text-slate-400">
                          {isOpen
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                          #{s.invoice_number}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {fmtDateTime(s.created_at)}
                        </td>
                        <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                          {s.profiles?.full_name || '—'}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                          {s.notes || '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {items.length}
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-medium ${
                            isVoided
                              ? 'text-slate-400 line-through'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatMoney(s.total_usd)}
                        </td>
                        <td className="px-4 py-2">
                          {isVoided ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
                              Anulada
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                              Registrada
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {!isVoided && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVoid(s.id, s.invoice_number);
                              }}
                              className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                              title="Anular consumo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                            <div className="space-y-2">
                              {isVoided && s.void_reason && (
                                <div className="rounded bg-rose-100 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                                  <strong>Motivo de anulación:</strong> {s.void_reason}
                                  {s.voided_at && (
                                    <span className="ml-1 text-rose-600 dark:text-rose-400">
                                      ({fmtDateTime(s.voided_at)})
                                    </span>
                                  )}
                                </div>
                              )}
                              {items.length === 0 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Sin items registrados.
                                </p>
                              ) : (
                                <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white text-xs dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                                  {items.map((it) => (
                                    <li
                                      key={it.id}
                                      className="flex items-center justify-between px-3 py-2"
                                    >
                                      <span className="text-slate-700 dark:text-slate-300">
                                        {it.product_name} · {Number(it.quantity).toFixed(2)} u
                                      </span>
                                      <span className="tabular-nums text-slate-600 dark:text-slate-400">
                                        {formatMoney(it.unit_cost_usd)} c/u ={' '}
                                        <strong>{formatMoney(it.line_total_usd)}</strong>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <FamilyConsumptionForm
          products={products}
          onClose={() => setFormOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
