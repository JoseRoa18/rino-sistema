'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp, Users,
  Boxes, FileText, CreditCard, Truck, LogOut, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const ALL_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'supervisor'] },
  { href: '/pos',        label: 'POS / Ventas', icon: ShoppingCart,    roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/productos',  label: 'Productos',    icon: Package,         roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/inventario', label: 'Inventario',   icon: Boxes,           roles: ['admin', 'supervisor'] },
  { href: '/clientes',   label: 'Clientes',     icon: Users,           roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/creditos',   label: 'Créditos',     icon: CreditCard,      roles: ['admin', 'supervisor'] },
  { href: '/proveedores',label: 'Proveedores',  icon: Truck,           roles: ['admin'] },
  { href: '/tasas',      label: 'Tasas',        icon: TrendingUp,      roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/reportes',   label: 'Reportes',     icon: FileText,        roles: ['admin', 'supervisor'] },
  { href: '/usuarios',   label: 'Usuarios',     icon: Users,           roles: ['admin'] },
];

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase();
}

const ROLE_LABELS = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  cajero: 'Cajero',
};

export default function Sidebar({ profile, isOpen, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = profile?.role || 'cajero';
  const items = ALL_ITEMS.filter((it) => it.roles.includes(role));
  const initials = getInitials(profile?.full_name);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out dark:border-slate-700 dark:bg-slate-900 md:static md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-700">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
          <span className="text-lg font-bold">R</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            Sistema Rino
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            Gestión comercial
          </p>
        </div>
        <button
          onClick={onClose}
          className="-mr-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 md:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User footer con avatar */}
      <div className="border-t border-slate-200 p-3 dark:border-slate-700">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {profile?.full_name || 'Usuario'}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {ROLE_LABELS[role] || role}
            </p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-secondary w-full">
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
