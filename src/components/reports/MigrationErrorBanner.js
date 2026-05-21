'use client';

import { AlertCircle } from 'lucide-react';

/**
 * Banner que se muestra cuando alguna vista de Postgres usada por el reporte
 * no existe — típicamente porque las migraciones 009/010 no se han aplicado.
 */
export default function MigrationErrorBanner({ error }) {
  if (!error) return null;
  const lower = error.toLowerCase();
  const looksLikeMissingView =
    lower.includes('does not exist') ||
    lower.includes('no existe') ||
    lower.includes('relation') ||
    lower.includes('not found');

  return (
    <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">
          No se pudieron cargar todos los datos del reporte.
        </p>
        <p className="text-xs">
          Error: <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-500/20">{error}</code>
        </p>
        {looksLikeMissingView && (
          <p className="text-xs">
            Esto suele ocurrir cuando faltan las vistas de la migración{' '}
            <code className="rounded bg-rose-100 px-1 py-0.5 dark:bg-rose-500/20">
              010_reports_views.sql
            </code>
            . Aplícala desde Supabase → SQL Editor y recarga la página.
          </p>
        )}
      </div>
    </div>
  );
}
