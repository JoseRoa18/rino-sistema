import {
  KPICardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
  ChartCardSkeleton,
  SkeletonBox,
} from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton title="Ventas" subtitle="Cargando historial..." />

      {/* Analytics KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <ChartCardSkeleton height="h-48" />
        <ChartCardSkeleton height="h-32" />
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBox className="h-12 flex-1 min-w-[260px]" />
        <SkeletonBox className="h-9 w-24" />
        <SkeletonBox className="h-9 w-32" />
        <SkeletonBox className="h-9 w-28" />
      </div>

      <TableSkeleton rows={8} columns={7} />
    </div>
  );
}
