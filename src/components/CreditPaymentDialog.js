'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  X, Banknote, Smartphone, CreditCard,
  Check, AlertTriangle, ArrowRight, DollarSign,
} from 'lucide-react';
import { formatMoney, convertFromUsd, convertToUsd } from '@/lib/pricing';
import { registerCreditPaymentAction } from '@/app/(dashboard)/clientes/actions';

const PAYMENT_METHODS = [
  { value: 'efectivo',   label: 'Efectivo',   icon: Banknote   },
  { value: 'pago_movil', label: 'Pago móvil', icon: Smartphone },
  { value: 'tarjeta',    label: 'Tarjeta',    icon: CreditCard },
];

const CURRENCIES = [
  { code: 'USD', label: 'USD', symbol: '$'   },
  { code: 'VES', label: 'Bs.', symbol: 'Bs.' },
  { code: 'COP', label: 'COP', symbol: '$'   },
];

export default function CreditPaymentDialog({ credit, rate, onClose, onSuccess }) {
  const balanceUsd = Number(credit.balance_usd || 0);

  const [receivedCurrency, setReceivedCurrency] = useState('USD');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  // Tasas (mismo patrón y nombres que POS)
  const veRate  = Number(rate?.usd_ves_paralelo) || 0;
  const copRate = Number(rate?.usd_cop) || 0;
  const hasVes  = veRate > 0;
  const hasCop  = copRate > 0;

  // Saldo en cada moneda
  const balanceVes = convertFromUsd(balanceUsd, 'VES', rate);
  const balanceCop = convertFromUsd(balanceUsd, 'COP', rate);

  // Conversión del monto recibido a USD (con helper del lib)
  const receivedNum = Number(receivedAmount) || 0;
  const receivedInUsd = useMemo(
    () => convertToUsd(receivedNum, receivedCurrency, rate),
    [receivedNum, receivedCurrency, rate]
  );

  const appliedToCredit = Math.min(receivedInUsd, balanceUsd);
  const changeUsdRaw = Math.max(0, receivedInUsd - balanceUsd);

  // Breakdown del cambio siguiendo la MISMA lógica del POS:
  //   - Pagó USD: parte entera en USD + remainder en COP (floor a 100)
  //   - Pagó COP/VES: todo en COP (floor a 100)
  //   - Sin tasa COP: fallback en la moneda recibida (USD redondeado a entero,
  //     VES/COP a 100)
  // Regla del negocio: USD mínimo $1 (sin centavos), COP de 100 en 100, siempre redondeo abajo.
  const recommendedBreakdown = useMemo(() => {
    if (changeUsdRaw <= 0.005) return null;

    // Sin tasa COP → fallback a la moneda recibida
    if (!hasCop) {
      if (receivedCurrency === 'USD') {
        return { mode: 'usd_only', usdPart: Math.floor(changeUsdRaw), copPart: 0 };
      }
      if (receivedCurrency === 'VES' && hasVes) {
        const rawVes = changeUsdRaw * veRate;
        return { mode: 'ves_only', usdPart: 0, copPart: 0, vesPart: Math.floor(rawVes / 100) * 100 };
      }
      return { mode: 'usd_only', usdPart: Math.floor(changeUsdRaw), copPart: 0 };
    }

    // Pagó en COP o VES → todo el cambio en COP
    if (receivedCurrency === 'COP' || receivedCurrency === 'VES') {
      const rawCop = changeUsdRaw * copRate;
      return { mode: 'cop_only', usdPart: 0, copPart: Math.floor(rawCop / 100) * 100 };
    }

    // Pagó en USD → split: enteros USD + remainder en COP
    const wholeUsd = Math.floor(changeUsdRaw);
    const remainderUsd = changeUsdRaw - wholeUsd;
    const rawCop = remainderUsd * copRate;
    return {
      mode: 'split',
      usdPart: wholeUsd,
      copPart: Math.floor(rawCop / 100) * 100,
    };
  }, [changeUsdRaw, receivedCurrency, copRate, veRate, hasCop, hasVes]);

  // Alternativas para cuando el cajero no tenga la denominación recomendada.
  // Ej: change = $9.65 → recomendado $9 + 2.600 COP, pero también ofrecemos:
  //   $5 + 18.500 COP, todo en COP (38.500), todo en USD ($9 con pérdida)
  // Nada de Bs. (en bolívares no se devuelven vueltos en este negocio).
  const allOptions = useMemo(() => {
    if (!recommendedBreakdown) return [];

    const opts = [];
    const seen = new Set();
    const keyOf = (b) => `${b.usdPart || 0}-${b.copPart || 0}-${b.vesPart || 0}`;

    // 1) Recomendado primero
    opts.push({ ...recommendedBreakdown, key: 'recommended', label: 'Recomendado' });
    seen.add(keyOf(recommendedBreakdown));

    if (hasCop) {
      // 2) Variantes con USD distinto + el resto en COP (denominaciones comunes)
      const wholeUsd = Math.floor(changeUsdRaw);
      const COMMON_BILLS = [20, 10, 5, 1];
      for (const bill of COMMON_BILLS) {
        if (bill > wholeUsd) continue;
        const remainingUsd = changeUsdRaw - bill;
        const copPart = Math.floor((remainingUsd * copRate) / 100) * 100;
        const breakdown = { mode: 'split', usdPart: bill, copPart };
        const k = keyOf(breakdown);
        if (seen.has(k)) continue;
        opts.push({ ...breakdown, key: `usd_${bill}` });
        seen.add(k);
        // Limitar a 2 variantes intermedias para no abrumar
        if (opts.filter((o) => o.key.startsWith('usd_')).length >= 2) break;
      }

      // 3) Todo en COP
      const allCop = { mode: 'cop_only', usdPart: 0, copPart: Math.floor((changeUsdRaw * copRate) / 100) * 100 };
      if (!seen.has(keyOf(allCop))) {
        opts.push({ ...allCop, key: 'all_cop', label: 'Todo en COP' });
        seen.add(keyOf(allCop));
      }
    }

    // 4) Todo en USD (con pérdida si aplica) — solo si hay al menos $1 entero
    const wholeUsdAll = Math.floor(changeUsdRaw);
    if (wholeUsdAll >= 1) {
      const allUsd = { mode: 'usd_only', usdPart: wholeUsdAll, copPart: 0 };
      const loss = changeUsdRaw - wholeUsdAll;
      if (!seen.has(keyOf(allUsd))) {
        opts.push({
          ...allUsd,
          key: 'all_usd',
          label: 'Todo en USD',
          loss: loss > 0.005 ? loss : 0,
        });
        seen.add(keyOf(allUsd));
      }
    }

    return opts;
  }, [recommendedBreakdown, changeUsdRaw, copRate, hasCop]);

  // Opción seleccionada (resetea a recomendado cuando cambia el monto)
  const [selectedKey, setSelectedKey] = useState('recommended');
  useEffect(() => { setSelectedKey('recommended'); }, [changeUsdRaw, receivedCurrency]);
  const selectedBreakdown = allOptions.find((o) => o.key === selectedKey) || allOptions[0] || null;

  const willFullyPay = receivedInUsd > 0 && appliedToCredit >= balanceUsd - 0.005;
  const isPartial    = receivedInUsd > 0 && appliedToCredit < balanceUsd - 0.005;

  // Validación: para usar VES o COP necesitamos su tasa específica
  const hasRateForReceived =
    receivedCurrency === 'USD' ? true
    : receivedCurrency === 'VES' ? hasVes
    : receivedCurrency === 'COP' ? hasCop
    : false;

  // Quick-fills sugeridos según moneda recibida (para pagar el saldo redondeado)
  const quickAmounts = useMemo(() => {
    if (receivedCurrency === 'USD') {
      const exact = Math.ceil(balanceUsd * 100) / 100;
      return [exact, Math.ceil(balanceUsd) + 5, 50, 100];
    }
    if (receivedCurrency === 'VES') {
      const round1000 = Math.ceil(balanceVes / 1000) * 1000;
      return [round1000, round1000 + 1000, 5000, 10000];
    }
    // COP
    const round1000  = Math.ceil(balanceCop / 1000) * 1000;
    const round10000 = Math.ceil(balanceCop / 10000) * 10000;
    return [round1000, round10000, 50000, 100000];
  }, [receivedCurrency, balanceUsd, balanceVes, balanceCop]);

  async function handleSubmit() {
    if (receivedInUsd <= 0) {
      setError('Ingresa el monto recibido.');
      return;
    }
    if (!hasRateForReceived) {
      setError('No hay tasa configurada para esta moneda. Cambia a USD o actualiza las tasas en /tasas.');
      return;
    }
    setError('');
    setSubmitting(true);

    const result = await registerCreditPaymentAction({
      customer_id: credit.customer_id,
      credit_id:   credit.id,
      amount_usd:  appliedToCredit,
      payment_method: paymentMethod,
    });

    if (!result.ok) {
      setError(result.error || 'Error al registrar el pago.');
      setSubmitting(false);
      return;
    }

    setSuccess({
      applied:    appliedToCredit,
      breakdown:  selectedBreakdown,
      changeUsdRaw,
      fullyPaid:  willFullyPay,
    });
    setSubmitting(false);
    setTimeout(() => {
      onSuccess({
        fully_paid: willFullyPay,
        customer_name: credit.customers?.name,
      });
    }, 2200);
  }

  // ---------- Pantalla de éxito ----------
  if (success) {
    return (
      <Backdrop>
        <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl dark:bg-slate-900">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Check className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {success.fullyPaid ? 'Crédito pagado por completo' : 'Pago parcial registrado'}
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Aplicado: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(success.applied)}</span>
          </p>
          {success.breakdown && (
            <div className="mt-3 rounded-lg bg-amber-50 p-4 dark:bg-amber-500/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Devuelve al cliente
              </p>
              <ChangeAmountDisplay
                breakdown={success.breakdown}
                rawUsd={success.changeUsdRaw}
                size="lg"
              />
            </div>
          )}
        </div>
      </Backdrop>
    );
  }

  // ---------- Formulario ----------
  return (
    <Backdrop onClickOutside={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Cobrar crédito
            </h3>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {credit.customers?.name}
              {credit.sales?.invoice_number && (
                <> · Factura #{String(credit.sales.invoice_number).padStart(6, '0')}</>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Saldo pendiente — en las 3 monedas */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Saldo pendiente
            </p>
            <p className="mt-1 text-3xl font-bold text-rose-600 dark:text-rose-400">
              {formatMoney(balanceUsd)}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {hasVes && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Bolívares</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {Number(balanceVes).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              {hasCop && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Pesos COP</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {Number(balanceCop).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Selector de moneda recibida */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Moneda recibida
            </label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {CURRENCIES.map((c) => {
                const disabled =
                  (c.code === 'VES' && !hasVes) ||
                  (c.code === 'COP' && !hasCop);
                return (
                  <button
                    key={c.code}
                    type="button"
                    disabled={disabled}
                    onClick={() => setReceivedCurrency(c.code)}
                    title={disabled ? 'Tasa no configurada' : ''}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      receivedCurrency === c.code
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
                        : disabled
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-600'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input de monto */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Monto recibido
            </label>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                {CURRENCIES.find((c) => c.code === receivedCurrency)?.symbol}
              </span>
              <input
                type="number"
                step={receivedCurrency === 'USD' ? '0.01' : '1'}
                min="0"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
                placeholder="0"
                className="input pl-9 text-2xl font-bold tabular-nums"
                autoFocus
              />
            </div>

            {/* Quick amounts */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickAmounts.map((a, i) => (
                <button
                  key={`${a}-${i}`}
                  type="button"
                  onClick={() => setReceivedAmount(String(a))}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {receivedCurrency === 'USD'
                    ? `$${Number(a).toFixed(2)}`
                    : Number(a).toLocaleString(receivedCurrency === 'VES' ? 'es-VE' : 'es-CO')}
                </button>
              ))}
            </div>
          </div>

          {/* Cálculo en vivo */}
          {receivedNum > 0 && hasRateForReceived && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              {receivedCurrency !== 'USD' && (
                <Row label="Equivalente en USD" value={formatMoney(receivedInUsd)} muted />
              )}
              <Row
                label="Aplica al crédito"
                value={formatMoney(appliedToCredit)}
                emphasize="emerald"
              />

              {selectedBreakdown && (
                <>
                  <div className="border-t border-dashed border-slate-200 dark:border-slate-700" />
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Cambio a devolver
                    </p>
                    <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                      ${changeUsdRaw.toFixed(2)} USD total
                    </p>
                  </div>

                  {/* Opción seleccionada — destacada */}
                  <button
                    type="button"
                    onClick={() => {/* ya está seleccionada */}}
                    className="w-full rounded-md border-2 border-emerald-500 bg-emerald-50 p-3 text-left transition dark:bg-emerald-500/10"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3 w-3" />
                      {selectedBreakdown.label || 'Seleccionado'}
                    </div>
                    <BreakdownLine breakdown={selectedBreakdown} size="md" />
                    {selectedBreakdown.loss > 0 && (
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                        ⓘ pierdes ${selectedBreakdown.loss.toFixed(2)} por redondeo
                      </p>
                    )}
                  </button>

                  {/* Alternativas — clickeables */}
                  {allOptions.length > 1 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        ¿No tienes esa combinación? Otras formas:
                      </p>
                      {allOptions
                        .filter((o) => o.key !== selectedKey)
                        .map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setSelectedKey(opt.key)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                          >
                            <div className="flex-1 min-w-0">
                              <BreakdownLine breakdown={opt} size="sm" />
                              {opt.loss > 0 && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                  pierdes ${opt.loss.toFixed(2)}
                                </p>
                              )}
                            </div>
                            {opt.label && (
                              <span className="flex-shrink-0 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {opt.label}
                              </span>
                            )}
                          </button>
                        ))}
                    </div>
                  )}

                  <p className="text-[11px] italic text-slate-500 dark:text-slate-400">
                    USD en billetes de $1+ · COP de 100 en 100 · Bs. no se devuelve
                  </p>
                </>
              )}

              {willFullyPay && (
                <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  El crédito quedará pagado totalmente
                </div>
              )}
              {isPartial && (
                <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Pago parcial · queda saldo de {formatMoney(balanceUsd - appliedToCredit)}
                </div>
              )}
            </div>
          )}

          {/* Método de pago */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Método de pago
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAYMENT_METHODS.map((m) => {
                const Ico = m.icon;
                const active = paymentMethod === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setPaymentMethod(m.value)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Ico className="h-3.5 w-3.5" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn-secondary disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || receivedInUsd <= 0 || !hasRateForReceived}
            className="btn-primary disabled:opacity-50"
          >
            {submitting ? (
              <>Procesando...</>
            ) : (
              <>
                Registrar pago
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ----------------------------------------------------------------------------

function Backdrop({ children, onClickOutside }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClickOutside) onClickOutside();
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value, emphasize, muted }) {
  const valueClass =
    emphasize === 'emerald' ? 'text-emerald-600 dark:text-emerald-400 font-bold'
    : emphasize === 'rose'  ? 'text-rose-600 dark:text-rose-400 font-bold'
    : muted                 ? 'text-slate-500 dark:text-slate-400'
    : 'text-slate-900 dark:text-slate-100 font-semibold';
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

/**
 * Renderiza una línea de breakdown inline:
 *   "$9 USD + 2.600 COP" o "38.500 COP" o "$9 USD"
 */
function BreakdownLine({ breakdown, size = 'md' }) {
  if (!breakdown) return null;
  const numCls   = size === 'lg' ? 'text-2xl font-bold' : size === 'md' ? 'text-xl font-bold' : 'text-base font-semibold';
  const labelCls = size === 'lg' ? 'text-sm' : size === 'md' ? 'text-xs' : 'text-[11px]';
  const sepCls   = size === 'lg' ? 'text-xl font-light text-slate-400' : 'text-base font-light text-slate-400';

  const segs = [];
  if (breakdown.usdPart > 0) {
    segs.push(
      <span key="usd" className="tabular-nums text-slate-900 dark:text-slate-100">
        <span className={numCls}>${breakdown.usdPart}</span>
        <span className={`ml-1 ${labelCls} text-slate-500 dark:text-slate-400`}>USD</span>
      </span>
    );
  }
  if (breakdown.copPart > 0) {
    segs.push(
      <span key="cop" className="tabular-nums text-slate-900 dark:text-slate-100">
        <span className={numCls}>{Number(breakdown.copPart).toLocaleString('es-CO')}</span>
        <span className={`ml-1 ${labelCls} text-slate-500 dark:text-slate-400`}>COP</span>
      </span>
    );
  }
  if (breakdown.vesPart > 0) {
    segs.push(
      <span key="ves" className="tabular-nums text-slate-900 dark:text-slate-100">
        <span className={numCls}>Bs. {Number(breakdown.vesPart).toLocaleString('es-VE')}</span>
      </span>
    );
  }
  if (segs.length === 0) {
    segs.push(
      <span key="zero" className={`${numCls} tabular-nums text-slate-400`}>$0</span>
    );
  }

  const out = [];
  segs.forEach((s, i) => {
    if (i > 0) out.push(<span key={`sep-${i}`} className={sepCls}>+</span>);
    out.push(s);
  });

  return <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">{out}</div>;
}

/**
 * Renderiza el desglose del cambio según el modo:
 *   - split:    "$X USD  +  Y.YYY COP"
 *   - cop_only: "Y.YYY COP"
 *   - usd_only: "$X USD"
 *   - ves_only: "Bs. Z" (fallback raro)
 *
 * Muestra abajo el equivalente raw en USD para sanity-check.
 */
function ChangeAmountDisplay({ breakdown, rawUsd, size = 'md' }) {
  if (!breakdown) return null;
  const big   = size === 'lg' ? 'text-3xl' : 'text-2xl';
  const small = size === 'lg' ? 'text-base' : 'text-sm';

  const parts = [];
  if (breakdown.usdPart > 0) {
    parts.push(
      <span key="usd" className={`${big} font-bold tabular-nums text-amber-700 dark:text-amber-400`}>
        ${breakdown.usdPart} <span className={small}>USD</span>
      </span>
    );
  }
  if (breakdown.copPart > 0) {
    parts.push(
      <span key="cop" className={`${big} font-bold tabular-nums text-amber-700 dark:text-amber-400`}>
        {Number(breakdown.copPart).toLocaleString('es-CO')} <span className={small}>COP</span>
      </span>
    );
  }
  if (breakdown.vesPart > 0) {
    parts.push(
      <span key="ves" className={`${big} font-bold tabular-nums text-amber-700 dark:text-amber-400`}>
        Bs. {Number(breakdown.vesPart).toLocaleString('es-VE')}
      </span>
    );
  }

  // Si quedó vacío (todo se redondeó a 0), mostrar 0
  if (parts.length === 0) {
    parts.push(
      <span key="zero" className={`${big} font-bold tabular-nums text-slate-400`}>
        $0
      </span>
    );
  }

  // Insertar separador "+" entre partes
  const withSeparators = [];
  parts.forEach((p, i) => {
    if (i > 0) {
      withSeparators.push(
        <span key={`sep-${i}`} className={`${big} font-light text-amber-600/60 dark:text-amber-400/60`}>
          +
        </span>
      );
    }
    withSeparators.push(p);
  });

  return (
    <div className="mt-1 flex flex-col items-center gap-1">
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        {withSeparators}
      </div>
      {rawUsd > 0 && (
        <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70">
          equivale a ${rawUsd.toFixed(2)} USD
        </p>
      )}
    </div>
  );
}
