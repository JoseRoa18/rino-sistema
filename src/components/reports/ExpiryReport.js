'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, Clock, Package, Layers,
  TrendingDown, DollarSign,
} from 'lucide-react';
import KPICard from '../KPICard';
import PageHeader from '../PageHeader';
import EmptyState from '../EmptyState';
import MigrationErrorBanner from './MigrationErrorBanner';
import { formatMoney } from '@/lib/pricing';
import { todayStr } from '@/lib/dates';

const STATUS_META = {
  vencido:  { label: 'Vencido',   cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'   },
  critico:  { label: 'Crítico',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  urgente:  { label: 'Urgente',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400' },
  proximo:  { label: 'Próximo',   cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' },
  ok:       { label: 'OK',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
};

const FILTERS = [
  { value: 'all',     label: 'Todos' },
  { value: 'vencido', label: 'Vencidos' },
  { value: 'critico', label: '≤ 3 días' },
  { value: 'urgente', label: '≤ 7 días' },
  { value: 'proximo', label: '≤ 30 días' },
];

export default function ExpiryReport({ batches, error }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const kpis = useMemo(() => {
    const k = { total: 0, expired: 0, critical: 0, urgent: 0, valueAtRisk: 0 };
    for (const b of batches) {
      k.total += 1;
      const v = Number(b.value_at_risk_usd) || 0;
      if (b.status === 'vencido') {
        k.expired += 1;
        k.valueAtRisk += v;
      } else if (b.status === 'critico') {
        k.critical += 1;
        k.valueAtRisk += v;
      } else if (b.status === 'urgente') {
        k.urgent += 1;
        k.valueAtRisk += v;
      }
    }
    return k;
  }, [batches]);

  const filtered = useMemo(() => {
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return batches.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (tokens.length > 0) {
        const haystack = `${b.product_name || ''} ${b.batch_code || ''} ${b.sku || ''}`.toLowerCase();
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }
      return true;
    });
  }, [batches, statusFilter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vencimientos"
        subtitle="Lotes vencidos o próximos a vencer en los próximos 30 días"
      />

      <MigrationErrorBanner error={error} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Lotes seguidos"
          value={kpis.total}
          hint="con stock > 0"
          icon={Layers}
          accent="brand"
        />
        <KPICard
          label="Vencidos"
          value={kpis.expired}
          hint="ya pasaron su fecha"
          icon={AlertTriangle}
          accent={kpis.expired > 0 ? 'rose' : 'emerald'}
        />
        <KPICard
          label="Críticos ≤ 3 días"
          value={kpis.critical + kpis.urgent}
          hint="venciendo esta semana"
          icon={Clock}
          accent={(kpis.critical + kpis.urgent) > 0 ? 'amber' : 'emerald'}
        />
        <KPICard
          label="Valor en riesgo"
          value={formatMoney(kpis.valueAtRisk)}
          hint="costo de lo por vencer o vencido"
          icon={TrendingDown}
          accent={kpis.valueAtRisk > 0 ? 'rose' : 'emerald'}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
          <input
            type="search"
            placeholder="Buscar producto, SKU o lote..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input min-w-[220px] flex-1"
          />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === f.value
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin resultados"
            description={statusFilter === 'all'
              ? 'No hay lotes registrados. Activa "Controla vencimiento" en productos perecederos y registra una compra.'
              : 'Ningún lote coincide con el filtro seleccionado.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Producto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Lote</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Vence</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Días</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Valor en riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {filtered.map((b) => {
                  const status = STATUS_META[b.status] || STATUS_META.ok;
                  return (
                    <tr key={b.batch_id} className="text-sm">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {b.product_name}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {b.sku || '—'} · {b.category_name || 'sin categoría'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {b.batch_code || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {Number(b.quantity).toLocaleString('es-VE', { maximumFractionDigits: 3 })}
                        <div className="text-[10px] font-normal text-slate-400">{b.unit || 'u'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                        {b.expires_at || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-slate-900 dark:text-slate-100">
                        {b.days_to_expire === null
                          ? <span className="text-slate-400">—</span>
                          : b.days_to_expire < 0
                            ? <span className="text-rose-600 dark:text-rose-400">hace {-b.days_to_expire}d</span>
                            : <span>{b.days_to_expire}d</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(b.value_at_risk_usd)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
