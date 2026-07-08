-- =========================================================================
-- 023_manual_usd_cop_rate.sql
-- =========================================================================
-- Requisitos: 001-022 aplicadas.
--
-- El peso colombiano pasa a ser la moneda base del negocio. Como la tasa
-- USD/COP del comercio varía a diario y NO coincide con el TRM oficial, la
-- tasa `usd_cop` deja de bajarse automáticamente del TRM y pasa a ser
-- MANUAL (la fija el admin en /tasas, igual que la tasa Rino COP→VES).
--
-- El TRM automático (DolarApi) se sigue trayendo, pero solo como REFERENCIA
-- visible, en la nueva columna `usd_cop_trm`. Ya no se usa en los cálculos.
--
--   usd_cop      → tasa MANUAL usada en los cálculos de precios
--   usd_cop_trm  → TRM automático, solo referencia
-- =========================================================================

begin;

alter table public.exchange_rates
  add column if not exists usd_cop_trm numeric(14,4);

-- Continuidad histórica: hasta ahora `usd_cop` se bajaba del TRM automático,
-- así que ese valor histórico ES el TRM. Lo copiamos a la columna de
-- referencia para que el gráfico/histórico no muestre huecos.
update public.exchange_rates
set usd_cop_trm = usd_cop
where usd_cop_trm is null and usd_cop is not null;

comment on column public.exchange_rates.usd_cop is
  'Tasa USD/COP MANUAL fijada por el admin. Es la que se usa en los cálculos de precios (peso = moneda base).';
comment on column public.exchange_rates.usd_cop_trm is
  'TRM USD/COP automático (DolarApi). Solo referencia, NO se usa en cálculos.';

commit;
