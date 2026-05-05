-- =========================================================================
-- 004_add_binance_column.sql
-- Agrega persistencia de la tasa USD/VES Binance P2P
-- =========================================================================

alter table public.exchange_rates
  add column if not exists usd_ves_binance numeric(18, 4);

comment on column public.exchange_rates.usd_ves_binance is
  'Tasa USD/VES en Binance P2P (mercado peer-to-peer). Útil como referencia para distribución fronteriza Venezuela-Colombia.';
