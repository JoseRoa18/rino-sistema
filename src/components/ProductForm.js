'use client';

import { useState, useMemo } from 'react';
import { X, Calculator, TrendingUp, Lock, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { priceWithMargin } from '@/lib/pricing';

/**
 * Input de precio con badge "Ingresado" / "Calculado".
 * IMPORTANTE: definido fuera del componente padre para que React no lo remonte
 * en cada render (lo cual hacía que el input perdiera el foco al teclear).
 */
function PriceInput({ label, value, onChange, currency, step, sourceCurrency, hasRates }) {
  const isSource = sourceCurrency === currency;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label">{label}</label>
        {hasRates && (
          <span
            className={`flex items-center gap-1 text-[10px] font-medium ${
              isSource
                ? 'text-brand-700 dark:text-brand-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {isSource ? <Lock className="h-2.5 w-2.5" /> : <Calculator className="h-2.5 w-2.5" />}
            {isSource ? 'Ingresado' : 'Calculado'}
          </span>
        )}
      </div>
      <input
        type="number"
        step={step}
        className={`input ${
          isSource ? 'border-brand-400 ring-1 ring-brand-200 dark:ring-brand-500/30' : ''
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default function ProductForm({ product, categories, rates, onClose, onSaved, onDelete }) {
  const supabase = createClient();
  const [form, setForm] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    description: product?.description || '',
    category_id: product?.category_id || '',
    cost_avg: product?.cost_avg ?? 0,
    target_margin: product?.target_margin ?? 30,
    price_usd: product?.price_usd ?? 0,
    price_ves: product?.price_ves ?? 0,
    price_cop: product?.price_cop ?? 0,
    stock: product?.stock ?? 0,
    min_stock: product?.min_stock ?? 0,
    unit: product?.unit || 'unidad',
    active: product?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('USD');

  const rateVes = Number(rates?.usd_ves_paralelo) || 0;
  const rateCop = Number(rates?.usd_cop) || 0;
  const hasRates = rateVes > 0 && rateCop > 0;

  const round2 = (n) => Math.round(n * 100) / 100;
  const round0 = (n) => Math.round(n);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateFromUsd(value) {
    const usd = Number(value) || 0;
    setSourceCurrency('USD');
    setForm((prev) => ({
      ...prev,
      price_usd: value,
      price_ves: hasRates ? round2(usd * rateVes) : prev.price_ves,
      price_cop: hasRates ? round0(usd * rateCop) : prev.price_cop,
    }));
  }

  function updateFromVes(value) {
    const ves = Number(value) || 0;
    setSourceCurrency('VES');
    if (!hasRates) {
      setForm((prev) => ({ ...prev, price_ves: value }));
      return;
    }
    const usd = ves / rateVes;
    setForm((prev) => ({
      ...prev,
      price_ves: value,
      price_usd: round2(usd),
      price_cop: round0(usd * rateCop),
    }));
  }

  function updateFromCop(value) {
    const cop = Number(value) || 0;
    setSourceCurrency('COP');
    if (!hasRates) {
      setForm((prev) => ({ ...prev, price_cop: value }));
      return;
    }
    const usd = cop / rateCop;
    setForm((prev) => ({
      ...prev,
      price_cop: value,
      price_usd: round2(usd),
      price_ves: round2(usd * rateVes),
    }));
  }

  function updateCost(value) {
    const cost = Number(value) || 0;
    const margin = Number(form.target_margin) || 0;
    const suggestedUsd = priceWithMargin(cost, margin);
    setSourceCurrency('USD');
    setForm((prev) => ({
      ...prev,
      cost_avg: value,
      price_usd: suggestedUsd,
      price_ves: hasRates ? round2(suggestedUsd * rateVes) : prev.price_ves,
      price_cop: hasRates ? round0(suggestedUsd * rateCop) : prev.price_cop,
    }));
  }

  function updateMargin(value) {
    const margin = Number(value) || 0;
    const cost = Number(form.cost_avg) || 0;
    const suggestedUsd = priceWithMargin(cost, margin);
    setSourceCurrency('USD');
    setForm((prev) => ({
      ...prev,
      target_margin: value,
      price_usd: suggestedUsd,
      price_ves: hasRates ? round2(suggestedUsd * rateVes) : prev.price_ves,
      price_cop: hasRates ? round0(suggestedUsd * rateCop) : prev.price_cop,
    }));
  }

  const realMargin = useMemo(() => {
    const cost = Number(form.cost_avg) || 0;
    const price = Number(form.price_usd) || 0;
    if (cost <= 0 || price <= 0) return null;
    return ((price - cost) / cost) * 100;
  }, [form.cost_avg, form.price_usd]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    const payload = {
      sku: form.sku || null,
      name: form.name,
      description: form.description || null,
      category_id: form.category_id || null,
      cost_avg: Number(form.cost_avg) || 0,
      target_margin: Number(form.target_margin) || 0,
      price_usd: Number(form.price_usd) || 0,
      price_ves: Number(form.price_ves) || 0,
      price_cop: Number(form.price_cop) || 0,
      stock: Number(form.stock) || 0,
      min_stock: Number(form.min_stock) || 0,
      unit: form.unit,
      active: form.active,
    };

    let res;
    if (product?.id) {
      res = await supabase.from('products').update(payload).eq('id', product.id);
    } else {
      res = await supabase.from('products').insert(payload);
    }

    if (res.error) {
      setError(res.error.message);
      setSaving(false);
      return;
    }
    onSaved?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {product?.id ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`flex items-start gap-2 px-4 py-2.5 text-xs ${
            hasRates
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
          }`}
        >
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {hasRates ? (
              <>
                Tasas del día: USD/VES <strong>{rateVes.toFixed(2)}</strong> · USD/COP{' '}
                <strong>{rateCop.toFixed(0)}</strong> — al ingresar precio en cualquier moneda, las
                otras se calculan automáticamente.
              </>
            ) : (
              'No hay tasas registradas hoy. Los precios deben ingresarse manualmente en cada moneda.'
            )}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">SKU</label>
              <input
                className="input"
                value={form.sku}
                onChange={(e) => update('sku', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Categoría</label>
              <select
                className="input"
                value={form.category_id}
                onChange={(e) => update('category_id', e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Nombre *</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Costos y margen
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Costo promedio (USD)</label>
                <input
                  type="number"
                  step="0.0001"
                  className="input"
                  value={form.cost_avg}
                  onChange={(e) => updateCost(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Se actualiza al registrar compras (promedio ponderado).
                </p>
              </div>
              <div>
                <label className="label">Margen objetivo (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.target_margin}
                  onChange={(e) => updateMargin(e.target.value)}
                />
                {realMargin !== null && (
                  <p
                    className={`mt-1 text-xs ${
                      Math.abs(realMargin - Number(form.target_margin)) < 0.5
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    Margen real con precio actual: {realMargin.toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Precios de venta
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PriceInput
                label="USD"
                currency="USD"
                step="0.01"
                value={form.price_usd}
                onChange={updateFromUsd}
                sourceCurrency={sourceCurrency}
                hasRates={hasRates}
              />
              <PriceInput
                label="VES (Bs.)"
                currency="VES"
                step="0.01"
                value={form.price_ves}
                onChange={updateFromVes}
                sourceCurrency={sourceCurrency}
                hasRates={hasRates}
              />
              <PriceInput
                label="COP"
                currency="COP"
                step="1"
                value={form.price_cop}
                onChange={updateFromCop}
                sourceCurrency={sourceCurrency}
                hasRates={hasRates}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Edita la moneda que prefieras como fuente. Las otras dos se calculan con la tasa
              paralelo / COP del día.
            </p>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Inventario
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Stock actual</label>
                <input
                  type="number"
                  step="0.001"
                  className="input"
                  value={form.stock}
                  onChange={(e) => update('stock', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Stock mínimo</label>
                <input
                  type="number"
                  step="0.001"
                  className="input"
                  value={form.min_stock}
                  onChange={(e) => update('min_stock', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Unidad</label>
                <input
                  className="input"
                  value={form.unit}
                  onChange={(e) => update('unit', e.target.value)}
                  placeholder="unidad, kg, litro..."
                />
              </div>
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => update('active', e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
            />
            Producto activo
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            {product?.id && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(product)}
                className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Eliminar producto
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
