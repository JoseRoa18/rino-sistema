'use client';

import { useState, useTransition, useMemo } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Bitcoin, BarChart3 } from 'lucide-react';
import { refreshRatesAction } from '@/app/(dashboard)/tasas/actions';
import PageHeader from './PageHeader';
import Sparkline from './Sparkline';
import EmptyState from './EmptyState';

export default function RatesClient({ initialRates, role }) {
  const [rates, setRates] = useState(initialRates || []);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isPending, startTransition] = useTransition();
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

  const today = rates[0];
  const yesterday = rates[1];

  // Series cronológicas para sparklines (orden ascendente, últimos 30 días).
  // Filtramos null/undefined para no romper la línea.
  const sparkSeries = useMemo(() => {
    const sorted = [...rates].sort((a, b) =>
      new Date(a.rate_date) - new Date(b.rate_date)
    );
    return {
      paralelo: sorted.map((r) => Number(r.usd_ves_paralelo)).filter(Number.isFinite),
      bcv:      sorted.map((r) => Number(r.usd_ves_bcv)).filter(Number.isFinite),
      binance:  sorted.map((r) => Number(r.usd_ves_binance)).filter(Number.isFinite),
      cop:      sorted.map((r) => Number(r.usd_cop)).filter(Number.isFinite),
    };
  }, [rates]);

  function variation(curr, prev) {
    if (!curr || !prev || prev === 0) return null;
    return ((Number(curr) - Number(prev)) / Number(prev)) * 100;
  }

  const varParalelo = variation(today?.usd_ves_paralelo, yesterday?.usd_ves_paralelo);
  const varBcv      = variation(today?.usd_ves_bcv,      yesterday?.usd_ves_bcv);
  const varBinance  = variation(today?.usd_ves_binance,  yesterday?.usd_ves_binance);
  const varCop      = variation(today?.usd_cop,          yesterday?.usd_cop);

  const spread =
    today?.usd_ves_paralelo && today?.usd_ves_bcv
      ? ((Number(today.usd_ves_paralelo) - Number(today.usd_ves_bcv)) /
          Number(today.usd_ves_bcv)) *
        100
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasas cambiarias"
        subtitle="Histórico diario de tasas USD/VES y USD/COP. Fuente: DolarApi.com"
        actions={
          isAdmin && (
            <button
              onClick={handleManualRefresh}
              disabled={isPending}
              className="btn-primary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              {isPending ? 'Actualizando...' : 'Actualizar ahora'}
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
          footnote="Mercado libre"
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
        <RateCard
          label="VES Binance P2P"
          labelIcon={Bitcoin}
          value={today?.usd_ves_binance ? Number(today.usd_ves_binance).toFixed(2) : '—'}
          variation={varBinance}
          footnote="Peer-to-peer"
          series={sparkSeries.binance}
          accent="amber"
        />
        <RateCard
          label="USD/COP"
          value={today?.usd_cop ? Number(today.usd_cop).toFixed(0) : '—'}
          variation={varCop}
          footnote="Peso colombiano"
          series={sparkSeries.cop}
          accent="violet"
        />
      </div>

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
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Binance</th>
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
                      {r.usd_ves_binance ? Number(r.usd_ves_binance).toFixed(2) : '—'}
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
// RateCard — preserva el énfasis del valor (3xl) y agrega sparkline
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
