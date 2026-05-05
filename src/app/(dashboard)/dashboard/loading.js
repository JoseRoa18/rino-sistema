import {
  KPICardSkeleton,
  PageHeaderSkeleton,
  ChartCardSkeleton,
  TableSkeleton,
  SkeletonBox,
  SkeletonText,
} from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton title="Dashboard" subtitle="Vista general del negocio" />

      {/* Hoy */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <SkeletonText className="h-3 w-12" />
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <KPICardSkeleton key={i} />)}
        </div>
      </section>

      {/* Período */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <SkeletonText className="h-3 w-16" />
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <KPICardSkeleton key={i} />)}
        </div>
      </section>

      {/* Alertas */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <SkeletonText className="h-3 w-14" />
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => <KPICardSkeleton key={i} />)}
        </div>
      </section>

      {/* Chart */}
      <ChartCardSkeleton />

      {/* Donut + Top productos */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCardSkeleton height="h-44" />
        <ChartCardSkeleton height="h-44" />
      </div>

      {/* Últimas ventas */}
      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}
