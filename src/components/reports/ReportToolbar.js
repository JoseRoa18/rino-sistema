'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft, Calendar, FileDown, FileText, Printer, ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatRange, getPresets } from '@/lib/dates';
import { exportCSV, exportPDF, printReport } from '@/lib/export';

/**
 * Header reutilizable para todas las páginas de reporte.
 *
 * Props:
 *   - title, subtitle
 *   - backHref: ruta al pulsar la flecha (default /reportes)
 *   - range: { from, to } — estado actual del rango
 *   - onRangeChange(range)
 *   - exports?: { csv?, pdf? }  configuración de los botones de exportar
 *       csv: { filename, rows, columns }
 *       pdf: { filename, title, subtitle, meta?, tables, orientation? }
 *   - children: contenido a la derecha del título (badges, etc.)
 */
export default function ReportToolbar({
  title,
  subtitle,
  backHref = '/reportes',
  range,
  onRangeChange,
  exports,
  children,
}) {
  const router = useRouter();
  const presets = useMemo(() => getPresets(), []);
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [downloading, setDownloading] = useState(null);

  function applyPreset(p) {
    onRangeChange({ from: p.from, to: p.to });
    setOpen(false);
    setCustomOpen(false);
  }

  async function handlePDF() {
    if (!exports?.pdf) return;
    setDownloading('pdf');
    try {
      await exportPDF(exports.pdf);
    } catch (err) {
      console.error('[reports] PDF error', err);
      alert('No se pudo generar el PDF: ' + err.message);
    } finally {
      setDownloading(null);
    }
  }

  function handleCSV() {
    if (!exports?.csv) return;
    setDownloading('csv');
    try {
      exportCSV(exports.csv.filename, exports.csv.rows, exports.csv.columns);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4 print:hidden">
      {/* Top row: back + title + exports */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push(backHref)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
            {children}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {exports?.csv && (
            <button onClick={handleCSV} className="btn-secondary" disabled={!!downloading}>
              <FileDown className="h-4 w-4" />
              CSV
            </button>
          )}
          {exports?.pdf && (
            <button onClick={handlePDF} className="btn-secondary" disabled={!!downloading}>
              <FileText className="h-4 w-4" />
              {downloading === 'pdf' ? 'Generando...' : 'PDF'}
            </button>
          )}
          <button onClick={printReport} className="btn-secondary">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Date range picker */}
      {range && (
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <div className="relative">
            <button
              onClick={() => { setOpen((v) => !v); setCustomOpen(false); }}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Calendar className="h-4 w-4 text-slate-400" />
              {formatRange(range)}
              <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <>
                <button
                  aria-label="Cerrar"
                  onClick={() => setOpen(false)}
                  className="fixed inset-0 z-30 cursor-default"
                />
                <div className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {presets.map((p) => {
                    const active = range.from === p.from && range.to === p.to;
                    return (
                      <button
                        key={p.value}
                        onClick={() => applyPreset(p)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-sm transition ${
                          active
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    onClick={() => { setOpen(false); setCustomOpen(true); }}
                    className="flex w-full items-center px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Rango personalizado…
                  </button>
                </div>
              </>
            )}
          </div>

          {customOpen && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="label">Desde</label>
                <input
                  type="date"
                  value={range.from || ''}
                  onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Hasta</label>
                <input
                  type="date"
                  value={range.to || ''}
                  onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
                  className="input"
                />
              </div>
              <button
                onClick={() => setCustomOpen(false)}
                className="btn-secondary"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
