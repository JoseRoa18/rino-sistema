import {
  KPICardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
  SkeletonBox,
} from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeaderSkeleton
          title="Tasas cambiarias"
          subtitle="Cargando histórico..."
        />
        <SkeletonBox className="h-10 w-36" />
      </div>

      {/* 4 rate cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>

      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
