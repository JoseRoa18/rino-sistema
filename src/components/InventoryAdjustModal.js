'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Settings2, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function InventoryAdjustModal({ product, onClose, onSaved }) {
  const supabase = createClient();
  const inputRef = useRef(null);

  const currentStock = Number(product.stock) || 0;
  const [mode, setMode] = useState('absolute'); // 'absolute' | 'delta'
  const [newStock, setNewStock] = useState(String(currentStock));
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Calcular el delta en vivo según el modo
  let computedDelta = 0;
  let finalStock = currentStock;
  if (mode === 'absolute') {
    const target = Number(newStock);
    if (!Number.isNaN(target)) {
      finalStock = target;
      computedDelta = target - currentStock;
    }
  } else {
    const d = Number(delta);
    if (!Number.isNaN(d)) {
      computedDelta = d;
      finalStock = currentStock + d;
    }
  }

  const wouldGoNegative = finalStock < 0;
  const noChange = computedDelta === 0;
  const reasonValid = reason.trim().length >= 3;
  const canSubmit = !submitting && reasonValid && !noChange && !wouldGoNegative;

  async function handleSubmit() {
    setError('');
    if (!canSubmit) return;

    setSubmitting(true);
    const args = mode === 'absolute'
      ? { p_product_id: product.product_id, p_new_stock: Number(newStock), p_reason: reason.trim() }
      : { p_product_id: product.product_id, p_delta: Number(delta), p_reason: reason.trim() };

    const { data, error: rpcErr } = await supabase.rpc('adjust_stock', args);
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message || 'No se pudo aplicar el ajuste');
      return;
    }
    onSaved?.(data);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose?.();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div className="card w-full max-w-md p-6">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Settings2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Ajustar inventario
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stock actual */}
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Stock actual
            </span>
            <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
              {currentStock.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
              <span className="ml-1 text-xs font-normal text-slate-500">{product.unit || 'unid'}</span>
            </span>
          </div>
        </div>

        {/* Tabs modo */}
        <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            onClick={() => setMode('absolute')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              mode === 'absolute'
                ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
            }`}
          >
            Stock total
          </button>
          <button
            onClick={() => setMode('delta')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              mode === 'delta'
                ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
            }`}
          >
            Sumar / restar
          </button>
        </div>

        {/* Inputs según modo */}
        <div className="mt-4">
          <label className="label">
            {mode === 'absolute' ? 'Nuevo stock total' : 'Cantidad a sumar (negativo para restar)'}
          </label>
          <input
            ref={inputRef}
            type="number"
            step="0.001"
            value={mode === 'absolute' ? newStock : delta}
            onChange={(e) => mode === 'absolute' ? setNewStock(e.target.value) : setDelta(e.target.value)}
            placeholder={mode === 'absolute' ? '0' : '+5  o  -3'}
            className="input"
          />

          {/* Vista previa del cambio */}
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <span className="text-slate-500 dark:text-slate-400">Quedará en:</span>
            <span className={`font-mono font-bold ${
              wouldGoNegative
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}>
              {finalStock.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
              <span className="ml-1 text-xs font-normal text-slate-500">{product.unit || 'unid'}</span>
            </span>
            {!noChange && !wouldGoNegative && (
              <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                computedDelta > 0
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
              }`}>
                {computedDelta > 0 ? '+' : ''}
                {computedDelta.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
              </span>
            )}
          </div>

          {wouldGoNegative && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              El stock no puede quedar negativo.
            </p>
          )}
        </div>

        {/* Motivo */}
        <div className="mt-4">
          <label className="label">Motivo del ajuste *</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Conteo físico inicial, Merma, Daño..."
            className="input"
            maxLength={200}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Quedará registrado en el kardex y la auditoría del sistema.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Acciones */}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary">
            {submitting ? 'Aplicando...' : 'Registrar ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
}
