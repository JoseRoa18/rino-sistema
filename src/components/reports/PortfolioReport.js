'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users, Truck, CreditCard, AlertTriangle, ExternalLink, Calendar,
  DollarSign, TrendingDown,
} from 'lucide-react';
import KPICard from '../KPICard';
import ReportToolbar from './ReportToolbar';
import MigrationErrorBanner from './MigrationErrorBanner';
import { formatMoney } from '@/lib/pricing';
import { fmt } from '@/lib/export';
import { todayStr, normalizeSpaces } from '@/lib/dates';

const TABS = [
  { value: 'cobrar', label: 'Por cobrar (clientes)',   icon: Users },
  { value: 'pagar',  label: 'Por pagar (proveedores)', icon: Truck },
];

const AGING_BUCKETS = [
  { key: 'b1',  label: '0–30d',    min: 0,   max: 30 },
  { key: 'b2',  label: '31–60d',   min: 31,  max: 60 },
  { key: 'b3',  label: '61–90d',   min: 61,  max: 90 },
  { key: 'b4',  label: '+90d',     min: 91,  max: Infinity },
];

// ---------------------------------------------------------------------------

export default function PortfolioReport({
  customerStats, supplierStats, customerKpis, supplierKpis,
  openCredits, openSupplierCredits, error,
}) {
  const [tab, setTab] = useState('cobrar');

  // ===== Aging clientes =====
  const customerAging = useMemo(() => bucketize(openCredits), [openCredits]);
  const supplierAging = useMemo(() => bucketize(openSupplierCredits), [openSupplierCredits]);

  // ===== Top deudores / acreedores =====
  const topDebtors = useMemo(
    () => customerStats
      .filter((c) => Number(c.ar_balance_usd) > 0)
      .sort((a, b) => Number(b.ar_balance_usd) - Number(a.ar_balance_usd))
      .slice(0, 20),
    [customerStats]
  );

  const topCreditors = useMemo(
    () => supplierStats
      .filter((s) => Number(s.ap_balance_usd) > 0)
      .sort((a, b) => Number(b.ap_balance_usd) - Number(a.ap_balance_usd))
      .slice(0, 20),
    [supplierStats]
  );

  // ===== Exports =====
  const exportsConfig = useMemo(() => {
    if (tab === 'cobrar') {
      return buildExports({
        slug: 'cartera-por-cobrar',
        title: 'Reporte de Cartera — Por cobrar',
        rows: openCredits.map((c) => ({
          ...c,
          customer_name: c.customers?.name || '',
          document_id:   c.customers?.document_id || '',
          phone:         c.customers?.phone || '',
          invoice:       c.sales?.invoice_number ? `#${c.sales.invoice_number}` : 'Manual',
          age_days:      daysOpen(c),
        })),
        columns: [
          { key: 'created_at',          label: 'Fecha',     fmt: fmt.date },
          { key: 'invoice',             label: 'Origen' },
          { key: 'customer_name',       label: 'Cliente' },
          { key: 'document_id',         label: 'Documento' },
          { key: 'phone',               label: 'Teléfono' },
          { key: 'original_amount_usd', label: 'Original', align: 'right', fmt: formatMoney },
          { key: 'paid_amount_usd',     label: 'Pagado',   align: 'right', fmt: formatMoney },
          { key: 'balance_usd',         label: 'Saldo',    align: 'right', fmt: formatMoney },
          { key: 'due_date',            label: 'Vence',    fmt: fmt.date },
          { key: 'age_days',            label: 'Días',     align: 'right' },
        ],
      });
    }
    if (tab === 'pagar') {
      return buildExports({
        slug: 'cartera-por-pagar',
        title: 'Reporte de Cartera — Por pagar',
        rows: openSupplierCredits.map((c) => ({
          ...c,
          supplier_name: c.suppliers?.name || '',
          contact_name:  c.suppliers?.contact_name || '',
          phone:         c.suppliers?.phone || '',
          age_days:      daysOpen(c),
        })),
        columns: [
          { key: 'created_at',          label: 'Fecha',     fmt: fmt.date },
          { key: 'supplier_name',       label: 'Proveedor' },
          { key: 'contact_name',        label: 'Contacto' },
          { key: 'phone',               label: 'Teléfono' },
          { key: 'original_amount_usd', label: 'Original', align: 'right', fmt: formatMoney },
          { key: 'paid_amount_usd',     label: 'Pagado',   align: 'right', fmt: formatMoney },
          { key: 'balance_usd',         label: 'Saldo',    align: 'right', fmt: formatMoney },
          { key: 'due_date',            label: 'Vence',    fmt: fmt.date },
          { key: 'age_days',            label: 'Días',     align: 'right' },
        ],
      });
    }
    return null;
  }, [tab, openCredits, openSupplierCredits]);

  const totalAR = Number(customerKpis.total_ar_balance || 0);
  const totalAP = Number(supplierKpis.total_ap_balance || 0);
  const overdueAR = Number(customerKpis.overdue_ar_balance || 0);
  const overdueAP = Number(supplierKpis.overdue_ap_balance || 0);
  const netPosition = totalAR - totalAP;

  return (
    <div className="space-y-6">
      <ReportToolbar
        title="Reporte de Cartera"
        subtitle="Cuentas por cobrar y por pagar — saldos abiertos"
        exports={exportsConfig}
      />

      {error && <MigrationErrorBanner error={error} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Por cobrar (AR)"
          value={formatMoney(totalAR)}
          hint={`${customerKpis.customers_with_credit || 0} clientes`}
          icon={Users}
          accent={totalAR > 0 ? 'amber' : 'emerald'}
        />
        <KPICard
          label="Por pagar (AP)"
          value={formatMoney(totalAP)}
          hint={`${supplierKpis.suppliers_with_credit || 0} proveedores`}
          icon={Truck}
          accent={totalAP > 0 ? 'amber' : 'emerald'}
        />
        <KPICard
          label="Vencido AR"
          value={formatMoney(overdueAR)}
          hint={`${customerKpis.overdue_customers_count || 0} clientes`}
          icon={AlertTriangle}
          accent={overdueAR > 0 ? 'rose' : 'emerald'}
        />
        <KPICard
          label="Posición neta"
          value={formatMoney(netPosition)}
          hint={netPosition >= 0 ? 'Te deben más' : 'Debes más'}
          icon={netPosition >= 0 ? DollarSign : TrendingDown}
          accent={netPosition >= 0 ? 'brand' : 'rose'}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 print:hidden dark:border-slate-700">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => {
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

      {tab === 'cobrar' && (
        <CobrarTab
          aging={customerAging}
          topDebtors={topDebtors}
          credits={openCredits}
        />
      )}
      {tab === 'pagar' && (
        <PagarTab
          aging={supplierAging}
          topCreditors={topCreditors}
          credits={openSupplierCredits}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CobrarTab({ aging, topDebtors, credits }) {
  return (
    <div className="space-y-6">
      <AgingCard title="Antigüedad de cuentas por cobrar" aging={aging} accent="amber" />

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Top 20 clientes con saldo
          </h3>
        </div>
        {topDebtors.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Sin saldos pendientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Vencido</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                  <th className="px-4 py-3 text-right">Límite</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {topDebtors.map((c) => {
                  const overdue = Number(c.overdue_balance_usd) > 0;
                  return (
                    <tr key={c.customer_id} className="text-sm">
                      <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{c.name}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{c.document_id || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                        {formatMoney(c.ar_balance_usd)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${
                        overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-400'
                      }`}>
                        {overdue ? formatMoney(c.overdue_balance_usd) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {c.open_credits_count}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {Number(c.credit_limit_usd) > 0 ? formatMoney(c.credit_limit_usd) : '—'}
                      </td>
                      <td className="px-4 py-2 print:hidden">
                        <Link
                          href={`/clientes/${c.customer_id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Ver
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreditDetailTable
        title="Detalle de créditos abiertos"
        credits={credits}
        kind="customer"
      />
    </div>
  );
}

function PagarTab({ aging, topCreditors, credits }) {
  return (
    <div className="space-y-6">
      <AgingCard title="Antigüedad de cuentas por pagar" aging={aging} accent="rose" />

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Top 20 proveedores con saldo
          </h3>
        </div>
        {topCreditors.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Sin saldos pendientes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Vencido</th>
                  <th className="px-4 py-3 text-right">Créditos</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {topCreditors.map((s) => {
                  const overdue = Number(s.overdue_balance_usd) > 0;
                  return (
                    <tr key={s.supplier_id} className="text-sm">
                      <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{s.name}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                        {s.contact_name || '—'}
                        {s.phone && <div className="text-xs">{s.phone}</div>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">
                        {formatMoney(s.ap_balance_usd)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${
                        overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-400'
                      }`}>
                        {overdue ? formatMoney(s.overdue_balance_usd) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {s.open_credits_count}
                      </td>
                      <td className="px-4 py-2 print:hidden">
                        <Link
                          href={`/proveedores/${s.supplier_id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Ver
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreditDetailTable
        title="Detalle de créditos abiertos"
        credits={credits}
        kind="supplier"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function AgingCard({ title, aging, accent }) {
  const total = aging.reduce((a, b) => a + b.amount, 0);
  const totalCount = aging.reduce((a, b) => a + b.count, 0);
  if (total === 0) {
    return (
      <div className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Sin saldos abiertos.
      </div>
    );
  }
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {aging.map((b) => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0;
          const color = bucketColor(b.key, accent);
          return (
            <div key={b.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {b.label}
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {formatMoney(b.amount)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {b.count} crédito{b.count === 1 ? '' : 's'} · {pct.toFixed(1)}%
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Total: <strong className="text-slate-900 dark:text-slate-100">{formatMoney(total)}</strong>
        {' '}· {totalCount} créditos abiertos
      </div>
    </div>
  );
}

function CreditDetailTable({ title, credits, kind }) {
  if (credits.length === 0) return null;
  const isCustomer = kind === 'customer';
  const today = todayStr();
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title} ({credits.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">{isCustomer ? 'Cliente' : 'Proveedor'}</th>
              {isCustomer && <th className="px-4 py-3">Origen</th>}
              <th className="px-4 py-3 text-right">Original</th>
              <th className="px-4 py-3 text-right">Pagado</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Vence</th>
              <th className="px-4 py-3 text-right">Antigüedad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {credits.map((c) => {
              // Comparación por string YYYY-MM-DD en hora Caracas (consistente
              // con CreditsClient; evita que un crédito que vence "hoy" se
              // marque como vencido durante el día).
              const overdue = c.due_date && c.due_date < today;
              const age = daysOpen(c);
              const name = isCustomer ? c.customers?.name : c.suppliers?.name;
              const invoice = isCustomer
                ? (c.sales?.invoice_number ? `#${c.sales.invoice_number}` : 'Manual')
                : null;
              return (
                <tr key={c.id} className="text-sm">
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{fmt.date(c.created_at)}</td>
                  <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{name}</td>
                  {isCustomer && (
                    <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{invoice}</td>
                  )}
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{formatMoney(c.original_amount_usd)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatMoney(c.paid_amount_usd)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-amber-700 dark:text-amber-400">{formatMoney(c.balance_usd)}</td>
                  <td className="px-4 py-2">
                    {c.due_date ? (
                      <span className={`inline-flex items-center gap-1 text-xs ${
                        overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'
                      }`}>
                        {overdue && <AlertTriangle className="h-3 w-3" />}
                        <Calendar className="h-3 w-3" />
                        {fmt.date(c.due_date)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                    {age}d
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysOpen(credit) {
  const created = new Date(credit.created_at);
  const ms = Date.now() - created.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function bucketize(credits) {
  return AGING_BUCKETS.map((b) => {
    const matching = credits.filter((c) => {
      const d = daysOpen(c);
      return d >= b.min && d <= b.max;
    });
    return {
      ...b,
      count:  matching.length,
      amount: matching.reduce((a, c) => a + Number(c.balance_usd || 0), 0),
    };
  });
}

function bucketColor(key, accent) {
  if (accent === 'rose') {
    return key === 'b1' ? 'bg-emerald-500'
         : key === 'b2' ? 'bg-amber-500'
         : key === 'b3' ? 'bg-rose-400'
         : 'bg-rose-600';
  }
  return key === 'b1' ? 'bg-emerald-500'
       : key === 'b2' ? 'bg-amber-500'
       : key === 'b3' ? 'bg-orange-500'
       : 'bg-rose-500';
}

function buildExports({ slug, title, rows, columns }) {
  const today = todayStr();
  const filename = `${slug}-${today}`;
  return {
    csv: { filename, columns, rows },
    pdf: {
      filename,
      title,
      subtitle: `Generado el ${normalizeSpaces(new Date().toLocaleDateString('es-VE', { timeZone: 'America/Caracas' }))}`,
      meta: [['Filas', rows.length]],
      tables: [{ columns, rows }],
      orientation: columns.length > 5 ? 'landscape' : 'portrait',
    },
  };
}
