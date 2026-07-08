'use client';

import { useState, useMemo } from 'react';
import { Plus, Search, Edit, AlertTriangle, Trash2, RotateCcw, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ProductForm from '@/components/ProductForm';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { formatMoney } from '@/lib/pricing';

export default function ProductsClient({ initialProducts, categories, role, currentRates }) {
  const supabase = createClient();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [categoryId, setCategoryId] = useState('all'); // 'all' | category UUID | '__none__'
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');

  const isAdmin = role === 'admin';

  // Lookup rápido id → categoría (para mostrar el nombre en cada fila)
  const categoryById = useMemo(() => {
    const m = new Map();
    for (const c of categories || []) m.set(c.id, c);
    return m;
  }, [categories]);

  const counts = useMemo(() => ({
    active: products.filter((p) => p.active !== false).length,
    inactive: products.filter((p) => p.active === false).length,
  }), [products]);

  // Mensaje del estado vacío según qué filtros están aplicados
  const activeCategoryName = useMemo(() => {
    if (categoryId === 'all') return null;
    if (categoryId === '__none__') return 'sin categoría';
    return categoryById.get(categoryId)?.name || null;
  }, [categoryId, categoryById]);

  const emptyMessage = useMemo(() => {
    const hasSearch = search.trim().length > 0;
    if (hasSearch && activeCategoryName) {
      return `Ningún producto en "${activeCategoryName}" coincide con la búsqueda.`;
    }
    if (hasSearch) return 'Ningún producto coincide con la búsqueda.';
    if (activeCategoryName) return `No hay productos en "${activeCategoryName}".`;
    return 'No hay productos.';
  }, [search, activeCategoryName]);

  // Aplica búsqueda + activos/inactivos PERO no la categoría todavía.
  // De aquí salen los conteos que muestran los chips: cada chip dice "si haces
  // click en mí, vas a ver tantos productos" — respetando los otros filtros.
  const baseFiltered = useMemo(() => {
    let list = products;
    if (!showInactive) list = list.filter((p) => p.active !== false);
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      list = list.filter((p) => {
        const haystack = `${p.name} ${p.sku || ''}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      });
    }
    return list;
  }, [products, search, showInactive]);

  // Conteo por categoría sobre baseFiltered.
  const categoryCounts = useMemo(() => {
    const map = new Map();
    map.set('all', baseFiltered.length);
    let withoutCategory = 0;
    for (const p of baseFiltered) {
      if (!p.category_id) {
        withoutCategory += 1;
        continue;
      }
      map.set(p.category_id, (map.get(p.category_id) || 0) + 1);
    }
    map.set('__none__', withoutCategory);
    return map;
  }, [baseFiltered]);

  // Aplica el filtro de categoría sobre baseFiltered.
  const filtered = useMemo(() => {
    if (categoryId === 'all') return baseFiltered;
    if (categoryId === '__none__') return baseFiltered.filter((p) => !p.category_id);
    return baseFiltered.filter((p) => p.category_id === categoryId);
  }, [baseFiltered, categoryId]);

  async function reload() {
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts(data || []);
    setShowForm(false);
    setEditing(null);
  }

  function handleNew() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(p) {
    setEditing(p);
    setShowForm(true);
  }

  function requestDelete(p) {
    setActionError('');
    setDeleteTarget(p);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError('');

    const hardDelete = deleteTarget.active === false;

    let res;
    if (hardDelete) {
      res = await supabase.from('products').delete().eq('id', deleteTarget.id);
    } else {
      res = await supabase
        .from('products')
        .update({ active: false })
        .eq('id', deleteTarget.id);
    }

    if (res.error) {
      setActionError(res.error.message);
      setDeleting(false);
      return;
    }

    setDeleteTarget(null);
    setShowForm(false);
    setEditing(null);
    setDeleting(false);
    await reload();
  }

  async function reactivate(p) {
    setActionError('');
    const { error } = await supabase
      .from('products')
      .update({ active: true })
      .eq('id', p.id);
    if (error) {
      setActionError(error.message);
      return;
    }
    await reload();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos"
        subtitle={
          <>
            <span className="font-medium text-slate-700 dark:text-slate-300">{counts.active}</span> activos
            {counts.inactive > 0 && (
              <>
                {' '}
                <span className="text-slate-400">·</span>{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">{counts.inactive}</span> inactivos
              </>
            )}
          </>
        }
        actions={
          isAdmin && (
            <button onClick={handleNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Nuevo producto
            </button>
          )
        }
      />

      {actionError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {actionError}
        </div>
      )}

      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          {isAdmin && counts.inactive > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              Mostrar inactivos ({counts.inactive})
            </label>
          )}
        </div>

        {(categories?.length || 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <CategoryChip
              active={categoryId === 'all'}
              count={categoryCounts.get('all') || 0}
              onClick={() => setCategoryId('all')}
            >
              Todas
            </CategoryChip>
            {categories.map((c) => {
              const n = categoryCounts.get(c.id) || 0;
              return (
                <CategoryChip
                  key={c.id}
                  active={categoryId === c.id}
                  count={n}
                  disabled={n === 0 && categoryId !== c.id}
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </CategoryChip>
              );
            })}
            {(categoryCounts.get('__none__') || 0) > 0 && (
              <CategoryChip
                active={categoryId === '__none__'}
                count={categoryCounts.get('__none__') || 0}
                onClick={() => setCategoryId('__none__')}
              >
                Sin categoría
              </CategoryChip>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Producto</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 lg:table-cell">Categoría</th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Costo COP</th>
                )}
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Precio COP</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {filtered.map((p) => {
                const inactive = p.active === false;
                return (
                  <tr
                    key={p.id}
                    className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      inactive ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {p.sku || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{p.unit}</div>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 lg:table-cell">
                      {p.category_id && categoryById.has(p.category_id) ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {categoryById.get(p.category_id).name}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400">
                        {formatMoney(p.cost_avg_cop, 'COP')}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(p.price_cop, 'COP')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          p.stock <= p.min_stock
                            ? 'font-semibold text-amber-600 dark:text-amber-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {Number(p.stock).toLocaleString('es-VE')}
                        {p.stock <= p.min_stock && <AlertTriangle className="h-3.5 w-3.5" />}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {inactive ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Inactivo
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                          Activo
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {inactive ? (
                            <>
                              <button
                                onClick={() => reactivate(p)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                                title="Reactivar"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleEdit(p)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => requestDelete(p)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                title="Eliminar definitivamente"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEdit(p)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => requestDelete(p)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                                title="Desactivar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 6} className="p-0">
                    <EmptyState
                      icon={Package}
                      title={emptyMessage}
                      description={
                        search.trim()
                          ? 'Intenta con otro término o quita los filtros.'
                          : isAdmin
                            ? 'Empieza agregando tu primer producto al catálogo.'
                            : 'Pídele al administrador que agregue productos.'
                      }
                      action={
                        isAdmin && !search.trim() && (
                          <button onClick={handleNew} className="btn-primary">
                            <Plus className="h-4 w-4" />
                            Nuevo producto
                          </button>
                        )
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <ProductForm
          product={editing}
          categories={categories}
          rates={currentRates}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={reload}
          onDelete={(p) => {
            setShowForm(false);
            requestDelete(p);
          }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {deleteTarget.active === false ? 'Eliminar definitivamente' : 'Desactivar producto'}
              </h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400">
              {deleteTarget.active === false ? (
                <>
                  El producto <strong className="text-slate-900 dark:text-slate-100">{deleteTarget.name}</strong> ya está inactivo.
                  ¿Deseas eliminarlo definitivamente del sistema? Esta acción no se puede deshacer y solo
                  funcionará si no tiene ventas o compras asociadas.
                </>
              ) : (
                <>
                  Vas a desactivar <strong className="text-slate-900 dark:text-slate-100">{deleteTarget.name}</strong>.
                  Dejará de aparecer en el POS pero podrás reactivarlo cuando quieras desde el listado
                  marcando "Mostrar inactivos".
                </>
              )}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn-danger"
              >
                {deleting
                  ? 'Procesando...'
                  : deleteTarget.active === false
                  ? 'Eliminar definitivamente'
                  : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ active, count, disabled = false, onClick, children }) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition';
  if (active) {
    return (
      <button onClick={onClick} className={`${base} bg-brand-600 text-white shadow-sm hover:bg-brand-700`}>
        <span>{children}</span>
        <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
          {count}
        </span>
      </button>
    );
  }
  if (disabled) {
    return (
      <button
        onClick={onClick}
        className={`${base} cursor-not-allowed bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-600`}
        disabled
      >
        <span>{children}</span>
        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400 dark:bg-slate-900 dark:text-slate-600">
          {count}
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700`}
    >
      <span>{children}</span>
      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        {count}
      </span>
    </button>
  );
}