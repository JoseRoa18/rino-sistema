import {
  KPICardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
  SkeletonBox,
} from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeaderSkeleton title="Cierre de caja" subtitle="Cargando totales..." />
        <SkeletonBox className="h-10 w-28" />
      </div>

      <div className="card p-3">
        <SkeletonBox className="h-9 w-64" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>

      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}
