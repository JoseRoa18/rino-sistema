/**
 * Encabezado consistente para todas las páginas.
 *
 *   <PageHeader
 *     title="Productos"
 *     subtitle="Catálogo y precios"
 *     actions={<button className="btn-primary">Nuevo</button>}
 *   />
 *
 * Si pasas `eyebrow`, sale como mini-tag arriba del título (útil para
 * subsecciones tipo "Resultados / Q3 2025").
 */
export default function PageHeader({ title, subtitle, actions, eyebrow }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
