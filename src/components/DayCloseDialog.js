'use client';

import { useEffect, useState } from 'react';
import {
  X, Lock, AlertTriangle, CheckCircle2, Printer, Calendar,
  DollarSign, TrendingUp, ShoppingBag, CreditCard, Receipt,
  Home, AlertCircle, Percent, Layers,
} from 'lucide-react';
import { formatMoney } from '@/lib/pricing';
import { normalizeSpaces } from '@/lib/dates';
import {
  getDailySummaryAction,
  closeDayAction,
} from '@/app/(dashboard)/caja/actions';

const PAYMENT_LABELS = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  pago_movil:    'Pago móvil',
  tarjeta:       'Tarjeta',
  credito:       'Crédito',
  mixto:         'Mixto',
};

const CURRENCY_LABELS = { USD: 'USD', COP: 'COP', VES: 'Bs.' };

export default function DayCloseDialog({
  date,
  existingClose,   // si el día ya está cerrado, pasamos el row guardado
  onClose,
  onClosed,
}) {
  const [summary, setSummary] = useState(existingClose || null);
  const [loading, setLoading] = useState(!existingClose);
  const [notes, setNotes]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState('');
  const isReadOnly = !!existingClose;

  // Si no hay cierre previo, traemos el preview vía RPC
  useEffect(() => {
    if (existingClose) return;
    let cancelled = false;
    (async () => {
      const result = await getDailySummaryAction(date);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
      } else {
        setSummary(result.summary);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date, existingClose]);

  // Escape para cerrar
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  async function handleConfirmClose() {
    setError('');
    setSubmitting(true);
    const result = await closeDayAction({ date, notes });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || 'No se pudo cerrar el día');
      return;
    }
    if (onClosed) onClosed(result);
  }

  function handlePrint() {
    window.print();
  }

  const formattedDate = normalizeSpaces(
    new Date(`${date}T12:00:00-04:00`).toLocaleDateString('es-VE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'America/Caracas',
    })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 print:relative print:inset-auto print:bg-transparent sm:items-center sm:p-4">
      <div className="card flex max-h-[95vh] w-full max-w-2xl flex-col print:max-h-none print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700 print:border-b-2">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              isReadOnly
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
            }`}>
              {isReadOnly ? <CheckCircle2 className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {isReadOnly ? 'Cierre del día' : 'Cerrar día'}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm capitalize text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                {formattedDate}
              </p>
              {isReadOnly && existingClose.profiles?.full_name && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Cerrado por <strong>{existingClose.profiles.full_name}</strong> ·{' '}
                  {normalizeSpaces(new Date(existingClose.closed_at).toLocaleString('es-VE', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    timeZone: 'America/Caracas',
                  }))}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 print:hidden"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              Calculando resumen del día...
            </div>
          ) : error && !summary ? (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : summary ? (
            <>
              {/* Banner informativo */}
              {!isReadOnly && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 print:hidden">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    El cierre guarda este resumen como referencia. <strong>No bloquea
                    ventas</strong> — si después se registra una venta del mismo día,
                    quedará fuera de este snapshot pero sí en /ventas.
                  </div>
                </div>
              )}

              {/* KPIs principales */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile
                  icon={DollarSign}
                  label="Ventas"
                  value={formatMoney(summary.revenue_usd)}
                  hint={`${summary.sales_count} transacciones`}
                  accent="brand"
                />
                <Tile
                  icon={TrendingUp}
                  label="Ganancia"
                  value={formatMoney(summary.profit_usd)}
                  hint={`Costo ${formatMoney(summary.cogs_usd)}`}
                  accent="emerald"
                />
                <Tile
                  icon={Percent}
                  label="Margen"
                  value={`${Number(summary.margin_pct).toFixed(1)}%`}
                  hint="bruto"
                  accent={
                    Number(summary.margin_pct) < 15 ? 'rose'
                    : Number(summary.margin_pct) < 25 ? 'amber'
                    : 'emerald'
                  }
                />
                <Tile
                  icon={AlertCircle}
                  label="Anuladas"
                  value={summary.voided_count}
                  hint={formatMoney(summary.voided_usd)}
                  accent={summary.voided_count > 0 ? 'amber' : 'slate'}
                />
              </div>

              {/* Por método de pago */}
              <Section title="Por método de pago" icon={Receipt}>
                {Array.isArray(summary.by_payment) && summary.by_payment.length > 0 ? (
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                        <th className="px-2 py-1.5 text-left font-medium">Método</th>
                        <th className="px-2 py-1.5 text-right font-medium">Ventas</th>
                        <th className="px-2 py-1.5 text-right font-medium">Total USD</th>
                        <th className="px-2 py-1.5 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_payment.map((p, i) => {
                        const pct = Number(summary.revenue_usd) > 0
                          ? (Number(p.total_usd) / Number(summary.revenue_usd)) * 100
                          : 0;
                        return (
                          <tr key={i} className="text-sm">
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                              {PAYMENT_LABELS[p.method] || p.method}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                              {p.count}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                              {formatMoney(p.total_usd)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                              {pct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-3 text-center text-xs text-slate-400">Sin ventas.</p>
                )}
              </Section>

              {/* Por moneda recibida */}
              <Section title="Por moneda recibida" icon={DollarSign}>
                {Array.isArray(summary.by_currency) && summary.by_currency.length > 0 ? (
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                        <th className="px-2 py-1.5 text-left font-medium">Moneda</th>
                        <th className="px-2 py-1.5 text-right font-medium">Ventas</th>
                        <th className="px-2 py-1.5 text-right font-medium">Recibido</th>
                        <th className="px-2 py-1.5 text-right font-medium">Equiv. USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_currency.map((c, i) => (
                        <tr key={i} className="text-sm">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                            {CURRENCY_LABELS[c.currency] || c.currency}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                            {c.count}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {Number(c.total_received_native).toLocaleString('es-VE', {
                              maximumFractionDigits: c.currency === 'COP' ? 0 : 2,
                            })} {CURRENCY_LABELS[c.currency] || c.currency}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                            {formatMoney(c.total_received_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-3 text-center text-xs text-slate-400">Sin ventas.</p>
                )}
              </Section>

              {/* Por categoría */}
              <Section title="Por categoría" icon={Layers}>
                {Array.isArray(summary.by_category) && summary.by_category.length > 0 ? (
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                        <th className="px-2 py-1.5 text-left font-medium">Categoría</th>
                        <th className="px-2 py-1.5 text-right font-medium">Unid.</th>
                        <th className="px-2 py-1.5 text-right font-medium">P. venta</th>
                        <th className="px-2 py-1.5 text-right font-medium">P. costo</th>
                        <th className="px-2 py-1.5 text-right font-medium">Ganancia</th>
                        <th className="px-2 py-1.5 text-right font-medium">Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.by_category.map((c, i) => (
                        <tr key={i} className="text-sm">
                          <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                            {c.category_name}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                            {Number(c.units_sold || 0).toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                            {formatMoney(c.revenue_usd)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-600 dark:text-slate-400">
                            {formatMoney(c.cogs_usd)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                            {formatMoney(c.profit_usd)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                            {Number(c.margin_pct || 0).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/50 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800/30">
                        <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">Total</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {Number(summary.by_category.reduce((s, c) => s + Number(c.units_sold || 0), 0))
                            .toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-100">
                          {formatMoney(summary.revenue_usd)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {formatMoney(summary.cogs_usd)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatMoney(summary.profit_usd)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                          {Number(summary.margin_pct || 0).toFixed(1)}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  <p className="py-3 text-center text-xs text-slate-400">Sin ventas.</p>
                )}
              </Section>

              {/* Créditos y consumo familiar */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MiniBox
                  icon={CreditCard}
                  title="Cuentas por cobrar"
                  rows={[
                    {
                      label: 'Vendido a crédito',
                      value: `${formatMoney(summary.credits_opened_usd)}`,
                      hint: `${summary.credits_opened_count} nuevos`,
                    },
                    {
                      label: 'Abonos recibidos',
                      value: `${formatMoney(summary.credits_paid_usd)}`,
                      hint: `${summary.credits_paid_count} pagos`,
                    },
                  ]}
                />
                <MiniBox
                  icon={Home}
                  title="Consumo familiar"
                  rows={[
                    {
                      label: 'Costo retirado',
                      value: formatMoney(summary.family_cost_usd),
                      hint: `${summary.family_count} registros`,
                    },
                  ]}
                />
              </div>

              {/* Notas */}
              {isReadOnly && existingClose.notes && (
                <Section title="Notas del cierre" icon={null}>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {existingClose.notes}
                  </p>
                </Section>
              )}

              {!isReadOnly && (
                <div className="print:hidden">
                  <label className="label">Notas <span className="text-slate-400">(opcional)</span></label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="input"
                    placeholder="Observaciones del día, incidentes, comentarios..."
                  />
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 print:hidden">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900 print:hidden">
          <button
            onClick={handlePrint}
            className="btn-secondary"
            disabled={!summary}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={submitting}>
              {isReadOnly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!isReadOnly && (
              <button
                onClick={handleConfirmClose}
                className="btn-primary"
                disabled={submitting || !summary}
              >
                <Lock className="h-4 w-4" />
                {submitting ? 'Cerrando...' : 'Confirmar cierre'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tile({ icon: Icon, label, value, hint, accent }) {
  const accentCls = {
    brand:   'text-brand-600 dark:text-brand-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber:   'text-amber-600 dark:text-amber-400',
    rose:    'text-rose-600 dark:text-rose-400',
    slate:   'text-slate-600 dark:text-slate-400',
  }[accent || 'brand'];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50 print:border-slate-300">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <Icon className={`h-4 w-4 ${accentCls}`} />
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${accentCls}`}>{value}</p>
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {title}
      </h3>
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {children}
      </div>
    </div>
  );
}

function MiniBox({ icon: Icon, title, rows }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </h4>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400">{r.label}</span>
            <div className="text-right">
              <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {r.value}
              </span>
              {r.hint && (
                <span className="ml-1 text-[10px] text-slate-400">· {r.hint}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
