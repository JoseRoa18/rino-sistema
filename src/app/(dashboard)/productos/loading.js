import {
  PageHeaderSkeleton,
  TableSkeleton,
  SkeletonBox,
} from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeaderSkeleton title="Productos" subtitle="Catálogo y precios" />
        <SkeletonBox className="h-10 w-40" />
      </div>

      {/* Search + filters */}
      <div className="card p-3 space-y-3">
        <SkeletonBox className="h-10" />
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBox key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>

      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
