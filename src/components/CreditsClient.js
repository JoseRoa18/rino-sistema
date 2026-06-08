'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, X, CreditCard, AlertTriangle, CalendarClock, CheckCircle2,
  Clock, Banknote, Smartphone, ArrowLeftRight, User, ExternalLink,
  HandCoins, TrendingUp,
} from 'lucide-react';
import { formatMoney } from '@/lib/pricing';
import KPICard from './KPICard';
import PageHeader from './PageHeader';
import EmptyState from './EmptyState';
import CreditPaymentDialog from './CreditPaymentDialog';
import { todayStr } from '@/lib/dates';

const STATUS_OPTIONS = [
  { value: 'abierto',  label: 'Abiertos'  },
  { value: 'vencido',  label: 'Vencidos'  },
  { value: 'pagado',   label: 'Pagados'   },
  { value: 'todos',    label: 'Todos'     },
];

const PAYMENT_META = {
  efectivo:      { label: 'Efectivo',      icon: Banknote },
  pago_movil:    { label: 'Pago móvil',    icon: Smartphone },
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  tarjeta:       { label: 'Tarjeta',       icon: CreditCard },
  credito:       { label: 'Crédito',       icon: Clock },
};

/**
 * Calcula días restantes hasta dueDate respetando zona Caracas.
 * dueDate llega como 'YYYY-MM-DD' desde la BD (sin hora). Lo anclamos a
 * mediodía UTC para evitar saltos de día por zona local del navegador.
 */
function daysUntil(dueDate) {
  if (!dueDate) return null;
  const todayKey = todayStr(); // ya viene en zona Caracas
  // Diferencia en días entre dos 'YYYY-MM-DD' sin influencia de hora local
  const a = new Date(`${todayKey}T12:00:00Z`);
  const b = new Date(`${dueDate}T12:00:00Z`);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

export default function CreditsClient({ initialCredits, rate, role }) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits || []);
  const [statusFilter, setStatusFilter] = useState('abierto');
  const [search, setSearch] = useState('');
  const [paying, setPaying] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const today = todayStr();

  // ---------- KPIs ----------
  const kpis = useMemo(() => {
    const opens = credits.filter((c) => c.status === 'abierto');
    const overdue = opens.filter((c) => c.due_date && c.due_date < today);
    const dueWeek = opens.filter((c) => {
      if (!c.due_date) return false;
      const d = daysUntil(c.due_date);
      return d !== null && d >= 0 && d <= 7;
    });

    // "Cobrado (últimos 30 días)" — suma de lo realmente cobrado:
    //   - paid_amount_usd de TODOS los créditos (abiertos+pagados) creados
    //     en los últimos 30 días.
    // Nota: paid_amount_usd refleja el total abonado al crédito a la fecha
    // (no la fecha del pago). Es una aproximación porque credits no tiene
    // tabla de pagos visible aquí; pero ya NO duplica original+paid como antes.
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentlyCollected = credits.filter((c) => c.created_at >= last30);
    const totalPaid30 = recentlyCollected.reduce(
      (s, c) => s + Number(c.paid_amount_usd || 0), 0
    );
    const paidCount30 = recentlyCollected.filter(
      (c) => Number(c.paid_amount_usd || 0) > 0
    ).length;

    return {
      totalOpen:       opens.reduce((s, c) => s + Number(c.balance_usd || 0), 0),
      countOpen:       opens.length,
      totalOverdue:    overdue.reduce((s, c) => s + Number(c.balance_usd || 0), 0),
      countOverdue:    overdue.length,
      totalDueWeek:    dueWeek.reduce((s, c) => s + Number(c.balance_usd || 0), 0),
      countDueWeek:    dueWeek.length,
      totalPaidMonth:  totalPaid30,
      countPaidMonth:  paidCount30,
    };
  }, [credits, today]);

  // ---------- Filter logic ----------
  const filtered = useMemo(() => {
    let list = credits;
    if (statusFilter === 'vencido') {
      list = list.filter((c) => c.status === 'abierto' && c.due_date && c.due_date < today);
    } else if (statusFilter !== 'todos') {
      list = list.filter((c) => c.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        (c.customers?.name || '').toLowerCase().includes(q) ||
        (c.customers?.document_id || '').toLowerCase().includes(q) ||
        String(c.sales?.invoice_number || '').includes(q)
      );
    }
    // Ordenar abiertos por vencimiento ascendente (más urgentes arriba), pagados por fecha desc.
    if (statusFilter === 'pagado' || statusFilter === 'todos') {
      return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return [...list].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
  }, [credits, statusFilter, search, today]);

  // ---------- Counts for status tabs ----------
  const statusCounts = useMemo(() => {
    const opens = credits.filter((c) => c.status === 'abierto');
    return {
      abierto: opens.length,
      vencido: opens.filter((c) => c.due_date && c.due_date < today).length,
      pagado:  credits.filter((c) => c.status === 'pagado').length,
      todos:   credits.length,
    };
  }, [credits, today]);

  function handlePaymentSuccess(result) {
    setSuccessMsg(
      result?.fully_paid
        ? `Pago registrado. Crédito de ${result.customer_name || ''} quedó en cero.`
        : 'Pago registrado correctamente.'
    );
    setTimeout(() => setSuccessMsg(''), 5000);
    setPaying(null);
    // Forzar refetch del server component para tener data fresca
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Créditos"
        subtitle="Cuentas por cobrar · cobros y abonos"
      />

      {successMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Por cobrar"
          value={formatMoney(kpis.totalOpen)}
          hint={`${kpis.countOpen} ${kpis.countOpen === 1 ? 'crédito abierto' : 'créditos abiertos'}`}
          icon={HandCoins}
          accent={kpis.totalOpen > 0 ? 'rose' : 'emerald'}
        />
        <KPICard
          label="Vencidos"
          value={formatMoney(kpis.totalOverdue)}
          hint={`${kpis.countOverdue} ${kpis.countOverdue === 1 ? 'cuenta vencida' : 'cuentas vencidas'}`}
          icon={AlertTriangle}
          accent={kpis.countOverdue > 0 ? 'rose' : 'emerald'}
        />
        <KPICard
          label="Vencen esta semana"
          value={formatMoney(kpis.totalDueWeek)}
          hint={`${kpis.countDueWeek} ${kpis.countDueWeek === 1 ? 'crédito' : 'créditos'} próximos a vencer`}
          icon={CalendarClock}
          accent={kpis.countDueWeek > 0 ? 'amber' : 'slate'}
        />
        <KPICard
          label="Cobrado (30 días)"
          value={formatMoney(kpis.totalPaidMonth)}
          hint="abonos + cierres"
          icon={TrendingUp}
          accent="emerald"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, cédula o factura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 pr-10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Limpiar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            const count = statusCounts[opt.value];
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={
              search || statusFilter !== 'abierto'
                ? 'Ningún crédito coincide con los filtros'
                : 'No hay créditos abiertos'
            }
            description={
              statusFilter === 'abierto' && !search
                ? 'Cuando se hagan ventas a crédito, aparecerán aquí.'
                : 'Intenta cambiar el filtro o limpiar la búsqueda.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cliente</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Factura</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Fecha</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Original</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pagado</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Saldo</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vence</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</th>
                  <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {filtered.map((c) => {
                  const isOpen = c.status === 'abierto';
                  const days = daysUntil(c.due_date);
                  const isOverdue = isOpen && days !== null && days < 0;
                  const isDueSoon = isOpen && days !== null && days >= 0 && days <= 3;

                  return (
                    <tr key={c.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/clientes/${c.customer_id}`}
                          className="group flex items-center gap-2"
                        >
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900 group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                              {c.customers?.name || '—'}
                            </p>
                            {c.customers?.document_id && (
                              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {c.customers.document_id}
                              </p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-700 dark:text-slate-300">
                        {c.sales?.invoice_number ? `#${String(c.sales.invoice_number).padStart(6, '0')}` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {new Date(c.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Caracas' })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                        {formatMoney(c.original_amount_usd)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm text-emerald-600 dark:text-emerald-400">
                        {Number(c.paid_amount_usd) > 0 ? formatMoney(c.paid_amount_usd) : '—'}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right tabular-nums text-sm font-bold ${
                        isOpen ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 line-through'
                      }`}>
                        {formatMoney(c.balance_usd)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {!c.due_date ? (
                          <span className="text-slate-400 dark:text-slate-500">sin fecha</span>
                        ) : isOpen ? (
                          <span className={
                            isOverdue   ? 'font-semibold text-rose-600 dark:text-rose-400'
                            : isDueSoon ? 'font-semibold text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                          }>
                            {new Date(`${c.due_date}T12:00:00-04:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', timeZone: 'America/Caracas' })}
                            {isOverdue && (
                              <span className="ml-1 text-[11px]">
                                · vencido {Math.abs(days)}d
                              </span>
                            )}
                            {isDueSoon && !isOverdue && (
                              <span className="ml-1 text-[11px]">· en {days}d</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">
                            {new Date(`${c.due_date}T12:00:00-04:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', timeZone: 'America/Caracas' })}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {isOpen ? (
                          isOverdue ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
                              <AlertTriangle className="h-3 w-3" />
                              Vencido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                              <Clock className="h-3 w-3" />
                              Abierto
                            </span>
                          )
                        ) : c.status === 'pagado' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Pagado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {c.status}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {isOpen ? (
                          <button
                            onClick={() => setPaying(c)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <HandCoins className="h-3.5 w-3.5" />
                            Cobrar
                          </button>
                        ) : (
                          <Link
                            href={`/clientes/${c.customer_id}`}
                            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
                          >
                            Ver detalle
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment dialog */}
      {paying && (
        <CreditPaymentDialog
          credit={paying}
          rate={rate}
          onClose={() => setPaying(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
