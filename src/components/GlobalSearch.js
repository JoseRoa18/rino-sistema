'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, X, Package } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/pricing';

/**
 * Buscador global de productos.
 *
 * Vive en el TopNav y permite buscar cualquier producto del catálogo por
 * nombre o SKU. Al seleccionar uno, navega a /productos/[id] donde se
 * muestra la ficha completa con historial de ventas, compras y precios.
 *
 * Atajos:
 *   - ⌘K / Ctrl+K  → enfocar el input
 *   - ↑ / ↓        → mover selección
 *   - Enter        → abrir el producto resaltado
 *   - Esc          → cerrar el dropdown
 */
export default function GlobalSearch() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Atajo de teclado ⌘K / Ctrl+K para enfocar
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [open]);

  // Búsqueda con debounce
  const runSearch = useCallback(async (raw) => {
    const q = (raw || '').trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Sanitizar caracteres que rompen la sintaxis del filtro .or() de PostgREST
    const safe = q.replace(/[%,()\\]/g, '');
    if (!safe) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, stock, min_stock, price_usd, unit, active, categories(name)')
      .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
      .order('active', { ascending: false })
      .order('name')
      .limit(8);

    setLoading(false);
    if (error) {
      console.error('[GlobalSearch] error:', error);
      setResults([]);
      return;
    }
    setResults(data || []);
    setHighlighted(0);
  }, []);

  function handleChange(e) {
    const value = e.target.value;
    setTerm(value);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 200);
  }

  function selectProduct(product) {
    if (!product) return;
    setOpen(false);
    setTerm('');
    setResults([]);
    router.push(`/productos/${product.id}`);
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setOpen(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectProduct(results[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function clearTerm() {
    setTerm('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  const showDropdown = open && term.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={handleChange}
          onFocus={() => term.trim().length >= 2 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar producto por nombre o SKU…"
          className="input pl-9 pr-16"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {term && (
            <button
              type="button"
              onClick={clearTerm}
              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {!term && (
            <kbd className="hidden items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500 sm:inline-flex">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading && results.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando…
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              No se encontraron productos para
              <span className="ml-1 font-medium text-slate-600 dark:text-slate-300">"{term}"</span>
            </div>
          )}

          {results.map((product, idx) => {
            const lowStock = Number(product.stock) <= Number(product.min_stock || 0);
            const isHighlighted = idx === highlighted;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => selectProduct(product)}
                onMouseEnter={() => setHighlighted(idx)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  isHighlighted
                    ? 'bg-brand-50 dark:bg-brand-500/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                  <Package className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {product.name}
                    </p>
                    {!product.active && (
                      <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {product.sku && <span className="font-mono">{product.sku}</span>}
                    {product.sku && product.categories?.name && <span>·</span>}
                    {product.categories?.name && <span>{product.categories.name}</span>}
                  </div>
                </div>

                <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formatMoney(product.price_usd, 'USD')}
                  </span>
                  <span
                    className={`text-[11px] ${
                      lowStock
                        ? 'text-amber-600 dark:text-amber-500'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    Stock: {Number(product.stock).toLocaleString('es-VE')} {product.unit}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
