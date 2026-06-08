'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users, UserPlus, Search, AlertTriangle, CreditCard, TrendingUp,
  Edit2, Power, PowerOff,
} from 'lucide-react';
import KPICard from './KPICard';
import CustomerForm from './CustomerForm';
import { formatMoney } from '@/lib/pricing';
import {
  createCustomerAction,
  updateCustomerAction,
  deactivateCustomerAction,
  reactivateCustomerAction,
} from '@/app/(dashboard)/clientes/actions';

const TYPE_META = {
  detal:     { label: 'Detal',     cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  mayorista: { label: 'Mayorista', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' },
  frecuente: { label: 'Frecuente', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  eventual:  { label: 'Eventual',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

const FILTER_TABS_BASE = [
  { value: 'all',      label: 'Todos' },
  { value: 'active',   label: 'Activos' },
  { value: 'with_ar',  label: 'Con saldo',  creditOnly: true },
  { value: 'overdue',  label: 'Vencidos',   creditOnly: true },
  { value: 'inactive', label: 'Inactivos' },
];

export default function CustomersClient({ initialCustomers, initialKpis, role }) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  const [kpis] = useState(initialKpis);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [error, setError] = useState('');

  const isAdmin       = role === 'admin';
  const canEdit       = role === 'admin' || role === 'supervisor';
  const canSeeCredits = role === 'admin' || role === 'supervisor';

  // Sincronizar con router.refresh()
  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);

  const filterTabs = FILTER_TABS_BASE.filter((t) => !t.creditOnly || canSeeCredits);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter === 'active'   && !c.active) return false;
      if (filter === 'inactive' &&  c.active) return false;
      if (filter === 'with_ar'  && Number(c.ar_balance_usd) <= 0) return false;
      if (filter === 'overdue'  && Number(c.overdue_balance_usd) <= 0) return false;
      if (typeFilter !== 'all'  && c.customer_type !== typeFilter) return false;
      if (q) {
        const haystack = `${c.name} ${c.document_id || ''} ${c.phone || ''} ${c.email || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [customers, search, filter, typeFilter]);

  const filterCounts = useMemo(() => ({
    all:      customers.length,
    active:   customers.filter((c) => c.active).length,
    with_ar:  customers.filter((c) => Number(c.ar_balance_usd) > 0).length,
    overdue:  customers.filter((c) => Number(c.overdue_balance_usd) > 0).length,
    inactive: customers.filter((c) => !c.active).length,
  }), [customers]);

  async function handleSave(input) {
    setError('');
    const result = editTarget
      ? await updateCustomerAction(editTarget.customer_id, input)
      : await createCustomerAction(input);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setFormOpen(false);
    setEditTarget(null);
    router.refresh();
    return true;
  }

  async function handleToggleActive(customer) {
    setError('');
    const fn = customer.active ? deactivateCustomerAction : reactivateCustomerAction;
    const ok = window.confirm(
      customer.active
        ? `¿Desactivar a "${customer.name}"?\n\nNo aparecerá en el POS pero se conserva su historial.`
        : `¿Reactivar a "${customer.name}"?`
    );
    if (!ok) return;
    const result = await fn(customer.customer_id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Clientes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestión de cartera, créditos e historial
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setFormOpen(true); }}
          className="btn-primary"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo cliente
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Total clientes"
          value={kpis.total_customers || 0}
          hint={`${kpis.active_customers || 0} activos`}
          icon={Users}
          accent="brand"
        />
        <KPICard
          label="Nuevos del mes"
          value={kpis.new_this_month || 0}
          hint="alta este mes"
          icon={TrendingUp}
          accent="emerald"
        />
        {canSeeCredits && (
          <>
            <KPICard
              label="Cuentas por cobrar"
              value={formatMoney(kpis.total_ar_balance)}
              hint={`${kpis.customers_with_credit || 0} clientes`}
              icon={CreditCard}
              accent={Number(kpis.total_ar_balance) > 0 ? 'amber' : 'emerald'}
            />
            <KPICard
              label="Vencido"
              value={formatMoney(kpis.overdue_ar_balance)}
              hint={`${kpis.overdue_customers_count || 0} clientes`}
              icon={AlertTriangle}
              accent={Number(kpis.overdue_ar_balance) > 0 ? 'rose' : 'emerald'}
            />
          </>
        )}
      </div>

      {/* Search + filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, RIF/CI, teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="all">Todos los tipos</option>
            <option value="detal">Detal</option>
            <option value="mayorista">Mayorista</option>
            <option value="frecuente">Frecuente</option>
            <option value="eventual">Eventual</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {filterTabs.map((tab) => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label} <span className="opacity-70">({filterCounts[tab.value]})</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay clientes que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                  <th className="px-4 py-3 text-right">Total gastado</th>
                  {canSeeCredits && <th className="px-4 py-3 text-right">Saldo</th>}
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {filtered.map((c) => {
                  const type = TYPE_META[c.customer_type] || TYPE_META.detal;
                  const lastSale = c.last_sale_at
                    ? new Date(c.last_sale_at).toLocaleDateString('es-VE', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        timeZone: 'America/Caracas',
                      })
                    : '—';
                  const hasOverdue = Number(c.overdue_balance_usd) > 0;
                  return (
                    <tr
                      key={c.customer_id}
                      onClick={() => router.push(`/clientes/${c.customer_id}`)}
                      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        !c.active ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {c.name}
                        </div>
                        {Array.isArray(c.tags) && c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              >
                                {t}
                              </span>
                            ))}
                            {c.tags.length > 3 && (
                              <span className="text-[10px] text-slate-400">
                                +{c.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${type.cls}`}>
                          {type.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {c.document_id || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        <div>{c.phone || '—'}</div>
                        {c.email && <div className="truncate text-xs">{c.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                        {c.sales_count || 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatMoney(c.total_spent_usd)}
                      </td>
                      {canSeeCredits && (
                        <td className="px-4 py-3 text-right tabular-nums text-sm">
                          {Number(c.ar_balance_usd) > 0 ? (
                            <span
                              className={
                                hasOverdue
                                  ? 'inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400'
                                  : 'text-amber-600 dark:text-amber-400'
                              }
                            >
                              {formatMoney(c.ar_balance_usd)}
                              {hasOverdue && <AlertTriangle className="h-3 w-3" />}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {lastSale}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => { setEditTarget(c); setFormOpen(true); }}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleToggleActive(c)}
                                className={`rounded p-1.5 ${
                                  c.active
                                    ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10'
                                    : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                                }`}
                                title={c.active ? 'Desactivar' : 'Reactivar'}
                              >
                                {c.active
                                  ? <PowerOff className="h-4 w-4" />
                                  : <Power className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
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

      {formOpen && (
        <CustomerForm
          initialValue={editTarget}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}