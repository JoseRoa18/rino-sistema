import { SkeletonBox, PageHeaderSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton title="Punto de Venta" subtitle="Registra ventas rápidas y precisas" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <SkeletonBox className="h-10" />
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonBox key={i} className="h-8 w-24" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <SkeletonBox key={i} className="h-28" />
            ))}
          </div>
        </div>

        <SkeletonBox className="h-96" />
      </div>
    </div>
  );
}
