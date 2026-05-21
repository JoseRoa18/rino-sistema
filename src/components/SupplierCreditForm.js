'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, AlertCircle, FileText } from 'lucide-react';

export default function SupplierCreditForm({ supplier, onClose, onSave }) {
  const firstInputRef = useRef(null);
  const [form, setForm] = useState({
    original_amount_usd: '',
    due_date:            '',
    notes:               '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    firstInputRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const amount = Number(form.original_amount_usd);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    setSubmitting(true);
    const result = await onSave({
      supplier_id:         supplier.supplier_id,
      original_amount_usd: amount,
      due_date:            form.due_date || null,
      notes:               form.notes || null,
    });
    setSubmitting(false);
    if (!result?.ok) {
      setError(result?.error || 'No se pudo registrar la deuda');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="card flex max-h-[95vh] w-full max-w-md flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Nueva cuenta por pagar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Proveedor: <strong>{supplier.name}</strong>
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
            <div>
              <label className="label">
                Monto adeudado (USD) <span className="text-rose-500">*</span>
              </label>
              <input
                ref={firstInputRef}
                type="number"
                step="0.01"
                min="0"
                value={form.original_amount_usd}
                onChange={(e) => update('original_amount_usd', e.target.value)}
                className="input"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="label">Fecha de vencimiento <span className="text-slate-400">(opcional)</span></label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => update('due_date', e.target.value)}
                className="input"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Si se vence, aparecerá como deuda vencida en el panel.
              </p>
            </div>

            <div>
              <label className="label">Notas</label>
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className="input"
                rows={3}
                placeholder="Origen de la deuda, referencia de factura, observación..."
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
              <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Usa esto para registrar deudas históricas o compras a crédito que no
                quedaron ligadas a una compra registrada en el sistema.
              </span>
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
            <button type="submit" className="btn-primary" disabled={submitting}>
              <Save className="h-4 w-4" />
              {submitting ? 'Registrando...' : 'Registrar deuda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
