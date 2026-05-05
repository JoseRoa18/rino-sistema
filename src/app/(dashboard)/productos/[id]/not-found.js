import Link from 'next/link';
import { PackageX, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <PackageX className="h-8 w-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
        Producto no encontrado
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        El producto que buscas no existe o fue eliminado.
      </p>
      <Link href="/productos" className="btn-primary mt-6 inline-flex">
        <ArrowLeft className="h-4 w-4" />
        Volver al catálogo
      </Link>
    </div>
  );
}
