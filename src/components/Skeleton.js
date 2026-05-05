export function SkeletonBox({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800 ${className}`} />;
}

export function SkeletonText({ className = '' }) {
  return <div className={`h-4 animate-pulse rounded bg-slate-200/70 dark:bg-slate-800 ${className}`} />;
}

/**
 * Esqueleto de KPI con la barra de acento gris a la izquierda — refleja
 * la nueva forma de KPICard para que el "salto" al cargar sea mínimo.
 */
export function KPICardSkeleton() {
  return (
    <div className="card relative overflow-hidden p-5 pl-6">
      <span className="absolute inset-y-0 left-0 w-1 bg-slate-200 dark:bg-slate-700" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-3">
          <SkeletonText className="w-2/3" />
          <SkeletonBox className="h-7 w-24" />
          <SkeletonText className="h-3 w-1/2" />
        </div>
        <SkeletonBox className="h-10 w-10" />
      </div>
    </div>
  );
}

export function PageHeaderSkeleton({ title, subtitle }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
  );
}

/**
 * Esqueleto de tabla — hace match con el patrón visual real:
 * card con header gris, filas de altura consistente.
 */
export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="grid gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50"
           style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonText key={i} className="h-3 w-2/3" />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid gap-4 px-4 py-3.5"
               style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, j) => (
              <SkeletonText
                key={j}
                className={j === 0 ? 'h-4 w-1/2' : 'h-4 w-3/4'}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tarjeta con un placeholder de gráfico (header + área grande).
 * Útil para el chart de 30 días del dashboard o gráficos secundarios.
 */
export function ChartCardSkeleton({ height = 'h-64' }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="space-y-1.5">
          <SkeletonText className="h-4 w-40" />
          <SkeletonText className="h-3 w-24" />
        </div>
      </div>
      <SkeletonBox className={`w-full ${height}`} />
    </div>
  );
}
