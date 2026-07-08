'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { IdCard, Search, UserPlus, ArrowRight, Users, Pause, X } from 'lucide-react';

// Normaliza una cédula/RIF quitando separadores para comparar sin importar el
// formato (V-12.345.678 == v12345678).
const normDoc = (s) => String(s || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();

/**
 * Gate obligatorio de identificación de cliente al iniciar la venta.
 * Pide la cédula/RIF; si existe → selecciona; si no → registrar nuevo.
 * Como respaldo (cliente sin cédula a mano o consumo familiar) permite buscar
 * por nombre sobre los clientes ya cargados.
 */
export default function CedulaGate({ customers, role, onSelect, onRegister, onClose, parkedCount = 0, onOpenParked }) {
  const [doc, setDoc] = useState('');
  const [searched, setSearched] = useState(false);
  const [nameMode, setNameMode] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  const canFamily = role === 'admin' || role === 'supervisor';

  useEffect(() => { inputRef.current?.focus(); }, [nameMode]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && onClose) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const docMatches = useMemo(() => {
    const t = normDoc(doc);
    if (!t) return [];
    return customers.filter((c) => c.document_id && normDoc(c.document_id) === t);
  }, [doc, customers]);

  const nameMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => canFamily || !c.is_internal) // Familia solo para admin/supervisor
      .filter((c) => `${c.name} ${c.document_id || ''} ${c.phone || ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [name, customers, canFamily]);

  function submitDoc(e) {
    e?.preventDefault();
    setSearched(true);
    if (!normDoc(doc)) return;
    // Si hay exactamente uno, procede directo con la facturación.
    if (docMatches.length === 1) onSelect(docMatches[0]);
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      onClick={() => onClose && onClose()}
    >
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
            <IdCard className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Identificar cliente</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ingresa la cédula o RIF del cliente para comenzar la venta
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="-mr-1 -mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {!nameMode ? (
          <>
            <form onSubmit={submitDoc} className="flex gap-2">
              <input
                ref={inputRef}
                value={doc}
                onChange={(e) => { setDoc(e.target.value); setSearched(false); }}
                placeholder="V-12345678 / J-12345678-9"
                className="input flex-1 font-mono"
              />
              <button type="submit" className="btn-primary whitespace-nowrap">
                <Search className="h-4 w-4" />
                Buscar
              </button>
            </form>

            {searched && normDoc(doc) && docMatches.length === 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-amber-800 dark:text-amber-300">
                  No existe un cliente con la cédula <strong>{doc.trim()}</strong>.
                </p>
                <button onClick={() => onRegister(doc.trim())} className="btn-primary mt-3 w-full">
                  <UserPlus className="h-4 w-4" />
                  Registrar nuevo cliente
                </button>
              </div>
            )}

            {docMatches.length > 1 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Varios clientes con esa cédula, elige uno:
                </p>
                {docMatches.map((c) => (
                  <CustomerRow key={c.id} c={c} onClick={() => onSelect(c)} />
                ))}
              </div>
            )}

            <button
              onClick={() => { setNameMode(true); setSearched(false); }}
              className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            >
              <Users className="h-3.5 w-3.5" />
              Buscar por nombre{canFamily ? ' / consumo familiar' : ''}
            </button>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del cliente..."
              className="input"
            />
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {nameMatches.map((c) => (
                <CustomerRow key={c.id} c={c} onClick={() => onSelect(c)} family={c.is_internal} />
              ))}
              {name.trim() && nameMatches.length === 0 && (
                <p className="py-3 text-center text-xs text-slate-400">Sin resultados</p>
              )}
            </div>
            <button
              onClick={() => setNameMode(false)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            >
              <IdCard className="h-3.5 w-3.5" />
              Volver a cédula
            </button>
          </>
        )}

        {parkedCount > 0 && onOpenParked && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              onClick={onOpenParked}
              className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            >
              <Pause className="h-3.5 w-3.5" />
              Recuperar venta en espera ({parkedCount})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerRow({ c, onClick, family }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-left transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {c.name}{family ? ' · Familia' : ''}
        </div>
        <div className="truncate font-mono text-[11px] text-slate-400">
          {c.document_id || 'sin cédula'}{c.phone ? ` · ${c.phone}` : ''}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
    </button>
  );
}
