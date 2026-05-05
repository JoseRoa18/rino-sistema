import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = createClient();

  const [me, profilesRes] = await Promise.all([
    getCurrentProfile(),
    supabase.from('profiles').select('*').order('full_name'),
  ]);

  if (me?.role !== 'admin') redirect('/dashboard');

  const profiles = profilesRes.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Usuarios</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Gestión de cuentas y roles</p>
      </div>

      <div className="card p-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-slate-100">Para crear un nuevo usuario:</strong>
        </p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>Ve al panel de Supabase &rarr; Authentication &rarr; Users &rarr; Add user</li>
          <li>Crea el usuario con email y contraseña</li>
          <li>Vuelve aquí y asigna el rol correspondiente desde la tabla</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          (En la Semana 3 se añade un formulario para crear usuarios directamente desde aquí.)
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Rol</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {(profiles || []).map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{p.full_name}</td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.email}</td>
                <td className="px-4 py-3 text-sm capitalize text-slate-600 dark:text-slate-400">{p.role}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.active
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
