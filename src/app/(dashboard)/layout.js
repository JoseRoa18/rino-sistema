import { redirect } from 'next/navigation';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { getCachedLatestRate } from '@/lib/cached-data';
import DashboardShell from '@/components/DashboardShell';

export default async function DashboardLayout({ children }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [profile, rate] = await Promise.all([
    getCurrentProfile(),
    getCachedLatestRate(),
  ]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Cuenta sin perfil
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Tu cuenta existe pero el administrador aún no ha activado tu perfil.
            Contacta al administrador del sistema.
          </p>
        </div>
      </div>
    );
  }

  if (!profile.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Cuenta desactivada
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Tu cuenta está desactivada. Contacta al administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell profile={profile} rate={rate}>
      {children}
    </DashboardShell>
  );
}
