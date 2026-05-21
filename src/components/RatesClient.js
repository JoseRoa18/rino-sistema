'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, BarChart3, Pencil,
  Check, X, Settings, Info,
} from 'lucide-react';
import {
  refreshRatesAction,
  updateCustomRateAction,
} from '@/app/(dashboard)/tasas/actions';
import PageHeader from './PageHeader';
import Sparkline from './Sparkline';
import EmptyState from './EmptyState';

export default function RatesClient({ initialRates, role }) {
  const [rates, setRates] = useState(initialRates || []);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isPending, startTransition] = useTransition();
  const [editingCustom, setEditingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [savingCustom, setSavingCustom] = useState(false);
  const isAdmin = role === 'admin';

  function handleManualRefresh() {
    setMessage({ type: '', text: '' });
    startTransition(async () => {
      const result = await refreshRatesAction();
      if (result.ok) {
        setMessage({
          type: 'success',
          text: 'Tasas actualizadas correctamente desde DolarApi.com.',
        });
        setRates((prev) => {
          const others = prev.filter((r) => r.rate_date !== result.rates.rate_date);
          return [result.rates, ...others].slice(0, 30);
        });
      } else {
        setMessage({ type: 'error', text: result.error || 'No se pudo actualizar.' });
      }
    });
  }

  async function handleSaveCustom() {
    setMessage({ type: '', text: '' });
    setSavingCustom(true);
    const result = await updateCustomRateAction(customInput);
    setSavingCustom(false);
    if (result.ok) {
      setMessage({ type: 'success', text: 'Tasa personalizada actualizada.' });
      setRates((prev) => {
        const others = prev.filter((r) => r.rate_date !== result.rates.rate_date);
        return [result.rates, ...others].slice(0, 30);
      });
      setEditingCustom(false);
    } else {
      setMessage({ type: 'error', text: result.error || 'No se pudo guardar.' });
    }
  }

  function startEditCustom() {
    setCustomInput(today?.rino_cop_ves ? Number(today.rino_cop_ves).toString() : '');
    setEditingCustom(true);
  }

  const today = rates[0];
  const yesterday = rates[1];

  const sparkSeries = useMemo(() => {
    const sorted = [...rates].sort(
      (a, b) => new Date(a.rate_date) - new Date(b.rate_date)
    );
    return {
      paralelo: sorted.map((r) => Number(r.usd_ves_paralelo)).filter(Number.isFinite),
      bcv:      sorted.map((r) => Number(r.usd_ves_bcv)).filter(Number.isFinite),
      rino:     sorted.map((r) => Number(r.rino_cop_ves)).filter(Number.isFinite),
      cop:      sorted.map((r) => Number(r.usd_cop)).filter(Number.isFinite),
    };
  }, [rates]);

  function variation(curr, prev) {
    if (!curr || !prev || prev === 0) return null;
    return ((Number(curr) - Number(prev)) / Number(prev)) * 100;
  }

  const varParalelo = variation(today?.usd_ves_paralelo, yesterday?.usd_ves_paralelo);
  const varBcv      = variation(today?.usd_ves_bcv,      yesterday?.usd_ves_bcv);
  const varRino     = variation(today?.rino_cop_ves,     yesterday?.rino_cop_ves);
  const varCop      = variation(today?.usd_cop,          yesterday?.usd_cop);

  const spread =
    today?.usd_ves_paralelo && today?.usd_ves_bcv
      ? ((Number(today.usd_ves_paralelo) - Number(today.usd_ves_bcv)) /
          Number(today.usd_ves_bcv)) *
        100
      : null;

  // Ejemplo de conversión para que el admin entienda la tasa personalizada
  const exampleCop = 5000;
  const examplePreview = today?.rino_cop_ves
    ? Math.ceil(exampleCop / Number(today.rino_cop_ves))
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasas cambiarias"
        subtitle="Tasas USD/VES y USD/COP automáticas + tasa personalizada Rino COP→VES"
        actions={
          isAdmin && (
            <button
              onClick={handleManualRefresh}
              disabled={isPending}
              className="btn-primary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              {isPending ? 'Actualizando...' : 'Actualizar tasas automáticas'}
            </button>
          )
        }
      />

      {message.text && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RateCard
          label="USD/VES Paralelo"
          value={today?.usd_ves_paralelo ? Number(today.usd_ves_paralelo).toFixed(2) : '—'}
          variation={varParalelo}
          footnote="Mercado libre · DolarApi"
          series={sparkSeries.paralelo}
          accent="emerald"
        />
        <RateCard
          label="USD/VES BCV"
          value={today?.usd_ves_bcv ? Number(today.usd_ves_bcv).toFixed(2) : '—'}
          variation={varBcv}
          footnote={
            <>
              Banco Central · oficial
              {spread !== null && (
                <span className="ml-1">· spread {spread.toFixed(1)}%</span>
              )}
            </>
          }
          series={sparkSeries.bcv}
          accent="brand"
        />

        {/* Tasa personalizada — editable inline por admin */}
        <CustomRateCard
          value={today?.rino_cop_ves}
          variation={varRino}
          series={sparkSeries.rino}
          isAdmin={isAdmin}
          editing={editingCustom}
          input={customInput}
          onInputChange={setCustomInput}
          onStartEdit={startEditCustom}
          onSave={handleSaveCustom}
          onCancel={() => setEditingCustom(false)}
          saving={savingCustom}
          examplePreview={examplePreview}
          exampleCop={exampleCop}
        />

        <RateCard
          label="USD/COP"
          value={today?.usd_cop ? Number(today.usd_cop).toFixed(0) : '—'}
          variation={varCop}
          footnote="Peso colombiano · DolarApi"
          series={sparkSeries.cop}
          accent="violet"
        />
      </div>

      {/* Explicación del cálculo */}
      {today?.rino_cop_ves && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <strong>Cómo se aplica:</strong> el precio en Bs se calcula dividiendo
            el precio en COP entre la tasa personalizada y redondeando hacia arriba.
            <br />
            Ejemplo: <code className="rounded bg-amber-100 px-1 dark:bg-amber-500/20">
              {exampleCop.toLocaleString('es-CO')} COP ÷ {Number(today.rino_cop_ves).toFixed(2)} = {(exampleCop / Number(today.rino_cop_ves)).toFixed(2)} → {examplePreview} Bs
            </code>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Histórico (últimos 30 días)
          </h2>
        </div>
        {rates.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Aún no hay tasas registradas"
            description="Cuando el cron diario corra (o presiones Actualizar) las tasas aparecerán aquí."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Fecha</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Paralelo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">BCV</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Rino COP→VES</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">USD/COP</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {new Date(r.rate_date).toLocaleDateString('es-VE')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                      {r.usd_ves_paralelo ? Number(r.usd_ves_paralelo).toFixed(2) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                      {r.usd_ves_bcv ? Number(r.usd_ves_bcv).toFixed(2) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                      {r.rino_cop_ves ? Number(r.rino_cop_ves).toFixed(4) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                      {r.usd_cop ? Number(r.usd_cop).toFixed(0) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs capitalize text-slate-500 dark:text-slate-400">
                      {r.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// RateCard — para tasas automáticas (lectura)
// ============================================================================
function RateCard({ label, labelIcon: LabelIcon, value, variation, footnote, series, accent }) {
  return (
    <div className="card relative overflow-hidden p-5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        {LabelIcon && <LabelIcon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-3xl font-bold leading-none text-slate-900 dark:text-slate-100">
          {value}
        </p>
        {series.length >= 2 && (
          <Sparkline data={series} accent={accent} className="h-10 w-24 flex-shrink-0" />
        )}
      </div>
      {variation !== null && variation !== undefined && (
        <p
          className={`mt-2 flex items-center gap-1 text-xs font-medium ${
            variation >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {variation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {variation.toFixed(2)}% vs ayer
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{footnote}</p>
    </div>
  );
}

// ============================================================================
// CustomRateCard — tasa personalizada Rino COP→VES (editable por admin)
// ============================================================================
function CustomRateCard({
  value, variation, series, isAdmin,
  editing, input, onInputChange, onStartEdit, onSave, onCancel, saving,
  examplePreview, exampleCop,
}) {
  const hasValue = value !== null && value !== undefined;
  return (
    <div className="card relative overflow-hidden border-amber-200 p-5 ring-1 ring-amber-100 dark:border-amber-500/30 dark:ring-amber-500/10">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
          <Settings className="h-3.5 w-3.5" />
          Tasa personalizada Rino
        </p>
        {isAdmin && !editing && (
          <button
            onClick={onStartEdit}
            className="rounded p-1 text-slate-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-500/20 dark:hover:text-amber-400"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.0001"
              min="0"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              autoFocus
              placeholder="Ej: 5.5"
              className="input flex-1 font-mono text-lg"
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave();
                if (e.key === 'Escape') onCancel();
              }}
            />
            <button
              onClick={onSave}
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              title="Guardar"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Cancelar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Cuántos pesos colombianos equivalen a 1 bolívar
          </p>
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-3xl font-bold leading-none text-slate-900 dark:text-slate-100">
              {hasValue ? Number(value).toFixed(2) : '—'}
            </p>
            {series.length >= 2 && (
              <Sparkline data={series} accent="amber" className="h-10 w-24 flex-shrink-0" />
            )}
          </div>
          {variation !== null && variation !== undefined && (
            <p
              className={`mt-2 flex items-center gap-1 text-xs font-medium ${
                variation >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {variation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {variation.toFixed(2)}% vs ayer
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {hasValue
              ? `${exampleCop.toLocaleString('es-CO')} COP → ${examplePreview} Bs`
              : isAdmin
              ? 'Aún no establecida — click ✏️ para definirla'
              : 'Pendiente de definir por admin'}
          </p>
        </>
      )}
    </div>
  );
}
