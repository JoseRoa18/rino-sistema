'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp, Users,
  Boxes, FileText, CreditCard, Truck, LogOut, Menu, X, ChevronDown,
  Receipt, Wallet, UserCog, MoreHorizontal, Home,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from './ThemeToggle';
import GlobalSearch from './GlobalSearch';
import RinoLogo from './RinoLogo';

// Items principales — siempre visibles en la barra
const PRIMARY_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'supervisor'] },
  { href: '/pos',        label: 'POS',          icon: ShoppingCart,    roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/ventas',     label: 'Ventas',       icon: Receipt,         roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/productos',  label: 'Productos',    icon: Package,         roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/caja',       label: 'Caja',         icon: Wallet,          roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/tasas',      label: 'Tasas',        icon: TrendingUp,      roles: ['admin', 'supervisor', 'cajero'] },
];

// Items secundarios — agrupados en dropdown "Más"
const SECONDARY_ITEMS = [
  { href: '/inventario', label: 'Inventario',   icon: Boxes,           roles: ['admin', 'supervisor'] },
  { href: '/clientes',   label: 'Clientes',     icon: Users,           roles: ['admin', 'supervisor', 'cajero'] },
  { href: '/creditos',   label: 'Créditos',     icon: CreditCard,      roles: ['admin', 'supervisor'] },
  { href: '/proveedores',label: 'Proveedores',  icon: Truck,           roles: ['admin', 'supervisor'] },
  { href: '/familia',    label: 'Familia',      icon: Home,            roles: ['admin', 'supervisor'] },
  { href: '/reportes',   label: 'Reportes',     icon: FileText,        roles: ['admin', 'supervisor'] },
  { href: '/usuarios',   label: 'Usuarios',     icon: UserCog,         roles: ['admin', 'supervisor'] },
];

const ROLE_LABELS = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  cajero: 'Cajero',
};

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase();
}

export default function TopNav({ profile, rate }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  const role = profile?.role || 'cajero';
  const primaryItems = PRIMARY_ITEMS.filter((it) => it.roles.includes(role));
  const secondaryItems = SECONDARY_ITEMS.filter((it) => it.roles.includes(role));
  const allItems = [...primaryItems, ...secondaryItems]; // para el menú móvil
  const initials = getInitials(profile?.full_name);

  // Cerrar dropdown "Más" al hacer click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [moreOpen]);

  // ¿Está activa alguna ruta dentro del dropdown "Más"?
  const moreIsActive = secondaryItems.some(
    (it) => !it.disabled && (pathname === it.href || pathname.startsWith(it.href + '/'))
  );

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // Render común para item — link si está habilitado, span gris si no
  function NavItem({ item, mobile = false, dropdown = false, onClick }) {
    const Icon = item.icon;
    const active = !item.disabled && (pathname === item.href || pathname.startsWith(item.href + '/'));

    let baseClasses;
    if (mobile) {
      baseClasses = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition';
    } else if (dropdown) {
      baseClasses = 'flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium transition';
    } else {
      baseClasses = 'flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition xl:px-3';
    }

    if (item.disabled) {
      return (
        <span
          title="Próximamente disponible"
          className={`${baseClasses} cursor-not-allowed text-slate-300 dark:text-slate-600`}
        >
          <Icon className={mobile || dropdown ? 'h-4 w-4 flex-shrink-0' : 'h-4 w-4 flex-shrink-0'} />
          <span>{item.label}</span>
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            Pronto
          </span>
        </span>
      );
    }

    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={`${baseClasses} ${
          active
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-3 px-3 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            href={role === 'cajero' ? '/pos' : '/dashboard'}
            className="flex flex-shrink-0 items-center gap-2"
            aria-label="Inicio"
          >
            <RinoLogo
              variant="icon"
              iconClassName="h-9 w-9 text-slate-900 dark:text-slate-100"
            />
            <div className="hidden leading-none sm:block">
              <p className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Rino
              </p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Sistema · Plataforma
              </p>
            </div>
          </Link>

          <nav className="ml-2 hidden flex-shrink-0 items-center gap-0.5 lg:flex xl:ml-4 xl:gap-1">
            {primaryItems.map((item) => <NavItem key={item.href} item={item} />)}

            {/* Dropdown "Más" — solo si hay items secundarios para este rol */}
            {secondaryItems.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition xl:px-3 ${
                    moreIsActive || moreOpen
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                >
                  <MoreHorizontal className="h-4 w-4 flex-shrink-0" />
                  <span>Más</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                </button>

                {moreOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {secondaryItems.map((item) => (
                      <NavItem
                        key={item.href}
                        item={item}
                        dropdown
                        onClick={() => setMoreOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Buscador global — siempre visible, ocupa el espacio disponible */}
          <div className="mx-2 min-w-0 max-w-md flex-1 sm:mx-4">
            <GlobalSearch />
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 2xl:flex">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="font-medium">VES:</span>
              <span className="font-mono font-semibold">
                {rate?.usd_ves_paralelo ? Number(rate.usd_ves_paralelo).toFixed(2) : '—'}
              </span>
              <span className="text-slate-400">·</span>
              <span className="font-medium">COP:</span>
              <span className="font-mono font-semibold">
                {rate?.usd_cop ? Number(rate.usd_cop).toFixed(0) : '—'}
              </span>
            </div>

            <ThemeToggle />

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg p-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">
                  {initials}
                </div>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>

              {userMenuOpen && (
                <>
                  <button
                    aria-label="Cerrar menú usuario"
                    onClick={() => setUserMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    <div className="border-b border-slate-100 p-3 dark:border-slate-800">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {profile?.full_name || 'Usuario'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ROLE_LABELS[role] || role}
                      </p>
                      {profile?.email && (
                        <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
                          {profile.email}
                        </p>
                      )}
                    </div>
                    <div className="border-b border-slate-100 p-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400 2xl:hidden">
                      <p className="font-medium">Tasas del día</p>
                      <div className="mt-1 flex justify-between">
                        <span>USD/VES paralelo:</span>
                        <span className="font-mono font-semibold">
                          {rate?.usd_ves_paralelo ? Number(rate.usd_ves_paralelo).toFixed(2) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>USD/COP:</span>
                        <span className="font-mono font-semibold">
                          {rate?.usd_cop ? Number(rate.usd_cop).toFixed(0) : '—'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <LogOut className="h-4 w-4" />
                      Cerrar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <div className="relative flex h-full w-72 flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-700">
              <RinoLogo
                variant="mark"
                iconClassName="h-9 w-9 text-slate-900 dark:text-slate-100"
                textClassName="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100"
                subtitleClassName="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
              />
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {/* En móvil mostramos todos los items en lista plana */}
              {primaryItems.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  mobile
                  onClick={() => setMobileOpen(false)}
                />
              ))}
              {secondaryItems.length > 0 && (
                <>
                  <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Más opciones
                  </p>
                  {secondaryItems.map((item) => (
                    <NavItem
                      key={item.href}
                      item={item}
                      mobile
                      onClick={() => setMobileOpen(false)}
                    />
                  ))}
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}