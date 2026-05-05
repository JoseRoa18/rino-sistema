import { SkeletonBox, SkeletonText, KPICardSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SkeletonBox className="mb-2 h-8 w-44" />
          <SkeletonText className="w-64" />
        </div>
        <div className="flex gap-2">
          <SkeletonBox className="h-10 w-32" />
          <SkeletonBox className="h-10 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <KPICardSkeleton key={i} />)}
      </div>

      <div className="card p-3">
        <SkeletonBox className="h-10 w-full" />
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <SkeletonBox key={i} className="h-7 w-24 rounded-full" />)}
        </div>
      </div>

      <div className="card overflow-hidden">
        <SkeletonBox className="h-96 w-full" />
      </div>
    </div>
  );
}
