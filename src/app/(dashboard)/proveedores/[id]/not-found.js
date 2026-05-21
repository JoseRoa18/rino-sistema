import Link from 'next/link';
import { Truck } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Truck className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-700" />
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Proveedor no encontrado
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        No existe un proveedor con ese ID o fue eliminado.
      </p>
      <Link href="/proveedores" className="btn-primary mt-4">
        Volver a Proveedores
      </Link>
    </div>
  );
}
