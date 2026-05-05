import { SkeletonBox, SkeletonText, KPICardSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <SkeletonText className="mb-3 w-32" />
        <SkeletonBox className="h-8 w-72" />
        <div className="mt-2 flex gap-3">
          <SkeletonText className="w-24" />
          <SkeletonText className="w-24" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <KPICardSkeleton key={i} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <SkeletonText className="mb-4 w-32" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between border-b border-slate-100 py-2 dark:border-slate-800">
              <SkeletonText className="w-20" />
              <SkeletonText className="w-24" />
            </div>
          ))}
        </div>
        <div className="card p-5 lg:col-span-2">
          <SkeletonText className="mb-4 w-40" />
          <SkeletonBox className="h-64 w-full" />
        </div>
      </div>

      <div className="card p-5">
        <SkeletonBox className="h-64 w-full" />
      </div>
    </div>
  );
}
