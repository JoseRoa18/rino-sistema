import {
  KPICardSkeleton,
  PageHeaderSkeleton,
  TableSkeleton,
  SkeletonBox,
} from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton title="Créditos" subtitle="Cuentas por cobrar y registro de pagos" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <KPICardSkeleton key={i} />)}
      </div>

      <div className="flex flex-wrap gap-2">
        <SkeletonBox className="h-10 flex-1 min-w-[260px]" />
        <SkeletonBox className="h-9 w-72" />
      </div>

      <TableSkeleton rows={8} columns={8} />
    </div>
  );
}
