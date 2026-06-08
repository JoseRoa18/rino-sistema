'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, DollarSign, AlertCircle, Banknote, Smartphone,
  ArrowLeftRight, CreditCard,
} from 'lucide-react';
import { formatMoney } from '@/lib/pricing';

const PAYMENT_METHODS = [
  { value: 'efectivo',      label: 'Efectivo',      icon: Banknote },
  { value: 'pago_movil',    label: 'Pago móvil',    icon: Smartphone },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD' },
  { value: 'COP', label: 'COP' },
  { value: 'VES', label: 'Bs.' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'America/Caracas',
  });
}

export default function SupplierPaymentDialog({ supplier, openCredits, onClose, onSubmit }) {
  const inputRef = useRef(null);

  const totalOpen = useMemo(
    () => openCredits.reduce((acc, c) => acc + Number(c.balance_usd), 0),
    [openCredits]
  );

  const [mode, setMode] = useState('auto'); // 'auto' (FIFO) | 'specific'
  const [selectedCreditId, setSelectedCreditId] = useState(openCredits[0]?.id || '');
  const [amountUsd, setAmountUsd] = useState(totalOpen.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [currency, setCurrency] = useState('USD');
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const selectedCredit = useMemo(
    () => openCredits.find((c) => c.id === selectedCreditId),
    [openCredits, selectedCreditId]
  );

  const maxAmount = mode === 'specific' && selectedCredit
    ? Number(selectedCredit.balance_usd)
    : totalOpen;

  const amountUsdNum = Number(amountUsd) || 0;
  const willOverpay = amountUsdNum > maxAmount + 0.005;

  function setAmountToFull() {
    setAmountUsd(maxAmount.toFixed(2));
  }

  function handleModeChange(next) {
    setMode(next);
    if (next === 'specific' && selectedCredit) {
      setAmountUsd(Number(selectedCredit.balance_usd).toFixed(2));
    } else {
      setAmountUsd(totalOpen.toFixed(2));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (amountUsdNum <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (willOverpay) {
      setError(`El monto excede el saldo disponible (${formatMoney(maxAmount)})`);
      return;
    }
    if (mode === 'specific' && !selectedCreditId) {
      setError('Selecciona un crédito');
      return;
    }

    setSubmitting(true);
    const result = await onSubmit({
      credit_id:      mode === 'specific' ? selectedCreditId : null,
      amount_usd:     amountUsdNum,
      payment_method: paymentMethod,
      paid_currency:  currency,
      paid_amount:    Number(paidAmount) || amountUsdNum,
      notes:          notes || null,
    });
    setSubmitting(false);
    if (!result?.ok) {
      setError(result?.error || 'No se pudo registrar el pago');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="card flex max-h-[95vh] w-full max-w-xl flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Pagar a {supplier.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Saldo total: <strong>{formatMoney(totalOpen)}</strong> · {openCredits.length} crédito{openCredits.length === 1 ? '' : 's'} abierto{openCredits.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Modo: auto vs específico */}
            <div>
              <label className="label">Aplicar a</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('auto')}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    mode === 'auto'
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Automático (FIFO)
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Vencidos primero, luego los más antiguos
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('specific')}
                  className={`rounded-lg border p-3 text-left text-sm transition ${
                    mode === 'specific'
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Crédito específico
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Aplica solo a uno
                  </div>
                </button>
              </div>
            </div>

            {/* Selector de crédito (solo modo específico) */}
            {mode === 'specific' && (
              <div>
                <label className="label">Crédito</label>
                <select
                  value={selectedCreditId}
                  onChange={(e) => {
                    setSelectedCreditId(e.target.value);
                    const c = openCredits.find((x) => x.id === e.target.value);
                    if (c) setAmountUsd(Number(c.balance_usd).toFixed(2));
                  }}
                  className="input"
                >
                  {openCredits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fmtDate(c.created_at)} — {formatMoney(c.balance_usd)} pendiente
                      {c.due_date ? ` · vence ${fmtDate(c.due_date)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Monto */}
            <div>
              <label className="label">
                Monto a pagar (USD)
                <button
                  type="button"
                  onClick={setAmountToFull}
                  className="ml-2 text-xs font-normal text-brand-600 hover:underline dark:text-brand-400"
                >
                  Pagar todo ({formatMoney(maxAmount)})
                </button>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxAmount.toFixed(2)}
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="input pl-9"
                  required
                />
              </div>
              {willOverpay && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  Excede el saldo disponible
                </p>
              )}
            </div>

            {/* Método de pago */}
            <div>
              <label className="label">Método de pago</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = paymentMethod === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPaymentMethod(m.value)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${
                        active
                          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Moneda + monto en moneda */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Moneda entregada</label>
                <div className="grid grid-cols-3 gap-1">
                  {CURRENCIES.map((c) => {
                    const active = currency === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCurrency(c.value)}
                        className={`rounded border px-2 py-1.5 text-sm transition ${
                          active
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">
                  Monto en {currency} <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  type="number"
                  step={currency === 'COP' ? '1' : '0.01'}
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="input"
                  placeholder={`Por defecto = ${formatMoney(amountUsdNum)}`}
                />
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="label">Notas <span className="text-slate-400">(opcional)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={2}
                placeholder="Nº de transferencia, referencia, comentario..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || willOverpay || amountUsdNum <= 0}
            >
              <DollarSign className="h-4 w-4" />
              {submitting ? 'Registrando...' : `Registrar pago ${formatMoney(amountUsdNum)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
