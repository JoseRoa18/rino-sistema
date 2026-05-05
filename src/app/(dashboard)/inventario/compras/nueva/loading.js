import { SkeletonBox, SkeletonText } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <SkeletonText className="mb-3 w-32" />
        <SkeletonBox className="h-8 w-48" />
        <SkeletonText className="mt-2 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <SkeletonBox className="h-96 w-full" />
          <SkeletonBox className="h-32 w-full" />
        </div>
        <div className="lg:col-span-2">
          <SkeletonBox className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
}
