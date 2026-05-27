'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Calculator, TrendingUp, Lock, AlertTriangle, Plus, Trash2, Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { priceWithMargin, copToVes } from '@/lib/pricing';

const UNIT_OPTIONS = [
  { value: 'unidad', label: 'Unidad', fractional: false },
  { value: 'kg',     label: 'Kilogramo (kg)', fractional: true },
  { value: 'g',      label: 'Gramo (g)', fractional: true },
  { value: 'litro',  label: 'Litro (L)', fractional: true },
  { value: 'ml',     label: 'Mililitro (ml)', fractional: true },
  { value: 'paquete', label: 'Paquete', fractional: false },
  { value: 'caja',   label: 'Caja', fractional: false },
  { value: 'bulto',  label: 'Bulto', fractional: false },
  { value: 'docena', label: 'Docena', fractional: false },
];

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
  const [costSourceCurrency, setCostSourceCurrency] = useState('USD');

  const rateVes = Number(rates?.usd_ves_paralelo) || 0;
  const rateCop = Number(rates?.usd_cop) || 0;
  const rinoCopVes = Number(rates?.rino_cop_ves) || 0;
  const hasRates = rateVes > 0 && rateCop > 0;

  // Drafts: lo que el usuario tecleó en cada moneda. Solo se muestra al
  // usuario el draft de la moneda fuente; las otras dos se calculan en vivo
  // a partir del draft fuente (NO se hace round-trip por USD para evitar
  // pérdida de precisión).
  const [costDraftUsd, setCostDraftUsd] = useState(String(product?.cost_avg ?? 0));
  const [costDraftCop, setCostDraftCop] = useState('');
  const [costDraftVes, setCostDraftVes] = useState('');

  // Presentaciones de venta (variants). Cada item: { id?, name, base_quantity,
  // price_usd, price_cop, price_ves, _new, _deleted }
  const [variants, setVariants] = useState([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  // Cargar variants existentes al editar
  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    setVariantsLoading(true);
    supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', product.id)
      .order('sort_order', { ascending: true })
      .then(({ data, error: vErr }) => {
        if (cancelled) return;
        if (vErr) {
          // Probable migración no aplicada; silenciamos y dejamos vacío
          console.warn('No se pudieron cargar variants:', vErr.message);
          setVariants([]);
        } else {
          setVariants((data || []).map((v) => ({ ...v, _new: false, _deleted: false })));
        }
        setVariantsLoading(false);
      });
    return () => { cancelled = true; };
  }, [product?.id, supabase]);

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      {
        _new: true,
        name: '',
        base_quantity: 1,
        price_usd: 0,
        price_cop: 0,
        price_ves: 0,
        sort_order: prev.length,
        active: true,
      },
    ]);
  }

  function updateVariant(idx, field, value) {
    setVariants((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)));
  }

  function removeVariant(idx) {
    setVariants((prev) => {
      const v = prev[idx];
      if (v._new) {
        // Si nunca se guardó, quitar de la lista
        return prev.filter((_, i) => i !== idx);
      }
      // Marcar para borrar en submit
      return prev.map((it, i) => (i === idx ? { ...it, _deleted: true } : it));
    });
  }

  // Conversión en vivo del costo basada en la moneda fuente activa.
  const displayedCosts = useMemo(() => {
    let usd = 0;
    let cop = 0;
    let ves = 0;
    if (costSourceCurrency === 'COP') {
      cop = Number(costDraftCop) || 0;
      usd = rateCop > 0 ? cop / rateCop : 0;
      ves = rinoCopVes > 0
        ? copToVes(cop, rinoCopVes)
        : (rateVes > 0 ? usd * rateVes : 0);
    } else if (costSourceCurrency === 'VES') {
      ves = Number(costDraftVes) || 0;
      if (rinoCopVes > 0 && rateCop > 0) {
        cop = ves * rinoCopVes;
        usd = cop / rateCop;
      } else if (rateVes > 0) {
        usd = ves / rateVes;
        cop = usd * rateCop;
      }
    } else {
      usd = Number(costDraftUsd) || 0;
      cop = usd * rateCop;
      ves = rinoCopVes > 0 && cop > 0
        ? copToVes(cop, rinoCopVes)
        : (rateVes > 0 ? usd * rateVes : 0);
    }
    return { usd, cop, ves };
  }, [costSourceCurrency, costDraftUsd, costDraftCop, costDraftVes, rateCop, rateVes, rinoCopVes]);

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

  // Helper: dada una moneda fuente y su valor, calcula el USD equivalente.
  function costToUsd(source, raw) {
    const n = Number(raw) || 0;
    if (source === 'USD') return n;
    if (source === 'COP') return rateCop > 0 ? n / rateCop : 0;
    if (source === 'VES') {
      if (rinoCopVes > 0 && rateCop > 0) return (n * rinoCopVes) / rateCop;
      if (rateVes > 0) return n / rateVes;
    }
    return 0;
  }

  // Una sola función que cubre las 3 fuentes: actualiza el draft de la moneda
  // fuente, deja los otros drafts intactos (se mostrarán como Calculados
  // derivados del draft fuente), y propaga el USD al cost_avg + precio sugerido.
  function updateCostByCurrency(source, value) {
    if (source === 'USD') setCostDraftUsd(value);
    else if (source === 'COP') setCostDraftCop(value);
    else if (source === 'VES') setCostDraftVes(value);
    setCostSourceCurrency(source);
    const usd = costToUsd(source, value);
    const margin = Number(form.target_margin) || 0;
    const suggestedUsd = priceWithMargin(usd, margin);
    setSourceCurrency('USD');
    setForm((prev) => ({
      ...prev,
      cost_avg: usd,
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

    let productId = product?.id || null;
    if (productId) {
      const { error: upErr } = await supabase.from('products').update(payload).eq('id', productId);
      if (upErr) {
        setError(upErr.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('products')
        .insert(payload)
        .select('id')
        .single();
      if (insErr) {
        setError(insErr.message);
        setSaving(false);
        return;
      }
      productId = ins?.id;
    }

    // Sincronizar variants: borrar las marcadas _deleted, actualizar
    // existentes y crear las nuevas. Solo si productId existe.
    if (productId) {
      try {
        // 1) Borrar las marcadas
        const toDelete = variants.filter((v) => v.id && v._deleted).map((v) => v.id);
        if (toDelete.length > 0) {
          const { error: delErr } = await supabase
            .from('product_variants')
            .delete()
            .in('id', toDelete);
          if (delErr) throw delErr;
        }

        // 2) Insertar nuevas (sin _deleted y _new=true) — solo si tienen nombre
        const toInsert = variants
          .filter((v) => v._new && !v._deleted && v.name?.trim())
          .map((v, idx) => ({
            product_id: productId,
            name: v.name.trim(),
            base_quantity: Number(v.base_quantity) || 1,
            price_usd: Number(v.price_usd) || 0,
            price_cop: Number(v.price_cop) || 0,
            price_ves: Number(v.price_ves) || 0,
            sort_order: idx,
            active: v.active !== false,
          }));
        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from('product_variants').insert(toInsert);
          if (insErr) throw insErr;
        }

        // 3) Actualizar existentes (id presente y no _deleted)
        const toUpdate = variants.filter((v) => v.id && !v._deleted && !v._new);
        for (const v of toUpdate) {
          const { error: upErr } = await supabase
            .from('product_variants')
            .update({
              name: v.name?.trim() || v.name,
              base_quantity: Number(v.base_quantity) || 1,
              price_usd: Number(v.price_usd) || 0,
              price_cop: Number(v.price_cop) || 0,
              price_ves: Number(v.price_ves) || 0,
              sort_order: v.sort_order ?? 0,
              active: v.active !== false,
            })
            .eq('id', v.id);
          if (upErr) throw upErr;
        }
      } catch (vErr) {
        setError(`Producto guardado, pero falló al sincronizar presentaciones: ${vErr.message}`);
        setSaving(false);
        return;
      }
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
              Costo del producto
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PriceInput
                label="USD"
                currency="USD"
                step="0.0001"
                value={costSourceCurrency === 'USD' ? costDraftUsd : round2(displayedCosts.usd)}
                onChange={(v) => updateCostByCurrency('USD', v)}
                sourceCurrency={costSourceCurrency}
                hasRates={hasRates}
              />
              <PriceInput
                label="COP"
                currency="COP"
                step="1"
                value={costSourceCurrency === 'COP' ? costDraftCop : (displayedCosts.cop ? round0(displayedCosts.cop) : '')}
                onChange={(v) => updateCostByCurrency('COP', v)}
                sourceCurrency={costSourceCurrency}
                hasRates={hasRates}
              />
              <PriceInput
                label="Bs."
                currency="VES"
                step="0.01"
                value={costSourceCurrency === 'VES' ? costDraftVes : (displayedCosts.ves ? round0(displayedCosts.ves) : '')}
                onChange={(v) => updateCostByCurrency('VES', v)}
                sourceCurrency={costSourceCurrency}
                hasRates={hasRates}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Edita la moneda que prefieras. Las otras dos se calculan con la tasa del día. El USD se actualiza también al registrar compras (promedio ponderado).
            </p>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Margen objetivo
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Porcentaje (%)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={form.target_margin}
                  onChange={(e) => updateMargin(e.target.value)}
                />
              </div>
              <div className="flex flex-col justify-end">
                {realMargin !== null ? (
                  <p
                    className={`text-xs ${
                      Math.abs(realMargin - Number(form.target_margin)) < 0.5
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    Margen real con precio actual: <strong>{realMargin.toFixed(1)}%</strong>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Define el % de utilidad que quieres sobre el costo.
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
                <label className="label">Unidad de medida</label>
                <select
                  className="input"
                  value={UNIT_OPTIONS.find((u) => u.value === form.unit) ? form.unit : 'unidad'}
                  onChange={(e) => update('unit', e.target.value)}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Para kg/g/L/ml se permiten cantidades decimales en el POS.
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <legend className="flex items-center gap-1.5 px-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Layers className="h-3 w-3" />
              Presentaciones de venta (opcional)
            </legend>

            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Define presentaciones que comparten el mismo stock. Ej. <strong>Huevos</strong>:
              caja (180), cartón (30), medio (15), unidad (1). El stock se lleva en la
              unidad base ({form.unit}); cada presentación define cuántas unidades base
              consume al venderse.
            </p>

            {variantsLoading && (
              <p className="text-xs text-slate-400">Cargando presentaciones...</p>
            )}

            {variants.filter((v) => !v._deleted).length > 0 && (
              <div className="space-y-2">
                {variants.map((v, idx) =>
                  v._deleted ? null : (
                    <div
                      key={v.id || `new-${idx}`}
                      className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 bg-slate-50/50 p-2 dark:border-slate-700 dark:bg-slate-800/30"
                    >
                      <div className="col-span-12 sm:col-span-3">
                        <label className="text-[10px] uppercase tracking-wide text-slate-400">Nombre</label>
                        <input
                          className="input h-8 text-sm"
                          value={v.name}
                          onChange={(e) => updateVariant(idx, 'name', e.target.value)}
                          placeholder="Cartón"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <label className="text-[10px] uppercase tracking-wide text-slate-400">Equivale a</label>
                        <input
                          type="number"
                          step="0.001"
                          className="input h-8 text-sm"
                          value={v.base_quantity}
                          onChange={(e) => updateVariant(idx, 'base_quantity', e.target.value)}
                          placeholder="30"
                        />
                      </div>
                      <div className="col-span-8 sm:col-span-2">
                        <label className="text-[10px] uppercase tracking-wide text-slate-400">USD</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input h-8 text-sm"
                          value={v.price_usd}
                          onChange={(e) => updateVariant(idx, 'price_usd', e.target.value)}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <label className="text-[10px] uppercase tracking-wide text-slate-400">COP</label>
                        <input
                          type="number"
                          step="1"
                          className="input h-8 text-sm"
                          value={v.price_cop}
                          onChange={(e) => updateVariant(idx, 'price_cop', e.target.value)}
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <label className="text-[10px] uppercase tracking-wide text-slate-400">Bs.</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input h-8 text-sm"
                          value={v.price_ves}
                          onChange={(e) => updateVariant(idx, 'price_ves', e.target.value)}
                        />
                      </div>
                      <div className="col-span-12 flex items-end justify-end sm:col-span-1">
                        <button
                          type="button"
                          onClick={() => removeVariant(idx)}
                          className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          title="Quitar presentación"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            <button
              type="button"
              onClick={addVariant}
              className="mt-3 flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar presentación
            </button>
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
