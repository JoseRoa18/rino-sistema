/**
 * Mini-encabezado tipo "Hoy" / "Período" / "Alertas" usado para
 * subdividir grupos de KPIs o widgets dentro de una página.
 *
 * Por defecto incluye una pequeña línea decorativa a la derecha que ocupa
 * el espacio sobrante — ayuda a que la sección se sienta delimitada sin
 * meter un border-top que sería demasiado pesado.
 */
export default function SectionLabel({ children, hint, withDivider = true }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {children}
      </span>
      {hint && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {hint}
        </span>
      )}
      {withDivider && (
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      )}
    </div>
  );
}
