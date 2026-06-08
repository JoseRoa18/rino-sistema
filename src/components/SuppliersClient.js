'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck, Plus, Search, AlertTriangle, CreditCard, TrendingUp,
  Edit2, Power, PowerOff,
} from 'lucide-react';
import KPICard from './KPICard';
import SupplierForm from './SupplierForm';
import { formatMoney } from '@/lib/pricing';
import {
  createSupplierAction,
  updateSupplierAction,
  deactivateSupplierAction,
  reactivateSupplierAction,
} from '@/app/(dashboard)/proveedores/actions';

const CURRENCY_META = {
  USD: { label: 'USD', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  VES: { label: 'Bs.', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  COP: { label: 'COP', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' },
};

const FILTER_TABS = [
  { value: 'all',      label: 'Todos' },
  { value: 'active',   label: 'Activos' },
  { value: 'with_ap',  label: 'Con saldo' },
  { value: 'overdue',  label: 'Vencidos' },
  { value: 'inactive', label: 'Inactivos' },
];

export default function SuppliersClient({ initialSuppliers, initialKpis, role }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [kpis] = useState(initialKpis);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [error, setError] = useState('');

  const canEdit = role === 'admin' || role === 'supervisor';
  const isAdmin = role === 'admin';

  useEffect(() => { setSuppliers(initialSuppliers); }, [initialSuppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (filter === 'active'   && !s.active) return false;
      if (filter === 'inactive' &&  s.active) return false;
      if (filter === 'with_ap'  && Number(s.ap_balance_usd) <= 0) return false;
      if (filter === 'overdue'  && Number(s.overdue_balance_usd) <= 0) return false;
      if (currencyFilter !== 'all' && s.invoicing_currency !== currencyFilter) return false;
      if (q) {
        const haystack = `${s.name} ${s.contact_name || ''} ${s.phone || ''} ${s.email || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [suppliers, search, filter, currencyFilter]);

  const filterCounts = useMemo(() => ({
    all:      suppliers.length,
    active:   suppliers.filter((s) => s.active).length,
    with_ap:  suppliers.filter((s) => Number(s.ap_balance_usd) > 0).length,
    overdue:  suppliers.filter((s) => Number(s.overdue_balance_usd) > 0).length,
    inactive: suppliers.filter((s) => !s.active).length,
  }), [suppliers]);

  async function handleSave(input) {
    setError('');
    const result = editTarget
      ? await updateSupplierAction(editTarget.supplier_id, input)
      : await createSupplierAction(input);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setFormOpen(false);
    setEditTarget(null);
    router.refresh();
    return true;
  }

  async function handleToggleActive(supplier) {
    setError('');
    const fn = supplier.active ? deactivateSupplierAction : reactivateSupplierAction;
    const ok = window.confirm(
      supplier.active
        ? `¿Desactivar a "${supplier.name}"?\n\nNo aparecerá en compras nuevas pero se conserva su historial.`
        : `¿Reactivar a "${supplier.name}"?`
    );
    if (!ok) return;
    const result = await fn(supplier.supplier_id);
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Proveedores</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gestión de proveedores, compras y cuentas por pagar
          </p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setFormOpen(true); }}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Total proveedores"
          value={kpis.total_suppliers || 0}
          hint={`${kpis.active_suppliers || 0} activos`}
          icon={Truck}
          accent="brand"
        />
        <KPICard
          label="Nuevos del mes"
          value={kpis.new_this_month || 0}
          hint="alta este mes"
          icon={TrendingUp}
          accent="emerald"
        />
        <KPICard
          label="Cuentas por pagar"
          value={formatMoney(kpis.total_ap_balance)}
          hint={`${kpis.suppliers_with_credit || 0} proveedores`}
          icon={CreditCard}
          accent={Number(kpis.total_ap_balance) > 0 ? 'amber' : 'emerald'}
        />
        <KPICard
          label="Vencido"
          value={formatMoney(kpis.overdue_ap_balance)}
          hint={`${kpis.overdue_suppliers_count || 0} proveedores`}
          icon={AlertTriangle}
          accent={Number(kpis.overdue_ap_balance) > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Search + filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, contacto, teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
            />
          </div>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="all">Toda moneda</option>
            <option value="USD">USD</option>
            <option value="VES">Bs.</option>
            <option value="COP">COP</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FILTER_TABS.map((tab) => {
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
            No hay proveedores que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Moneda</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                  <th className="px-4 py-3 text-right">Total comprado</th>
                  <th className="px-4 py-3 text-right">Por pagar</th>
                  <th className="px-4 py-3">Última compra</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {filtered.map((s) => {
                  const cur = CURRENCY_META[s.invoicing_currency] || CURRENCY_META.USD;
                  const lastPurchase = s.last_purchase_at
                    ? new Date(s.last_purchase_at).toLocaleDateString('es-VE', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        timeZone: 'America/Caracas',
                      })
                    : '—';
                  const hasOverdue = Number(s.overdue_balance_usd) > 0;
                  return (
                    <tr
                      key={s.supplier_id}
                      onClick={() => router.push(`/proveedores/${s.supplier_id}`)}
                      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        !s.active ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {s.name}
                        </div>
                        {Array.isArray(s.tags) && s.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              >
                                {t}
                              </span>
                            ))}
                            {s.tags.length > 3 && (
                              <span className="text-[10px] text-slate-400">
                                +{s.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${cur.cls}`}>
                          {cur.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        <div>{s.contact_name || '—'}</div>
                        <div className="truncate text-xs">
                          {s.phone || s.email || ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-600 dark:text-slate-400">
                        {s.purchases_count || 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatMoney(s.total_purchased_usd)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">
                        {Number(s.ap_balance_usd) > 0 ? (
                          <span
                            className={
                              hasOverdue
                                ? 'inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {formatMoney(s.ap_balance_usd)}
                            {hasOverdue && <AlertTriangle className="h-3 w-3" />}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {lastPurchase}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => { setEditTarget(s); setFormOpen(true); }}
                              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            {(isAdmin || role === 'supervisor') && (
                              <button
                                onClick={() => handleToggleActive(s)}
                                className={`rounded p-1.5 ${
                                  s.active
                                    ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10'
                                    : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                                }`}
                                title={s.active ? 'Desactivar' : 'Reactivar'}
                              >
                                {s.active
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
        <SupplierForm
          initialValue={editTarget}
          onClose={() => { setFormOpen(false); setEditTarget(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
