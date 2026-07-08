'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'detal',     label: 'Detal',     desc: 'Cliente al menudeo' },
  { value: 'mayorista', label: 'Mayorista', desc: 'Compra al por mayor' },
  { value: 'frecuente', label: 'Frecuente', desc: 'Cliente recurrente' },
  { value: 'eventual',  label: 'Eventual',  desc: 'Compra esporádica' },
];

export default function CustomerForm({ initialValue, prefill, onClose, onSave }) {
  const isEdit = !!initialValue;
  const firstInputRef = useRef(null);

  const [form, setForm] = useState({
    name:             initialValue?.name || prefill?.name || '',
    document_id:      initialValue?.document_id || prefill?.document_id || '',
    phone:            initialValue?.phone || '',
    email:            initialValue?.email || '',
    address:          initialValue?.address || '',
    customer_type:    initialValue?.customer_type || 'detal',
    credit_limit_usd: initialValue?.credit_limit_usd ?? 0,
    birthday:         initialValue?.birthday || '',
    tags:             Array.isArray(initialValue?.tags) ? [...initialValue.tags] : [],
    notes:            initialValue?.notes || '',
  });
  const [tagInput, setTagInput] = useState('');
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

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (!form.tags.includes(t)) update('tags', [...form.tags, t]);
    setTagInput('');
  }

  function removeTag(t) {
    update('tags', form.tags.filter((x) => x !== t));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Email inválido');
      return;
    }
    setSubmitting(true);
    const ok = await onSave(form);
    setSubmitting(false);
    if (!ok) setError('No se pudo guardar (revisa los datos)');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="card flex max-h-[95vh] w-full max-w-2xl flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? `Editar: ${initialValue.name}` : 'Nuevo cliente'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Datos básicos */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">
                  Nombre <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  className="input"
                  placeholder="Nombre completo o razón social"
                  required
                />
              </div>
              <div>
                <label className="label">RIF / Cédula</label>
                <input
                  type="text"
                  value={form.document_id}
                  onChange={(e) => update('document_id', e.target.value)}
                  className="input"
                  placeholder="J-12345678-9 / V-12345678"
                />
              </div>
              <div>
                <label className="label">Teléfono</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  className="input"
                  placeholder="04141234567"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  className="input"
                  placeholder="cliente@correo.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Dirección</label>
                <textarea
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                  className="input"
                  rows={2}
                  placeholder="Dirección de facturación o envío"
                />
              </div>
            </div>

            {/* Clasificación */}
            <div>
              <label className="label">Tipo</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPE_OPTIONS.map((opt) => {
                  const active = form.customer_type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update('customer_type', opt.value)}
                      className={`rounded-lg border p-2 text-left text-xs transition ${
                        active
                          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="label">Etiquetas</label>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                {form.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="hover:text-brand-900 dark:hover:text-brand-200"
                      aria-label={`Quitar ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addTag();
                    } else if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
                      removeTag(form.tags[form.tags.length - 1]);
                    }
                  }}
                  onBlur={addTag}
                  className="min-w-[140px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
                  placeholder="Enter para agregar (ej: vip, mayorista-x)..."
                />
              </div>
            </div>

            {/* Crédito y cumpleaños */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Límite de crédito (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.credit_limit_usd}
                  onChange={(e) => update('credit_limit_usd', e.target.value)}
                  className="input"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  0 = sin límite definido
                </p>
              </div>
              <div>
                <label className="label">Fecha de nacimiento</label>
                <input
                  type="date"
                  value={form.birthday || ''}
                  onChange={(e) => update('birthday', e.target.value)}
                  className="input"
                />
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="label">Notas internas</label>
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className="input"
                rows={3}
                placeholder="Observaciones, preferencias, advertencias..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
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
              {submitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}