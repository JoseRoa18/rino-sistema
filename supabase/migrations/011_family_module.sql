-- =========================================================================
-- 011_family_module.sql — Módulo de consumo familiar (control interno)
-- =========================================================================
-- Requisitos: 001-010 aplicadas.
--
-- Contenido:
--   1. Schema patch:
--      - sales.is_internal (boolean) — distingue consumo interno
--      - customers.is_internal (boolean) — identifica el cliente Familia
--   2. Seed idempotente del cliente "Familia"
--   3. Función helper public.family_customer_id()
--   4. RPC public.register_family_consumption(payload jsonb)
--      Factura a precio costo, marca is_internal=true, descuenta stock.
--   5. Re-crea TODAS las vistas para excluir is_internal:
--      - v_dashboard_kpis, v_sales_daily, v_pnl_daily
--      - v_sales_by_cashier, v_sales_by_payment, v_sales_by_category
--      - v_sales_by_hour, v_product_profitability
--      - v_customer_stats, v_customers_kpis
--      - v_top_sold_products (también define forma esperada por el dashboard/POS)
--   6. Vistas propias del módulo:
--      - v_family_consumption_daily — agregado diario
--      - v_family_top_products      — productos más consumidos
--      - v_family_kpis              — KPIs del módulo
--   7. RLS / Grants
--
-- IMPORTANTE: Esta migración mantiene el inventario consistente.
-- El trigger tg_sale_item_apply ya descuenta stock al insertar sale_items,
-- por lo que el consumo familiar SÍ afecta el stock, kardex y forecasting,
-- pero NO afecta los reportes financieros (filtrados con is_internal=false).
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Schema patch
-- ===========================================================================

alter table public.sales
  add column if not exists is_internal boolean not null default false;

alter table public.customers
  add column if not exists is_internal boolean not null default false;

-- Índices: optimizan los filtros de "is_internal = false" en vistas y
-- de "is_internal = true" en el módulo familia.
create index if not exists idx_sales_is_internal     on public.sales(is_internal);
create index if not exists idx_customers_is_internal on public.customers(is_internal) where is_internal = true;

-- ===========================================================================
-- 2) Seed: asegurar cliente "Familia" (idempotente)
-- ===========================================================================
-- Si ya existe algún cliente con is_internal = true, no se crea otro.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from public.customers where is_internal = true) then
    insert into public.customers
      (name, customer_type, is_internal, notes, active)
    values
      ('Familia', 'eventual', true,
       'Consumo familiar interno — productos facturados a costo. No afecta reportes financieros.',
       true);
  end if;
end $$;

-- ===========================================================================
-- 3) Helper: id del cliente familia (única fila con is_internal = true)
-- ===========================================================================

create or replace function public.family_customer_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select id from public.customers where is_internal = true order by created_at limit 1;
$$;

grant execute on function public.family_customer_id() to authenticated;

-- ===========================================================================
-- 4) RPC: registrar consumo familiar
-- ===========================================================================
-- payload = {
--   items: [{ product_id, quantity }, ...],
--   notes?,
-- }
--
-- - Solo admin/supervisor
-- - Auto: customer_id = familia, is_internal = true
-- - Cada item se factura al cost_avg actual del producto
-- - Los triggers existentes descuentan stock y registran kardex
-- ===========================================================================

create or replace function public.register_family_consumption(payload jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_role        text;
  v_family_id   uuid;
  v_sale_id     uuid;
  v_session_id  uuid;
  v_item        jsonb;
  v_cost        numeric(14,4);
  v_product_name text;
  v_qty         numeric(14,3);
  v_rate_ves    numeric(14,4);
  v_rate_cop    numeric(14,4);
begin
  -- Permisos
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'supervisor') then
    raise exception 'Solo admin o supervisor pueden registrar consumo familiar';
  end if;

  -- Cliente familia (debe existir por seed)
  v_family_id := public.family_customer_id();
  if v_family_id is null then
    raise exception 'No existe cliente Familia configurado';
  end if;

  -- Validar payload
  if payload->'items' is null or jsonb_array_length(payload->'items') = 0 then
    raise exception 'Debes registrar al menos un producto';
  end if;

  -- Tasas vigentes (snapshot)
  select usd_ves_paralelo, usd_cop into v_rate_ves, v_rate_cop
  from public.exchange_rates
  order by rate_date desc
  limit 1;

  -- Turno abierto del usuario (si existe)
  select id into v_session_id
  from public.cash_sessions
  where cashier_id = auth.uid() and closed_at is null
  order by opened_at desc
  limit 1;

  -- Crear cabecera con is_internal = true
  insert into public.sales (
    cashier_id, cash_session_id, customer_id,
    payment_method, paid_currency, paid_amount,
    rate_usd_ves, rate_usd_cop,
    is_internal, notes
  ) values (
    auth.uid(), v_session_id, v_family_id,
    'efectivo', 'USD', 0,
    v_rate_ves, v_rate_cop,
    true,
    coalesce(payload->>'notes', 'Consumo familiar')
  ) returning id into v_sale_id;

  -- Insertar items al cost_avg actual
  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida en item';
    end if;

    -- Obtener costo y nombre actuales
    select cost_avg, name into v_cost, v_product_name
    from public.products
    where id = (v_item->>'product_id')::uuid;

    if v_cost is null then
      raise exception 'Producto no encontrado: %', v_item->>'product_id';
    end if;

    -- Insertar item — unit_price_usd = cost_avg para que total = costo
    -- El trigger tg_sale_item_apply usará unit_cost_usd = cost_avg via su
    -- propio fallback (cuando unit_cost_usd es null o 0).
    insert into public.sale_items (
      sale_id, product_id, product_name, quantity,
      unit_price_usd, unit_cost_usd, line_total_usd
    ) values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_product_name,
      v_qty,
      v_cost,           -- "precio" = costo, no hay margen
      v_cost,           -- snapshot del costo
      v_qty * v_cost
    );
  end loop;

  -- Auditoría
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'register_family_consumption', 'sale', v_sale_id, payload);

  return v_sale_id;
end;
$$;

grant execute on function public.register_family_consumption(jsonb) to authenticated;

-- ===========================================================================
-- 5) PARCHE DE VISTAS — excluir is_internal = true
-- ===========================================================================
-- IMPORTANTE: Postgres NO permite cambiar el shape de una vista con
-- CREATE OR REPLACE (error 42P16: cannot drop columns from view).
-- Por eso primero hacemos DROP VIEW IF EXISTS ... CASCADE para forzar la
-- recreación. CASCADE elimina vistas/funciones dependientes — como las
-- volvemos a crear inmediatamente abajo, no se pierde nada.
-- ===========================================================================

drop view if exists public.v_dashboard_kpis           cascade;
drop view if exists public.v_sales_daily              cascade;
drop view if exists public.v_pnl_daily                cascade;
drop view if exists public.v_sales_by_cashier         cascade;
drop view if exists public.v_sales_by_payment         cascade;
drop view if exists public.v_sales_by_category        cascade;
drop view if exists public.v_sales_by_hour            cascade;
drop view if exists public.v_product_profitability    cascade;
drop view if exists public.v_top_sold_products        cascade;
drop view if exists public.v_customer_stats           cascade;
drop view if exists public.v_customers_kpis           cascade;
-- Vistas del módulo familia (por si fallaron a medias en un intento previo)
drop view if exists public.v_family_consumption_daily cascade;
drop view if exists public.v_family_top_products      cascade;
drop view if exists public.v_family_kpis              cascade;

-- ---- v_dashboard_kpis ----
create view public.v_dashboard_kpis as
select
  (select coalesce(sum(total_usd), 0)
   from public.sales
   where created_at::date = current_date
     and status = 'completada'
     and is_internal = false) as sales_today_usd,

  (select count(*)
   from public.sales
   where created_at::date = current_date
     and status = 'completada'
     and is_internal = false) as transactions_today,

  (select coalesce(sum(total_usd), 0)
   from public.sales
   where created_at >= current_date - interval '6 days'
     and status = 'completada'
     and is_internal = false) as sales_week_usd,

  (select coalesce(sum(total_usd), 0)
   from public.sales
   where date_trunc('month', created_at) = date_trunc('month', current_date)
     and status = 'completada'
     and is_internal = false) as sales_month_usd,

  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.created_at::date = current_date
     and s.status = 'completada'
     and s.is_internal = false) as profit_today_usd,

  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.created_at >= current_date - interval '6 days'
     and s.status = 'completada'
     and s.is_internal = false) as profit_week_usd,

  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where date_trunc('month', s.created_at) = date_trunc('month', current_date)
     and s.status = 'completada'
     and s.is_internal = false) as profit_month_usd,

  (select count(*) from public.products
   where stock <= min_stock and active = true) as low_stock_count,

  (select coalesce(sum(balance_usd), 0)
   from public.credits where status = 'abierto') as pending_credits_usd;

-- ---- v_sales_daily ----
create view public.v_sales_daily as
select
  created_at::date as day,
  count(*) as transactions,
  sum(total_usd) as total_usd
from public.sales
where status = 'completada'
  and is_internal = false
  and created_at >= current_date - interval '29 days'
group by 1
order by 1;

-- ---- v_pnl_daily ----
create view public.v_pnl_daily as
select
  s.created_at::date                                              as day,
  count(distinct s.id)                                            as tx_count,
  sum(si.line_total_usd)                                          as revenue_usd,
  sum(si.unit_cost_usd * si.quantity)                             as cogs_usd,
  sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity)       as profit_usd,
  case
    when sum(si.line_total_usd) > 0
    then sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity) / sum(si.line_total_usd) * 100
    else 0
  end                                                             as margin_pct
from public.sales s
join public.sale_items si on si.sale_id = s.id
where s.status = 'completada' and s.is_internal = false
group by s.created_at::date;

-- ---- v_sales_by_cashier ----
create view public.v_sales_by_cashier as
select
  s.cashier_id,
  pr.full_name                                  as cashier_name,
  s.created_at::date                            as day,
  count(*) filter (where s.status = 'completada') as tx_count,
  count(*) filter (where s.status = 'anulada')    as void_count,
  coalesce(sum(s.total_usd) filter (where s.status = 'completada'), 0)
                                                  as total_usd,
  coalesce(sum(s.total_usd) filter (where s.status = 'anulada'), 0)
                                                  as voided_usd
from public.sales s
left join public.profiles pr on pr.id = s.cashier_id
where s.is_internal = false
group by s.cashier_id, pr.full_name, s.created_at::date;

-- ---- v_sales_by_payment ----
create view public.v_sales_by_payment as
select
  s.created_at::date                            as day,
  s.payment_method,
  s.paid_currency,
  count(*)                                      as tx_count,
  coalesce(sum(s.total_usd), 0)                 as total_usd
from public.sales s
where s.status = 'completada' and s.is_internal = false
group by s.created_at::date, s.payment_method, s.paid_currency;

-- ---- v_sales_by_category ----
create view public.v_sales_by_category as
select
  s.created_at::date                              as day,
  coalesce(c.id, '00000000-0000-0000-0000-000000000000'::uuid) as category_id,
  coalesce(c.name, 'Sin categoría')               as category_name,
  count(distinct s.id)                            as tx_count,
  sum(si.quantity)                                as units_sold,
  sum(si.line_total_usd)                          as revenue_usd,
  sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity)
                                                  as profit_usd
from public.sales s
join public.sale_items si on si.sale_id = s.id
join public.products p    on p.id = si.product_id
left join public.categories c on c.id = p.category_id
where s.status = 'completada' and s.is_internal = false
group by s.created_at::date, c.id, c.name;

-- ---- v_sales_by_hour ----
create view public.v_sales_by_hour as
select
  extract(dow  from s.created_at at time zone 'America/Caracas')::int as dow,
  extract(hour from s.created_at at time zone 'America/Caracas')::int as hour,
  count(*)                                                              as tx_count,
  sum(s.total_usd)                                                      as total_usd
from public.sales s
where s.status = 'completada'
  and s.is_internal = false
  and s.created_at >= now() - interval '90 days'
group by 1, 2;

-- ---- v_product_profitability ----
create view public.v_product_profitability as
select
  p.id                                              as product_id,
  p.sku,
  p.name,
  p.category_id,
  c.name                                            as category_name,
  p.stock,
  p.cost_avg,
  p.price_usd,
  p.target_margin,
  coalesce(sum(si.quantity), 0)                     as units_sold,
  coalesce(sum(si.line_total_usd), 0)               as revenue_usd,
  coalesce(sum(si.unit_cost_usd * si.quantity), 0)  as cogs_usd,
  coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
                                                    as profit_usd,
  case
    when coalesce(sum(si.line_total_usd), 0) > 0
    then sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity)
       / sum(si.line_total_usd) * 100
    else 0
  end                                               as margin_pct,
  max(s.created_at)                                 as last_sold_at,
  case
    when max(s.created_at) is null then null
    else extract(day from (now() - max(s.created_at)))::int
  end                                               as days_since_last_sale
from public.products p
left join public.categories c on c.id = p.category_id
left join public.sale_items si on si.product_id = p.id
left join public.sales s on s.id = si.sale_id
  and s.status = 'completada'
  and s.is_internal = false
group by p.id, p.sku, p.name, p.category_id, c.name,
         p.stock, p.cost_avg, p.price_usd, p.target_margin;

-- ---- v_top_sold_products (re-creada con shape esperado por dashboard/POS) ----
create view public.v_top_sold_products as
select
  p.id,
  p.name,
  p.sku,
  p.unit,
  p.stock,
  p.price_usd,
  p.category_id,
  coalesce(sum(si.quantity), 0) as units_sold_30d
from public.products p
left join public.sale_items si on si.product_id = p.id
left join public.sales s on s.id = si.sale_id
  and s.status = 'completada'
  and s.is_internal = false
  and s.created_at >= now() - interval '30 days'
where p.active = true
group by p.id, p.name, p.sku, p.unit, p.stock, p.price_usd, p.category_id
having coalesce(sum(si.quantity), 0) > 0
order by units_sold_30d desc;

-- ---- v_customer_stats (excluir cliente Familia) ----
create view public.v_customer_stats as
select
  c.id              as customer_id,
  c.name,
  c.document_id,
  c.phone,
  c.email,
  c.address,
  c.credit_limit_usd,
  c.customer_type,
  c.active,
  c.tags,
  c.birthday,
  c.notes,
  c.created_at,
  c.updated_at,

  coalesce(s.total_spent_usd, 0)        as total_spent_usd,
  coalesce(s.sales_count, 0)            as sales_count,
  coalesce(s.avg_ticket_usd, 0)         as avg_ticket_usd,
  s.first_sale_at,
  s.last_sale_at,

  coalesce(cr.ar_balance_usd, 0)        as ar_balance_usd,
  coalesce(cr.open_credits_count, 0)    as open_credits_count,
  coalesce(cr.overdue_count, 0)         as overdue_count,
  coalesce(cr.overdue_balance_usd, 0)   as overdue_balance_usd,

  case
    when s.last_sale_at is null then null
    else extract(day from (now() - s.last_sale_at))::int
  end                                    as days_since_last_sale,

  greatest(c.credit_limit_usd - coalesce(cr.ar_balance_usd, 0), 0)
                                          as credit_available_usd,
  (c.credit_limit_usd > 0
   and coalesce(cr.ar_balance_usd, 0) >= c.credit_limit_usd)
                                          as is_over_limit

from public.customers c

left join lateral (
  select
    sum(sa.total_usd)  as total_spent_usd,
    count(*)           as sales_count,
    avg(sa.total_usd)  as avg_ticket_usd,
    min(sa.created_at) as first_sale_at,
    max(sa.created_at) as last_sale_at
  from public.sales sa
  where sa.customer_id = c.id
    and sa.status = 'completada'
    and sa.is_internal = false
) s on true

left join lateral (
  select
    sum(cred.balance_usd) as ar_balance_usd,
    count(*)              as open_credits_count,
    count(*) filter (where cred.due_date is not null and cred.due_date < current_date)
                          as overdue_count,
    sum(cred.balance_usd) filter (where cred.due_date is not null and cred.due_date < current_date)
                          as overdue_balance_usd
  from public.credits cred
  where cred.customer_id = c.id and cred.status = 'abierto'
) cr on true

where c.is_internal = false;   -- excluye Familia de la cartera de clientes

-- ---- v_customers_kpis (excluir cliente Familia) ----
create view public.v_customers_kpis as
with credits_open as (
  select
    customer_id,
    sum(balance_usd)                                                     as balance_usd,
    sum(case when due_date < current_date then balance_usd else 0 end)   as overdue_balance_usd
  from public.credits
  where status = 'abierto'
  group by customer_id
)
select
  (select count(*) from public.customers where is_internal = false)                  as total_customers,
  (select count(*) from public.customers where is_internal = false and active = true) as active_customers,
  (select count(*) from public.customers
    where is_internal = false
      and active = true
      and created_at >= date_trunc('month', current_date))                            as new_this_month,
  (select count(*) from credits_open)                                                 as customers_with_credit,
  (select coalesce(sum(balance_usd), 0)         from credits_open)                    as total_ar_balance,
  (select coalesce(sum(overdue_balance_usd), 0) from credits_open)                    as overdue_ar_balance,
  (select count(*) from credits_open where overdue_balance_usd > 0)                   as overdue_customers_count;

-- ===========================================================================
-- 6) Vistas del módulo familia
-- ===========================================================================

-- ---- v_family_consumption_daily ----
-- Resumen diario de consumo familiar: cantidad de "salidas" y costo total
create view public.v_family_consumption_daily as
select
  s.created_at::date                       as day,
  count(distinct s.id)                     as consumption_count,
  sum(si.line_total_usd)                   as cost_usd,
  sum(si.quantity)                         as units
from public.sales s
join public.sale_items si on si.sale_id = s.id
where s.is_internal = true
  and s.status = 'completada'
group by s.created_at::date
order by 1 desc;

-- ---- v_family_top_products ----
-- Productos más consumidos (últimos 90 días por defecto en la UI, vista
-- retorna lifetime y el cliente puede filtrar)
create view public.v_family_top_products as
select
  si.product_id,
  p.name              as product_name,
  p.sku               as product_sku,
  p.unit,
  p.category_id,
  c.name              as category_name,
  sum(si.quantity)    as units_consumed,
  sum(si.line_total_usd) as cost_usd,
  count(distinct s.id) as times_consumed,
  max(s.created_at)    as last_consumed_at
from public.sales s
join public.sale_items si on si.sale_id = s.id
join public.products p    on p.id = si.product_id
left join public.categories c on c.id = p.category_id
where s.is_internal = true
  and s.status = 'completada'
group by si.product_id, p.name, p.sku, p.unit, p.category_id, c.name;

-- ---- v_family_kpis ----
create view public.v_family_kpis as
select
  -- Costo del consumo hoy
  (select coalesce(sum(si.line_total_usd), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and s.created_at::date = current_date) as cost_today_usd,

  -- Mes en curso
  (select coalesce(sum(si.line_total_usd), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('month', s.created_at) = date_trunc('month', current_date)) as cost_month_usd,

  -- Año en curso
  (select coalesce(sum(si.line_total_usd), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('year', s.created_at) = date_trunc('year', current_date)) as cost_year_usd,

  -- Cantidad de consumos del mes
  (select count(*)
   from public.sales s
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('month', s.created_at) = date_trunc('month', current_date)) as consumption_count_month,

  -- Productos únicos consumidos en el mes
  (select count(distinct si.product_id)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('month', s.created_at) = date_trunc('month', current_date)) as unique_products_month,

  -- Último consumo
  (select max(created_at)
   from public.sales
   where is_internal = true and status = 'completada') as last_consumption_at;

-- ===========================================================================
-- 7) Grants
-- ===========================================================================

grant select on public.v_family_consumption_daily to authenticated;
grant select on public.v_family_top_products      to authenticated;
grant select on public.v_family_kpis              to authenticated;

commit;
