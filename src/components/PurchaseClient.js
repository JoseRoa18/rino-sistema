'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, Search, Package, X, ShoppingCart,
  Truck, Calendar, FileText, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, convertToUsd } from '@/lib/pricing';

export default function PurchaseClient({ products, suppliers: initialSuppliers, rate }) {
  const supabase = createClient();
  const router = useRouter();

  // ─── Cabecera ─────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [currency, setCurrency] = useState('USD'); // moneda en que se pagó
  const [notes, setNotes] = useState('');

  // ─── Items ────────────────────────────────────────────────────────────────
  // Cada item: { tempId, product_id, quantity, unit_cost_usd }
  const [items, setItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // ─── Submit state ─────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ─── Supplier creation ────────────────────────────────────────────────────
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  // Map de producto para mostrar info en cada item
  const productById = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // Filtro del picker (excluye los ya agregados)
  const filteredProducts = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const inCart = new Set(items.map((it) => it.product_id));
    return products
      .filter((p) => !inCart.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, pickerSearch, items]);

  // Total de la compra
  const totals = useMemo(() => {
    let totalUsd = 0;
    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const cost = Number(it.unit_cost_usd) || 0;
      totalUsd += qty * cost;
    }
    return {
      usd: totalUsd,
      ves: rate?.usd_ves_paralelo ? totalUsd * Number(rate.usd_ves_paralelo) : null,
      cop: rate?.usd_cop ? totalUsd * Number(rate.usd_cop) : null,
    };
  }, [items, rate]);

  function addProduct(p) {
    setItems((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${Math.random()}`,
        product_id: p.id,
        quantity: '1',
        // Sugerimos el cost_avg actual; el usuario lo ajusta si es distinto
        unit_cost_usd: p.cost_avg ? Number(p.cost_avg).toFixed(4) : '',
      },
    ]);
    setPickerOpen(false);
    setPickerSearch('');
  }

  function updateItem(tempId, field, value) {
    setItems((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, [field]: value } : it)));
  }

  function removeItem(tempId) {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  }

  async function createSupplier() {
    const name = newSupplierName.trim();
    if (name.length < 2) {
      setError('El nombre del proveedor debe tener al menos 2 caracteres');
      return;
    }
    setCreatingSupplier(true);
    setError('');
    const { data, error: err } = await supabase
      .from('suppliers')
      .insert({
        name,
        contact_name: newSupplierContact.trim() || null,
        active: true,
      })
      .select('id, name, contact_name')
      .single();
    setCreatingSupplier(false);
    if (err) {
      setError(err.message || 'No se pudo crear el proveedor');
      return;
    }
    setSuppliers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(data.id);
    setSupplierFormOpen(false);
    setNewSupplierName('');
    setNewSupplierContact('');
  }

  // Validación
  const validation = useMemo(() => {
    if (items.length === 0) return { ok: false, msg: 'Agrega al menos un producto a la compra' };
    for (const it of items) {
      const qty = Number(it.quantity);
      const cost = Number(it.unit_cost_usd);
      if (!qty || qty <= 0) return { ok: false, msg: 'Todos los items deben tener cantidad > 0' };
      if (cost === '' || Number.isNaN(cost) || cost < 0) {
        return { ok: false, msg: 'Todos los items deben tener costo unitario válido' };
      }
    }
    return { ok: true };
  }, [items]);

  async function handleSubmit() {
    setError('');
    if (!validation.ok) {
      setError(validation.msg);
      return;
    }
    setSubmitting(true);
    const payload = {
      supplier_id: supplierId || null,
      purchase_date: purchaseDate,
      reference: reference.trim() || null,
      currency_paid: currency,
      notes: notes.trim() || null,
      items: items.map((it) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_cost_usd: Number(it.unit_cost_usd),
      })),
    };

    const { data, error: rpcErr } = await supabase.rpc('register_purchase', { payload });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message || 'No se pudo registrar la compra');
      return;
    }
    setSuccess(true);
    // Pequeño delay para mostrar feedback antes de redirigir
    setTimeout(() => router.push('/inventario'), 800);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="card flex flex-col items-center gap-3 p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Compra registrada</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Stock actualizado, costos promediados y kardex registrado.
        </p>
        <p className="text-xs text-slate-400">Redirigiendo al inventario…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/inventario"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al inventario
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Nueva compra</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Registra entrada de mercancía. Stock y costo promedio se actualizan automáticamente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: cabecera */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Truck className="h-4 w-4" />
              Información de la compra
            </h2>

            {/* Proveedor */}
            <div className="space-y-1.5">
              <label className="label">Proveedor</label>
              {!supplierFormOpen ? (
                <div className="flex gap-2">
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="input flex-1"
                  >
                    <option value="">— Sin proveedor —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setSupplierFormOpen(true)}
                    className="btn-secondary !px-2.5"
                    title="Crear proveedor"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5">
                  <input
                    autoFocus
                    type="text"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="Nombre del proveedor *"
                    className="input"
                    maxLength={100}
                  />
                  <input
                    type="text"
                    value={newSupplierContact}
                    onChange={(e) => setNewSupplierContact(e.target.value)}
                    placeholder="Contacto (opcional)"
                    className="input"
                    maxLength={100}
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSupplierFormOpen(false);
                        setNewSupplierName('');
                        setNewSupplierContact('');
                      }}
                      disabled={creatingSupplier}
                      className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={createSupplier}
                      disabled={creatingSupplier || newSupplierName.trim().length < 2}
                      className="rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {creatingSupplier ? 'Creando...' : 'Crear'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Referencia */}
            <div className="mt-3 space-y-1.5">
              <label className="label">Referencia / Factura</label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ej: FAC-1234"
                  className="input pl-10"
                  maxLength={50}
                />
              </div>
            </div>

            {/* Fecha */}
            <div className="mt-3 space-y-1.5">
              <label className="label">Fecha de compra</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Moneda */}
            <div className="mt-3 space-y-1.5">
              <label className="label">Moneda en que se pagó</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input"
              >
                <option value="USD">Dólares (USD)</option>
                <option value="VES">Bolívares (VES)</option>
                <option value="COP">Pesos colombianos (COP)</option>
              </select>
              <p className="text-xs text-slate-400">
                Es referencial. Los costos siempre se almacenan en USD.
              </p>
            </div>

            {/* Notas */}
            <div className="mt-3 space-y-1.5">
              <label className="label">Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones sobre la compra..."
                rows={3}
                className="input resize-none"
                maxLength={500}
              />
            </div>
          </div>

          {/* Resumen / total */}
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Total
            </h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-slate-500 dark:text-slate-400">Items:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{items.length}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">USD</span>
                <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(totals.usd)}
                </span>
              </div>
              {totals.ves !== null && (
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-slate-400">VES (paralelo)</span>
                  <span className="font-mono text-slate-600 dark:text-slate-400">
                    {formatMoney(totals.ves, 'VES')}
                  </span>
                </div>
              )}
              {totals.cop !== null && (
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-slate-400">COP</span>
                  <span className="font-mono text-slate-600 dark:text-slate-400">
                    {formatMoney(totals.cop, 'COP')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna derecha: items */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Productos ({items.length})
              </h2>
              <button
                onClick={() => setPickerOpen(true)}
                className="btn-primary !py-1.5 !px-3 !text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar producto
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Aún no has agregado productos a esta compra.
                </p>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="mt-2 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Agregar primer producto
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Producto</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Cantidad</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Costo unit. USD</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Subtotal</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {items.map((it) => {
                      const p = productById.get(it.product_id);
                      const qty = Number(it.quantity) || 0;
                      const cost = Number(it.unit_cost_usd) || 0;
                      const subtotal = qty * cost;
                      const previousCost = p?.cost_avg ? Number(p.cost_avg) : 0;
                      const costChanged = previousCost > 0 && Math.abs(cost - previousCost) / previousCost > 0.01;
                      return (
                        <tr key={it.tempId}>
                          <td className="px-3 py-2">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {p?.name || '?'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {p?.sku || '—'} · stock: {Number(p?.stock || 0).toLocaleString('es-VE')} {p?.unit || ''}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={it.quantity}
                              onChange={(e) => updateItem(it.tempId, 'quantity', e.target.value)}
                              className="input !py-1.5 text-right font-mono text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={it.unit_cost_usd}
                              onChange={(e) => updateItem(it.tempId, 'unit_cost_usd', e.target.value)}
                              className="input !py-1.5 text-right font-mono text-sm"
                            />
                            {costChanged && (
                              <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                                Antes: ${previousCost.toFixed(4)}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatMoney(subtotal)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => removeItem(it.tempId)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                              title="Quitar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Link href="/inventario" className="btn-secondary">Cancelar</Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || !validation.ok}
              className="btn-primary"
            >
              <ShoppingCart className="h-4 w-4" />
              {submitting ? 'Registrando...' : `Registrar compra (${formatMoney(totals.usd)})`}
            </button>
          </div>
        </div>
      </div>

      {/* Picker de productos */}
      {pickerOpen && (
        <ProductPicker
          products={filteredProducts}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          onPick={addProduct}
          onClose={() => {
            setPickerOpen(false);
            setPickerSearch('');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Picker de productos (modal)
// ─────────────────────────────────────────────────────────────────────────────

function ProductPicker({ products, search, onSearchChange, onPick, onClose }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex w-full max-w-xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Seleccionar producto
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
              className="input pl-10"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {products.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              {search ? 'Ningún producto coincide con la búsqueda.' : 'No hay más productos para agregar.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onPick(p)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800">
                      <Package className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {p.sku || '—'} · stock: {Number(p.stock || 0).toLocaleString('es-VE')} · costo: {formatMoney(p.cost_avg)}
                      </p>
                    </div>
                    <Plus className="h-4 w-4 flex-shrink-0 text-brand-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
