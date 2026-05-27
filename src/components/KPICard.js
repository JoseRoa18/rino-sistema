import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ACCENTS = {
  brand: {
    stripe: 'bg-brand-500',
    chip:   'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400',
  },
  emerald: {
    stripe: 'bg-emerald-500',
    chip:   'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  },
  amber: {
    stripe: 'bg-amber-500',
    chip:   'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  },
  rose: {
    stripe: 'bg-rose-500',
    chip:   'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  },
  violet: {
    stripe: 'bg-violet-500',
    chip:   'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400',
  },
  sky: {
    stripe: 'bg-sky-500',
    chip:   'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  },
  slate: {
    stripe: 'bg-slate-400',
    chip:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
};

/**
 * Tarjeta de KPI estandarizada.
 *
 * Props:
 *   label       — texto chico arriba (ej. "Ventas hoy")
 *   value       — número o string formateado (ej. "$1,250.00")
 *   hint        — texto opcional debajo del valor (contexto)
 *   icon        — componente lucide-react opcional
 *   accent      — 'brand' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'
 *   trend       — número, si lo pasas se muestra como % con flecha (positivo verde, negativo rojo, 0 gris)
 *   trendLabel  — texto al lado del trend ('vs ayer', 'vs sem. pasada')
 *   onClick     — si lo pasas, la tarjeta se vuelve clickeable (cursor pointer + ring en focus)
 *   right       — slot a la derecha del valor (ej. para meter un Sparkline)
 */
export default function KPICard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'brand',
  trend,
  trendLabel,
  onClick,
  href,
  right,
}) {
  const a = ACCENTS[accent] || ACCENTS.brand;
  const hasHref = typeof href === 'string' && href.length > 0;
  const clickable = typeof onClick === 'function' || hasHref;

  const baseCls =
    'group card relative w-full overflow-hidden p-5 pl-6 text-left transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:border-slate-600';

  let Wrapper;
  let wrapperProps;
  if (hasHref) {
    Wrapper = Link;
    wrapperProps = { href, className: baseCls };
  } else if (typeof onClick === 'function') {
    Wrapper = 'button';
    wrapperProps = { type: 'button', onClick, className: baseCls };
  } else {
    Wrapper = 'div';
    wrapperProps = { className: 'card relative overflow-hidden p-5 pl-6' };
  }

  // Trend visual
  let trendNode = null;
  if (typeof trend === 'number' && Number.isFinite(trend)) {
    const TrendIcon = trend > 0.05 ? TrendingUp : trend < -0.05 ? TrendingDown : Minus;
    const trendCls =
      trend > 0.05  ? 'text-emerald-600 dark:text-emerald-400'
      : trend < -0.05 ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-500 dark:text-slate-400';
    const sign = trend > 0 ? '+' : '';
    trendNode = (
      <span className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${trendCls}`}>
        <TrendIcon className="h-3 w-3" />
        {sign}{trend.toFixed(1)}%
        {trendLabel && (
          <span className="text-slate-400 dark:text-slate-500"> {trendLabel}</span>
        )}
      </span>
    );
  }

  return (
    <Wrapper {...wrapperProps}>
      {/* Barra de acento a la izquierda */}
      <span className={`absolute inset-y-0 left-0 w-1 ${a.stripe}`} aria-hidden="true" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {value}
          </p>
          {trendNode}
          {hint && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {hint}
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          {Icon && (
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${a.chip}`}>
              <Icon className="h-5 w-5" />
            </div>
          )}
          {right}
        </div>
      </div>
    </Wrapper>
  );
}
