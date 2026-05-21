'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'VES', label: 'Bs.' },
  { value: 'COP', label: 'COP' },
];

export default function SupplierForm({ initialValue, onClose, onSave }) {
  const isEdit = !!initialValue;
  const firstInputRef = useRef(null);

  const [form, setForm] = useState({
    name:               initialValue?.name || '',
    contact_name:       initialValue?.contact_name || '',
    phone:              initialValue?.phone || '',
    email:              initialValue?.email || '',
    invoicing_currency: initialValue?.invoicing_currency || 'USD',
    payment_terms:      initialValue?.payment_terms || '',
    tags:               Array.isArray(initialValue?.tags) ? [...initialValue.tags] : [],
    notes:              initialValue?.notes || '',
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
            {isEdit ? `Editar: ${initialValue.name}` : 'Nuevo proveedor'}
          </h2>
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
                  placeholder="Razón social o nombre comercial"
                  required
                />
              </div>
              <div>
                <label className="label">Contacto</label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => update('contact_name', e.target.value)}
                  className="input"
                  placeholder="Persona de contacto"
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
                  placeholder="proveedor@correo.com"
                />
              </div>
            </div>

            {/* Comercial */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Moneda de facturación</label>
                <div className="grid grid-cols-3 gap-2">
                  {CURRENCY_OPTIONS.map((opt) => {
                    const active = form.invoicing_currency === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update('invoicing_currency', opt.value)}
                        className={`rounded-lg border p-2 text-center text-sm font-medium transition ${
                          active
                            ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="label">Términos de pago</label>
                <input
                  type="text"
                  value={form.payment_terms}
                  onChange={(e) => update('payment_terms', e.target.value)}
                  className="input"
                  placeholder="Contado, 30 días, 50% adelanto..."
                />
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
                  placeholder="Enter para agregar (ej: critico, frecuente)..."
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
                placeholder="Observaciones, frecuencia de visita, advertencias..."
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
            <button type="submit" className="btn-primary" disabled={submitting}>
              <Save className="h-4 w-4" />
              {submitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
