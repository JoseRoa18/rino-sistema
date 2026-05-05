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
  });
}

export default function CreditPaymentModal({ customer, openCredits, onClose, onSubmit }) {
  const inputRef = useRef(null);

  const totalOpen = useMemo(
    () => openCredits.reduce((acc, c) => acc + Number(c.balance_usd), 0),
    [openCredits]
  );

  const [mode, setMode] = useState('auto'); // 'auto' | 'specific'
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

  // Tope del monto según el modo
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
    // Resetear el monto al máximo del modo
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
    const payload = {
      credit_id:      mode === 'specific' ? selectedCreditId : null,
      amount_usd:     amountUsdNum,
      payment_method: paymentMethod,
      paid_currency:  currency,
      paid_amount:    Number(paidAmount) || amountUsdNum,
      notes:          notes.trim() || null,
    };
    const result = await onSubmit(payload);
    setSubmitting(false);
    if (result && !result.ok) setError(result.error || 'No se pudo registrar el pago');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="card flex max-h-[95vh] w-full max-w-2xl flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Registrar pago
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{customer.name}</p>
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
            {/* Saldo total */}
            <div className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <div className="text-xs uppercase tracking-wide">Saldo pendiente total</div>
              <div className="text-2xl font-bold tabular-nums">{formatMoney(totalOpen)}</div>
              <div className="text-xs">
                {openCredits.length} crédito{openCredits.length !== 1 ? 's' : ''} abierto
                {openCredits.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Modo */}
            <div>
              <label className="label">Aplicar pago a</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('auto')}
                  className={`rounded-lg border p-3 text-left text-sm ${
                    mode === 'auto'
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Auto-distribuir
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Aplica al más antiguo / vencido primero
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('specific')}
                  className={`rounded-lg border p-3 text-left text-sm ${
                    mode === 'specific'
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Crédito específico
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Selecciona uno
                  </div>
                </button>
              </div>
            </div>

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
                  {openCredits.map((c) => {
                    const overdue = c.due_date && new Date(c.due_date) < new Date();
                    return (
                      <option key={c.id} value={c.id}>
                        {fmtDate(c.created_at)} — saldo {formatMoney(c.balance_usd)}
                        {c.due_date ? ` — vence ${fmtDate(c.due_date)}` : ''}
                        {overdue ? ' (VENCIDO)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Monto */}
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Monto a aplicar (USD)</label>
                <button
                  type="button"
                  onClick={setAmountToFull}
                  className="text-xs text-brand-600 hover:underline dark:text-brand-400"
                >
                  Saldar total ({formatMoney(maxAmount)})
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  ref={inputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="input pl-7"
                  required
                />
              </div>
              {willOverpay && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  Excede el saldo disponible.
                </p>
              )}
            </div>

            {/* Método */}
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
                      className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${
                        active
                          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-slate-700 dark:text-slate-200">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Moneda recibida + monto */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Moneda recibida</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="input"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  Monto recibido en {CURRENCIES.find((c) => c.value === currency)?.label}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="input"
                  placeholder={currency === 'USD' ? amountUsdNum.toFixed(2) : ''}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Opcional. Útil cuando el cliente paga en bolívares o pesos.
                </p>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="label">Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={2}
                placeholder="Referencia, observaciones..."
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
              disabled={submitting || amountUsdNum <= 0 || willOverpay}
            >
              <DollarSign className="h-4 w-4" />
              {submitting ? 'Registrando...' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}