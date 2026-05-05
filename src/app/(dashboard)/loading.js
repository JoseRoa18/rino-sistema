import { SkeletonBox } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <SkeletonBox className="h-8 w-48" />
      <SkeletonBox className="h-4 w-64" />
      <div className="card p-6">
        <SkeletonBox className="mb-3 h-5 w-1/3" />
        <SkeletonBox className="h-32" />
      </div>
    </div>
  );
}
