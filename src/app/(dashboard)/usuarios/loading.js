import { SkeletonBox, PageHeaderSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton title="Usuarios" subtitle="Gestión de cuentas y roles" />
      <SkeletonBox className="h-32" />
      <div className="card overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-slate-100 p-3">
            <SkeletonBox className="h-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
