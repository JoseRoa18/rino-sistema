'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Edit2, Phone, Mail, MapPin, FileText, Calendar, Tag,
  ShoppingBag, DollarSign, Clock, AlertTriangle, CreditCard,
  BarChart3, Plus, Printer, ExternalLink, ChevronRight, Power, PowerOff,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import KPICard from './KPICard';
import CustomerForm from './CustomerForm';
import CreditPaymentModal from './CreditPaymentModal';
import SaleDetailModal from './SaleDetailModal';
import { formatMoney } from '@/lib/pricing';
import {
  updateCustomerAction,
  deactivateCustomerAction,
  reactivateCustomerAction,
  registerCreditPaymentAction,
} from '@/app/(dashboard)/clientes/actions';

const TYPE_META = {
  detal:     { label: 'Detal',     cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  mayorista: { label: 'Mayorista', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' },
  frecuente: { label: 'Frecuente', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  eventual:  { label: 'Eventual',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

const PAYMENT_LABELS = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  pago_movil:    'Pago móvil',
  tarjeta:       'Tarjeta',
  credito:       'Crédito',
  mixto:         'Mixto',
};

const TABS_BASE = [
  { value: 'resumen',  label: 'Resumen',  icon: BarChart3 },
  { value: 'compras',  label: 'Compras',  icon: ShoppingBag },
  { value: 'creditos', label: 'Créditos', icon: CreditCard, creditOnly: true },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'America/Caracas',
  });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Caracas',
  }).replace(/[   ]/g, ' ');
}

function fmtMonthLabel(d) {
  return new Date(d).toLocaleDateString('es-VE', {
    month: 'short', year: '2-digit',
    timeZone: 'America/Caracas',
  });
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CustomerDetailClient({
  stats, sales, topProducts, monthlySpending, credits, payments, role,
}) {
  const router = useRouter();
  const [tab, setTab]                 = useState('resumen');
  const [editing, setEditing]         = useState(false);
  const [paying, setPaying]           = useState(false);
  const [detailSaleId, setDetailSaleId] = useState(null);
  const [error, setError]             = useState('');

  const isAdmin            = role === 'admin';
  const canEdit            = role === 'admin' || role === 'supervisor';
  const canSeeCredits      = role === 'admin' || role === 'supervisor';
  const canRegisterPayments = role === 'admin' || role === 'supervisor';

  const tabs = TABS_BASE.filter((t) => !t.creditOnly || canSeeCredits);

  const type           = TYPE_META[stats.customer_type] || TYPE_META.detal;
  const hasCreditLimit = Number(stats.credit_limit_usd) > 0;
  const isOverLimit    = !!stats.is_over_limit;

  const openCredits   = useMemo(() => credits.filter((c) => c.status === 'abierto'), [credits]);
  const closedCredits = useMemo(() => credits.filter((c) => c.status !== 'abierto'), [credits]);

  // 12 meses con huecos rellenos en 0
  const chartData = useMemo(() => {
    const map = new Map();
    monthlySpending.forEach((m) => map.set(m.month, Number(m.total_usd)));
    const data = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 10);
      data.push({ month: fmtMonthLabel(d), total: map.get(key) || 0 });
    }
    return data;
  }, [monthlySpending]);

  async function handleSaveEdit(input) {
    setError('');
    const result = await updateCustomerAction(stats.customer_id, input);
    if (!result.ok) { setError(result.error); return false; }
    setEditing(false);
    router.refresh();
    return true;
  }

  async function handleToggleActive() {
    setError('');
    const fn = stats.active ? deactivateCustomerAction : reactivateCustomerAction;
    const ok = window.confirm(
      stats.active
        ? `¿Desactivar a "${stats.name}"?\n\nEl historial se conserva.`
        : `¿Reactivar a "${stats.name}"?`
    );
    if (!ok) return;
    const result = await fn(stats.customer_id);
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
  }

  async function handleRegisterPayment(payload) {
    setError('');
    const result = await registerCreditPaymentAction({
      ...payload,
      customer_id: stats.customer_id,
    });
    if (!result.ok) { setError(result.error); return result; }
    setPaying(false);
    router.refresh();
    return result;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/clientes')}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {stats.name}
              </h1>
              <span className={`rounded-full px-2 py-0.5 text-xs ${type.cls}`}>
                {type.label}
              </span>
              {!stats.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Inactivo
                </span>
              )}
            </div>
            {Array.isArray(stats.tags) && stats.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Tag className="h-3 w-3 text-slate-400" />
                {stats.tags.map((t) => (
                  <span key={t} className="text-xs text-slate-600 dark:text-slate-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          {canRegisterPayments && Number(stats.ar_balance_usd) > 0 && (
            <button onClick={() => setPaying(true)} className="btn-primary">
              <DollarSign className="h-4 w-4" />
              Cobrar
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditing(true)} className="btn-secondary">
              <Edit2 className="h-4 w-4" />
              Editar
            </button>
          )}
          {isAdmin && (
            <button onClick={handleToggleActive} className="btn-secondary">
              {stats.active
                ? <PowerOff className="h-4 w-4" />
                : <Power className="h-4 w-4" />}
              {stats.active ? 'Desactivar' : 'Reactivar'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 print:hidden dark:bg-rose-500/10 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Info card */}
      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoRow icon={FileText} label="RIF/Cédula" value={stats.document_id} />
          <InfoRow icon={Phone}    label="Teléfono"   value={stats.phone} />
          <InfoRow icon={Mail}     label="Email"      value={stats.email} />
          <InfoRow icon={Calendar} label="Cumpleaños" value={stats.birthday ? fmtDate(stats.birthday) : null} />
          {stats.address && (
            <div className="sm:col-span-2 lg:col-span-4">
              <InfoRow icon={MapPin} label="Dirección" value={stats.address} />
            </div>
          )}
        </div>
        {stats.notes && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <strong>Notas:</strong> {stats.notes}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Total gastado"
          value={formatMoney(stats.total_spent_usd)}
          hint="histórico"
          icon={DollarSign}
          accent="brand"
        />
        <KPICard
          label="Compras"
          value={stats.sales_count || 0}
          hint={`${formatMoney(stats.avg_ticket_usd)} por ticket`}
          icon={ShoppingBag}
          accent="violet"
        />
        <KPICard
          label="Última compra"
          value={
            stats.last_sale_at
              ? `hace ${stats.days_since_last_sale}d`
              : 'Nunca'
          }
          hint={fmtDate(stats.last_sale_at)}
          icon={Clock}
          accent={
            stats.days_since_last_sale === null ? 'rose'
            : stats.days_since_last_sale <= 30  ? 'emerald'
            : stats.days_since_last_sale <= 90  ? 'amber'
            : 'rose'
          }
        />
        {canSeeCredits && (
          <KPICard
            label="Saldo pendiente"
            value={formatMoney(stats.ar_balance_usd)}
            hint={
              Number(stats.overdue_balance_usd) > 0
                ? `${formatMoney(stats.overdue_balance_usd)} vencido`
                : `${stats.open_credits_count || 0} créditos`
            }
            icon={CreditCard}
            accent={
              Number(stats.overdue_balance_usd) > 0 ? 'rose'
              : Number(stats.ar_balance_usd) > 0    ? 'amber'
              : 'emerald'
            }
          />
        )}
      </div>

      {/* Aviso de límite de crédito */}
      {canSeeCredits && hasCreditLimit && (
        <div
          className={`flex items-start gap-3 rounded-lg p-3 text-sm print:hidden ${
            isOverLimit
              ? 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300'
              : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
          }`}
        >
          <CreditCard className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-medium">
              Límite de crédito: {formatMoney(stats.credit_limit_usd)}
            </span>
            {' — disponible '}
            <span className="font-medium">{formatMoney(stats.credit_available_usd)}</span>
            {isOverLimit && ' (excedido)'}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 print:hidden dark:border-slate-700">
        <nav className="flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Contenido del tab */}
      {tab === 'resumen' && (
        <ResumenTab
          chartData={chartData}
          topProducts={topProducts}
          recentSales={sales.slice(0, 5)}
          onSaleClick={setDetailSaleId}
        />
      )}
      {tab === 'compras' && (
        <ComprasTab sales={sales} onSaleClick={setDetailSaleId} />
      )}
      {tab === 'creditos' && canSeeCredits && (
        <CreditosTab
          openCredits={openCredits}
          closedCredits={closedCredits}
          payments={payments}
          canRegisterPayments={canRegisterPayments}
          onRegisterPayment={() => setPaying(true)}
          onSaleClick={setDetailSaleId}
        />
      )}

      {/* Modals */}
      {editing && (
        <CustomerForm
          initialValue={stats}
          onClose={() => setEditing(false)}
          onSave={handleSaveEdit}
        />
      )}
      {paying && (
        <CreditPaymentModal
          customer={stats}
          openCredits={openCredits}
          onClose={() => setPaying(false)}
          onSubmit={handleRegisterPayment}
        />
      )}
      {detailSaleId && (
        <SaleDetailModal
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          role={role}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers de presentación
// ---------------------------------------------------------------------------

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
        <div className="truncate text-sm text-slate-900 dark:text-slate-100">
          {value || '—'}
        </div>
      </div>
    </div>
  );
}

function ResumenTab({ chartData, topProducts, recentSales, onSaleClick }) {
  const hasSpending = chartData.some((d) => d.total > 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart */}
        <div className="card p-4 lg:col-span-2">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Gasto mensual (últimos 12 meses)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">USD por mes</p>
          </div>
          {hasSpending ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Bar dataKey="total" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              Aún no hay compras en los últimos 12 meses.
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Productos favoritos
          </h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-400">Sin compras registradas.</p>
          ) : (
            <ol className="space-y-2">
              {topProducts.slice(0, 8).map((p, i) => (
                <li key={p.product_id} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {p.product_name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {Number(p.units_purchased).toFixed(0)} u · {p.times_bought} compras
                    </div>
                  </div>
                  <div className="tabular-nums text-sm text-slate-700 dark:text-slate-300">
                    {formatMoney(p.total_spent_usd)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Recent sales */}
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Compras recientes
          </h3>
        </div>
        {recentSales.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            Sin compras registradas.
          </p>
        ) : (
          <SalesTable sales={recentSales} onSaleClick={onSaleClick} />
        )}
      </div>
    </div>
  );
}

function ComprasTab({ sales, onSaleClick }) {
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');

  const filtered = useMemo(() => {
    if (!from && !to) return sales;
    return sales.filter((s) => {
      const t = new Date(s.created_at);
      if (from && t < new Date(from)) return false;
      if (to && t > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [sales, from, to]);

  const totals = useMemo(() => {
    const completed = filtered.filter((s) => s.status === 'completada');
    return {
      count: completed.length,
      total: completed.reduce((acc, s) => acc + Number(s.total_usd || 0), 0),
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input"
          />
        </div>
        {(from || to) && (
          <button
            onClick={() => { setFrom(''); setTo(''); }}
            className="btn-secondary"
          >
            Limpiar
          </button>
        )}
        <div className="ml-auto text-sm text-slate-600 dark:text-slate-400">
          <strong>{totals.count}</strong> ventas ·{' '}
          <strong>{formatMoney(totals.total)}</strong>
        </div>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">
            No hay compras en este rango.
          </p>
        ) : (
          <SalesTable sales={filtered} onSaleClick={onSaleClick} showStatus />
        )}
      </div>
    </div>
  );
}

function CreditosTab({
  openCredits, closedCredits, payments,
  canRegisterPayments, onRegisterPayment, onSaleClick,
}) {
  const paymentsByCredit = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      if (!map.has(p.credit_id)) map.set(p.credit_id, []);
      map.get(p.credit_id).push(p);
    }
    // Orden cronológico inverso por crédito
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return map;
  }, [payments]);

  return (
    <div className="space-y-6">
      {/* Abiertos */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Créditos abiertos ({openCredits.length})
          </h3>
          {canRegisterPayments && openCredits.length > 0 && (
            <button onClick={onRegisterPayment} className="btn-primary">
              <Plus className="h-4 w-4" />
              Registrar pago
            </button>
          )}
        </div>
        {openCredits.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">
            Sin créditos abiertos.
          </div>
        ) : (
          <div className="space-y-3">
            {openCredits.map((c) => (
              <OpenCreditCard
                key={c.id}
                credit={c}
                payments={paymentsByCredit.get(c.id) || []}
                onSaleClick={onSaleClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Histórico */}
      {closedCredits.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Historial de créditos pagados
          </h3>
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3 text-right">Original</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {closedCredits.map((c) => (
                  <tr key={c.id} className="text-sm">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {fmtDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {c.sale_id ? (
                        <button
                          onClick={() => onSaleClick(c.sale_id)}
                          className="text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Ver venta
                        </button>
                      ) : (
                        <span className="text-slate-400">Manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMoney(c.original_amount_usd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatMoney(c.paid_amount_usd)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                        Pagado
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OpenCreditCard({ credit, payments, onSaleClick }) {
  const overdue = credit.due_date && new Date(credit.due_date) < new Date();
  const [open, setOpen] = useState(false);
  const pct = Math.min(
    100,
    (Number(credit.paid_amount_usd) / Number(credit.original_amount_usd)) * 100
  );

  return (
    <div
      className={`card p-4 ${
        overdue ? 'border-rose-300 dark:border-rose-500/40' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {fmtDate(credit.created_at)}
            </span>
            {overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">
                <AlertTriangle className="h-3 w-3" />
                Vencido {fmtDate(credit.due_date)}
              </span>
            )}
            {!overdue && credit.due_date && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                vence {fmtDate(credit.due_date)}
              </span>
            )}
          </div>
          {credit.notes && (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {credit.notes}
            </div>
          )}
          {credit.sale_id && (
            <button
              onClick={() => onSaleClick(credit.sale_id)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
            >
              <ExternalLink className="h-3 w-3" />
              Ver venta original
            </button>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Saldo pendiente
          </div>
          <div
            className={`text-lg font-bold tabular-nums ${
              overdue
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {formatMoney(credit.balance_usd)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            de {formatMoney(credit.original_amount_usd)}
          </div>
        </div>
      </div>

      {/* Progreso */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={overdue ? 'h-full bg-rose-500' : 'h-full bg-amber-500'}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Lista de pagos colapsable */}
      {payments.length > 0 && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ChevronRight className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} />
            {payments.length} {payments.length === 1 ? 'pago' : 'pagos'}
          </button>
          {open && (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-slate-600 dark:text-slate-400"
                >
                  <div>
                    {fmtDateTime(p.created_at)} ·{' '}
                    {PAYMENT_LABELS[p.payment_method] || p.payment_method}
                    {p.profiles?.full_name && (
                      <span className="text-slate-400"> · {p.profiles.full_name}</span>
                    )}
                  </div>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {formatMoney(p.amount_usd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SalesTable({ sales, onSaleClick, showStatus = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Factura</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Pago</th>
            {showStatus && <th className="px-4 py-3">Estado</th>}
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
          {sales.map((s) => (
            <tr
              key={s.id}
              onClick={() => onSaleClick(s.id)}
              className="cursor-pointer text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                #{s.invoice_number}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {fmtDateTime(s.created_at)}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {PAYMENT_LABELS[s.payment_method] || s.payment_method}
              </td>
              {showStatus && (
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      s.status === 'completada'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : s.status === 'anulada'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {s.status === 'completada'
                      ? 'Completada'
                      : s.status === 'anulada'
                      ? 'Anulada'
                      : s.status}
                  </span>
                </td>
              )}
              <td
                className={`px-4 py-3 text-right tabular-nums font-medium ${
                  s.status === 'anulada'
                    ? 'text-slate-400 line-through'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {formatMoney(s.total_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}