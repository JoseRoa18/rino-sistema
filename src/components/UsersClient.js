'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  Users, UserPlus, Shield, ShieldCheck, ShieldAlert,
  KeyRound, Pencil, Trash2, Power, PowerOff, AlertCircle, CheckCircle2,
  X, Eye, EyeOff, Activity, DollarSign, Clock,
} from 'lucide-react';
import KPICard from './KPICard';
import PageHeader from './PageHeader';
import { formatMoney } from '@/lib/pricing';
import {
  createUserAction,
  updateUserAction,
  setUserPasswordAction,
  deleteUserAction,
} from '@/app/(dashboard)/usuarios/actions';

const ROLE_META = {
  admin:      { label: 'Admin',      icon: ShieldCheck, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400' },
  supervisor: { label: 'Supervisor', icon: Shield,      cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' },
  cajero:     { label: 'Cajero',     icon: Users,       cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' },
};

function timeAgo(iso) {
  if (!iso) return 'Nunca';
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60)        return 'Hace un momento';
  if (diffSec < 3600)      return `Hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400)     return `Hace ${Math.floor(diffSec / 3600)} h`;
  if (diffSec < 86400 * 7) return `Hace ${Math.floor(diffSec / 86400)} días`;
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsersClient({ users: initialUsers, currentUser, loadError }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [showNew, setShowNew] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [flash, setFlash] = useState(null); // { type: 'success'|'error', text }
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showInactive, setShowInactive] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const kpis = useMemo(() => {
    const k = { total: 0, active: 0, admins: 0, salesToday: 0, revenueToday: 0 };
    for (const u of users) {
      k.total += 1;
      if (u.active) k.active += 1;
      if (u.role === 'admin') k.admins += 1;
      k.salesToday += Number(u.sales_today) || 0;
      k.revenueToday += Number(u.revenue_today) || 0;
    }
    return k;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!showInactive && !u.active) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q && !(
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [users, search, roleFilter, showInactive]);

  function handleSuccess(message) {
    setFlash({ type: 'success', text: message });
    setTimeout(() => setFlash(null), 3500);
  }
  function handleError(message) {
    setFlash({ type: 'error', text: message });
    setTimeout(() => setFlash(null), 5000);
  }

  async function onCreated(newUser) {
    // Refrescar localmente. Las stats vendrán en próximo router.refresh.
    setUsers((prev) => [
      {
        ...newUser,
        active: true,
        sales_today: 0, revenue_today: 0,
        sales_30d: 0, revenue_30d: 0, voided_30d: 0,
        last_sign_in_at: null,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setShowNew(false);
    handleSuccess(`Usuario ${newUser.full_name} creado correctamente.`);
  }

  async function onUpdated(userId, patch) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...patch } : u)));
    setEditTarget(null);
    handleSuccess('Cambios guardados.');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de cuentas, roles y permisos del equipo"
        actions={
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <UserPlus className="h-4 w-4" />
            Nuevo usuario
          </button>
        }
      />

      {flash && (
        <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
          flash.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
            : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
        }`}>
          {flash.type === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
          <span>{flash.text}</span>
          <button onClick={() => setFlash(null)} className="ml-auto text-xs underline">cerrar</button>
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="font-medium text-amber-800 dark:text-amber-400">
            ⚠️ No se pudieron cargar las estadísticas de usuarios.
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/80">
            {loadError}. Asegúrate de aplicar la migración{' '}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">013_users_module.sql</code> en Supabase.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="Usuarios totales" value={kpis.total} hint={`${kpis.active} activos`} icon={Users} accent="brand" />
        <KPICard label="Administradores" value={kpis.admins} hint="con acceso total" icon={ShieldCheck} accent="rose" />
        <KPICard label="Ventas hoy" value={kpis.salesToday} hint="transacciones del equipo" icon={Activity} accent="violet" />
        <KPICard label="Ingresos hoy" value={formatMoney(kpis.revenueToday)} hint="del equipo completo" icon={DollarSign} accent="emerald" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
          <input
            type="search"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input min-w-[220px] flex-1"
          />
          <select
            className="input w-auto"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">Todos los roles</option>
            <option value="admin">Admin</option>
            <option value="supervisor">Supervisor</option>
            <option value="cajero">Cajero</option>
          </select>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
            />
            Mostrar inactivos
          </label>
        </div>

        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Rol</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Ventas hoy</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Últimos 30d</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Último ingreso</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {filtered.map((u) => {
              const role = ROLE_META[u.role] || ROLE_META.cajero;
              const RoleIcon = role.icon;
              const isMe = u.id === currentUser.id;
              const isTargetAdmin = u.role === 'admin';
              const canEdit = !isMe && (isAdmin || !isTargetAdmin);
              return (
                <tr key={u.id} className={u.active ? '' : 'opacity-60'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-400">
                        {(u.full_name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {u.full_name || '(sin nombre)'}
                          {isMe && <span className="ml-1.5 text-[10px] font-normal text-slate-400">(tú)</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${role.cls}`}>
                      <RoleIcon className="h-3 w-3" />
                      {role.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-slate-700 dark:text-slate-300">
                    <div>{Number(u.sales_today) || 0}</div>
                    <div className="text-[10px] text-slate-400">{formatMoney(u.revenue_today)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-slate-700 dark:text-slate-300">
                    <div>{Number(u.sales_30d) || 0}</div>
                    <div className="text-[10px] text-slate-400">{formatMoney(u.revenue_30d)}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(u.last_sign_in_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.active
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditTarget(u)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPasswordTarget(u)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-500/15 dark:hover:text-amber-400"
                          title="Cambiar contraseña"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  Ningún usuario coincide con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <UserForm
          mode="create"
          currentUserRole={currentUser.role}
          onClose={() => setShowNew(false)}
          onSaved={onCreated}
          onError={handleError}
        />
      )}
      {editTarget && (
        <UserForm
          mode="edit"
          initialUser={editTarget}
          currentUserRole={currentUser.role}
          onClose={() => setEditTarget(null)}
          onSaved={(patch) => onUpdated(editTarget.id, patch)}
          onError={handleError}
        />
      )}
      {passwordTarget && (
        <PasswordModal
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSaved={() => {
            setPasswordTarget(null);
            handleSuccess(`Contraseña actualizada para ${passwordTarget.full_name}.`);
          }}
          onError={handleError}
        />
      )}
      {deleteTarget && (
        <DeleteUserModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={(result) => {
            // result puede traer { softDeleted, message }
            setUsers((prev) =>
              result.softDeleted
                ? prev.map((u) =>
                    u.id === deleteTarget.id ? { ...u, active: false } : u
                  )
                : prev.filter((u) => u.id !== deleteTarget.id)
            );
            const wasSoft = result.softDeleted;
            const name = deleteTarget.full_name;
            setDeleteTarget(null);
            handleSuccess(
              wasSoft
                ? result.message || `${name} se desactivó (tenía registros asociados).`
                : `${name} fue eliminado correctamente.`
            );
          }}
          onError={handleError}
        />
      )}
    </div>
  );
}

// =========================================================================
// UserForm: modal para crear o editar
// =========================================================================
function UserForm({ mode, initialUser, currentUserRole, onClose, onSaved, onError }) {
  const isEdit = mode === 'edit';

  const [form, setForm] = useState({
    email:     initialUser?.email || '',
    full_name: initialUser?.full_name || '',
    role:      initialUser?.role || 'cajero',
    password:  '',
    active:    initialUser?.active ?? true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function submit(e) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      if (isEdit) {
        const patch = {
          full_name: form.full_name,
          role: form.role,
          active: form.active,
        };
        const res = await updateUserAction({ userId: initialUser.id, ...patch });
        if (!res.ok) {
          setError(res.error);
          onError(res.error);
          return;
        }
        onSaved(patch);
      } else {
        const res = await createUserAction(form);
        if (!res.ok) {
          setError(res.error);
          onError(res.error);
          return;
        }
        onSaved({ id: res.userId, ...form });
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input
              className="input"
              required
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              className="input"
              required
              disabled={isEdit}
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
            {isEdit && (
              <p className="mt-1 text-[10px] text-slate-400">
                El email no se puede cambiar desde aquí.
              </p>
            )}
          </div>
          {!isEdit && (
            <div>
              <label className="label">Contraseña inicial *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Compártela con el empleado de manera segura.
              </p>
            </div>
          )}
          <div>
            <label className="label">Rol</label>
            <select
              className="input"
              value={form.role === 'supervisor' ? 'cajero' : form.role}
              onChange={(e) => update('role', e.target.value)}
            >
              <option value="cajero">Cajero</option>
              <option value="admin">Administrador</option>
            </select>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              Administrador: acceso total. Cajero: solo POS.
            </p>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update('active', e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800"
              />
              Usuario activo
              <span className="text-[10px] text-slate-400">
                (los inactivos no pueden iniciar sesión)
              </span>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// PasswordModal: modal para cambiar contraseña
// =========================================================================
function PasswordModal({ user, onClose, onSaved, onError }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    startTransition(async () => {
      const res = await setUserPasswordAction({ userId: user.id, newPassword: password });
      if (!res.ok) {
        setError(res.error);
        onError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <KeyRound className="h-5 w-5" />
            Cambiar contraseña
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <p className="font-medium text-slate-900 dark:text-slate-100">{user.full_name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>

          <div>
            <label className="label">Nueva contraseña *</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                className="input pr-10"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">Confirmar contraseña *</label>
            <input
              type={show ? 'text' : 'password'}
              className="input"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>El cambio es inmediato. El usuario tendrá que usar esta nueva contraseña en su próximo inicio de sesión.</span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// DeleteUserModal: confirma y elimina al usuario
// =========================================================================
function DeleteUserModal({ user, onClose, onDone, onError }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [confirmText, setConfirmText] = useState('');

  // Para evitar borrados accidentales, pedimos que el admin escriba el
  // nombre del usuario.
  const expected = (user.full_name || '').trim();
  const canDelete = confirmText.trim() === expected;

  function submit(e) {
    e.preventDefault();
    setError('');
    if (!canDelete) {
      setError('Escribe el nombre exacto para confirmar');
      return;
    }
    startTransition(async () => {
      const res = await deleteUserAction({ userId: user.id });
      if (!res.ok) {
        setError(res.error);
        onError(res.error);
        return;
      }
      onDone({ softDeleted: res.softDeleted, message: res.message });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-rose-700 dark:text-rose-400">
            <Trash2 className="h-5 w-5" />
            Eliminar usuario
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <p className="font-medium text-slate-900 dark:text-slate-100">{user.full_name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Esta acción no se puede deshacer.</p>
              <p className="mt-1">
                Si el usuario tiene ventas u otros registros asociados, no se
                podrá borrar definitivamente y se desactivará en su lugar.
              </p>
            </div>
          </div>

          <div>
            <label className="label">
              Escribe <strong className="font-mono">{expected}</strong> para confirmar
            </label>
            <input
              className="input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={pending || !canDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300 dark:disabled:bg-rose-900/50"
            >
              <Trash2 className="h-4 w-4" />
              {pending ? 'Eliminando...' : 'Eliminar usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
