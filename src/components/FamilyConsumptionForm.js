'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Save, AlertCircle, Search, Plus, Minus, Trash2, Home,
} from 'lucide-react';
import { formatMoney } from '@/lib/pricing';

/**
 * Modal para registrar consumo familiar.
 * - Búsqueda + selección de productos
 * - Cantidades editables, advertencia si excede stock
 * - Muestra el total a precio costo
 */
export default function FamilyConsumptionForm({ products, onClose, onSave }) {
  const inputRef = useRef(null);
  const [search, setSearch] = useState('');
  const [cart, setCart]     = useState([]); // [{ product, qty }]
  const [notes, setNotes]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        const haystack = `${p.name} ${p.sku || ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 12);
  }, [products, search]);

  const totals = useMemo(() => {
    const cost  = cart.reduce((a, it) => a + Number(it.product.cost_avg || 0) * it.qty, 0);
    const units = cart.reduce((a, it) => a + it.qty, 0);
    return { cost, units, lines: cart.length };
  }, [cart]);

  function addProduct(p) {
    setCart((prev) => {
      const existing = prev.find((it) => it.product.id === p.id);
      if (existing) {
        return prev.map((it) => it.product.id === p.id ? { ...it, qty: it.qty + 1 } : it);
      }
      return [...prev, { product: p, qty: 1 }];
    });
    setSearch('');
    inputRef.current?.focus();
  }

  function changeQty(productId, delta) {
    setCart((prev) =>
      prev
        .map((it) => it.product.id === productId ? { ...it, qty: it.qty + delta } : it)
        .filter((it) => it.qty > 0)
    );
  }

  function setQty(productId, qty) {
    const n = Math.max(0, Number(qty) || 0);
    if (n === 0) {
      setCart((prev) => prev.filter((it) => it.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((it) => (it.product.id === productId ? { ...it, qty: n } : it))
    );
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((it) => it.product.id !== productId));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (cart.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    setSubmitting(true);
    const result = await onSave({
      items: cart.map((it) => ({
        product_id: it.product.id,
        quantity:   it.qty,
      })),
      notes: notes.trim() || null,
    });
    setSubmitting(false);
    if (!result?.ok) {
      setError(result?.error || 'No se pudo registrar el consumo');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="card flex max-h-[95vh] w-full max-w-3xl flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Nuevo consumo familiar
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Productos se descontarán del stock a precio costo. No afecta los reportes financieros.
              </p>
            </div>
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
            {/* Búsqueda de productos */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
                placeholder="Buscar producto por nombre o SKU..."
              />
              {filtered.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {filtered.map((p) => {
                    const lowStock = Number(p.stock) <= 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        disabled={lowStock}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${
                          lowStock
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {p.sku ? `${p.sku} · ` : ''}Stock: {Number(p.stock).toFixed(0)} {p.unit}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-wider text-slate-400">
                            Costo
                          </div>
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {formatMoney(p.cost_avg)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Carrito */}
            {cart.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
                Busca y selecciona productos arriba para registrar el consumo.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Producto</th>
                      <th className="px-3 py-2 text-right">Costo unit</th>
                      <th className="px-3 py-2 text-center">Cantidad</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {cart.map((it) => {
                      const stock = Number(it.product.stock || 0);
                      const overStock = it.qty > stock;
                      return (
                        <tr key={it.product.id} className="text-sm">
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {it.product.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Stock: {stock.toFixed(0)} {it.product.unit}
                              {overStock && (
                                <span className="ml-2 inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                                  <AlertCircle className="h-3 w-3" />
                                  Excede stock
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                            {formatMoney(it.product.cost_avg)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => changeQty(it.product.id, -1)}
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                value={it.qty}
                                onChange={(e) => setQty(it.product.id, e.target.value)}
                                step="0.01"
                                min="0"
                                className="w-16 rounded border border-slate-200 px-2 py-1 text-center text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => changeQty(it.product.id, 1)}
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                            {formatMoney(Number(it.product.cost_avg) * it.qty)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeFromCart(it.product.id)}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                              aria-label="Quitar"
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

            {/* Notas */}
            <div>
              <label className="label">Notas <span className="text-slate-400">(opcional)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={2}
                placeholder="Motivo del consumo, observación..."
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer con totales */}
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {totals.lines} producto{totals.lines === 1 ? '' : 's'} · {totals.units.toFixed(0)} unidades
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Total a costo
                  </div>
                  <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(totals.cost)}
                  </div>
                </div>
                <div className="flex gap-2">
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
                    disabled={submitting || cart.length === 0}
                  >
                    <Save className="h-4 w-4" />
                    {submitting ? 'Registrando...' : 'Registrar consumo'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
