'use client';

import { TrendingUp, Menu } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

/**
 * Header con tasas del día, botón hamburger en mobile y toggle de tema.
 * Recibe rate como prop (de getCachedLatestRate en layout server).
 */
export default function TopBar({ rate, onMenuClick }) {
  const today = new Date().toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden truncate text-sm text-slate-500 dark:text-slate-400 sm:block">
          {today}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 lg:flex">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="font-medium">USD/VES paralelo:</span>
          <span className="font-mono font-semibold">
            {rate?.usd_ves_paralelo ? Number(rate.usd_ves_paralelo).toFixed(2) : '—'}
          </span>
        </div>
        <div className="hidden items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 lg:flex">
          <span className="font-medium">USD/COP:</span>
          <span className="font-mono font-semibold">
            {rate?.usd_cop ? Number(rate.usd_cop).toFixed(0) : '—'}
          </span>
        </div>

        {/* Versión compacta en mobile */}
        <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 lg:hidden">
          <span className="font-mono font-semibold">
            VES {rate?.usd_ves_paralelo ? Number(rate.usd_ves_paralelo).toFixed(0) : '—'}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono font-semibold">
            COP {rate?.usd_cop ? Number(rate.usd_cop).toFixed(0) : '—'}
          </span>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
