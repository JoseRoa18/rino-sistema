-- =========================================================================
-- 015_timezone_caracas.sql — Todas las fechas usan zona horaria Caracas
-- =========================================================================
-- Requisitos: 001-014 aplicadas.
--
-- Problema: las vistas y RPCs usaban `current_date` y `created_at::date`
-- que evalúan en UTC. El servidor está en UTC, así que cuando son las
-- 8pm en Caracas (12am UTC), `current_date` ya devolvía el día siguiente.
-- Resultado: ventas del día no aparecían en el dashboard y los reportes
-- mostraban "mañana".
--
-- Esta migration:
--   1. Crea helpers ve_today() y ve_date(t).
--   2. Redefine TODAS las vistas y funciones que usaban fechas para que
--      operen en zona horaria America/Caracas.
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Helpers de zona horaria
-- ===========================================================================

create or replace function public.ve_today()
returns date
language sql stable
as $$
  select (now() at time zone 'America/Caracas')::date;
$$;

create or replace function public.ve_date(t timestamptz)
returns date
language sql immutable
as $$
  select (t at time zone 'America/Caracas')::date;
$$;

grant execute on function public.ve_today() to authenticated;
grant execute on function public.ve_date(timestamptz) to authenticated;

-- ===========================================================================
-- 2) v_dashboard_kpis — KPIs del dashboard
-- ===========================================================================

create or replace view public.v_dashboard_kpis as
select
  (select coalesce(sum(total_usd), 0)
   from public.sales
   where public.ve_date(created_at) = public.ve_today()
     and status = 'completada'
     and is_internal = false) as sales_today_usd,

  (select count(*)
   from public.sales
   where public.ve_date(created_at) = public.ve_today()
     and status = 'completada'
     and is_internal = false) as transactions_today,

  (select coalesce(sum(total_usd), 0)
   from public.sales
   where public.ve_date(created_at) >= public.ve_today() - 6
     and status = 'completada'
     and is_internal = false) as sales_week_usd,

  (select coalesce(sum(total_usd), 0)
   from public.sales
   where date_trunc('month', created_at at time zone 'America/Caracas')
       = date_trunc('month', (now() at time zone 'America/Caracas'))
     and status = 'completada'
     and is_internal = false) as sales_month_usd,

  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where public.ve_date(s.created_at) = public.ve_today()
     and s.status = 'completada'
     and s.is_internal = false) as profit_today_usd,

  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where public.ve_date(s.created_at) >= public.ve_today() - 6
     and s.status = 'completada'
     and s.is_internal = false) as profit_week_usd,

  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where date_trunc('month', s.created_at at time zone 'America/Caracas')
       = date_trunc('month', (now() at time zone 'America/Caracas'))
     and s.status = 'completada'
     and s.is_internal = false) as profit_month_usd,

  (select count(*) from public.products
   where stock <= min_stock and active = true) as low_stock_count,

  (select coalesce(sum(balance_usd), 0)
   from public.credits where status = 'abierto') as pending_credits_usd;

-- ===========================================================================
-- 3) v_sales_daily — gráfico de últimos 30 días
-- ===========================================================================

create or replace view public.v_sales_daily as
select
  public.ve_date(created_at) as day,
  count(*) as transactions,
  sum(total_usd) as total_usd
from public.sales
where status = 'completada'
  and is_internal = false
  and public.ve_date(created_at) >= public.ve_today() - 29
group by 1
order by 1;

-- ===========================================================================
-- 4) v_pnl_daily — P&L diario
-- ===========================================================================

create or replace view public.v_pnl_daily as
select
  public.ve_date(s.created_at)                                    as day,
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
group by public.ve_date(s.created_at);

-- ===========================================================================
-- 5) v_sales_by_cashier
-- ===========================================================================

create or replace view public.v_sales_by_cashier as
select
  s.cashier_id,
  pr.full_name                                  as cashier_name,
  public.ve_date(s.created_at)                  as day,
  count(*) filter (where s.status = 'completada') as tx_count,
  count(*) filter (where s.status = 'anulada')    as void_count,
  coalesce(sum(s.total_usd) filter (where s.status = 'completada'), 0)
                                                  as total_usd,
  coalesce(sum(s.total_usd) filter (where s.status = 'anulada'), 0)
                                                  as voided_usd
from public.sales s
left join public.profiles pr on pr.id = s.cashier_id
where s.is_internal = false
group by s.cashier_id, pr.full_name, public.ve_date(s.created_at);

-- ===========================================================================
-- 6) v_sales_by_payment
-- ===========================================================================

create or replace view public.v_sales_by_payment as
select
  public.ve_date(s.created_at)                  as day,
  s.payment_method,
  s.paid_currency,
  count(*)                                      as tx_count,
  coalesce(sum(s.total_usd), 0)                 as total_usd
from public.sales s
where s.status = 'completada' and s.is_internal = false
group by public.ve_date(s.created_at), s.payment_method, s.paid_currency;

-- ===========================================================================
-- 7) v_sales_by_category
-- ===========================================================================

create or replace view public.v_sales_by_category as
select
  public.ve_date(s.created_at)                    as day,
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
group by public.ve_date(s.created_at), c.id, c.name;

-- ===========================================================================
-- 8) v_family_consumption_daily y v_family_kpis
-- ===========================================================================

create or replace view public.v_family_consumption_daily as
select
  public.ve_date(s.created_at)             as day,
  count(distinct s.id)                     as consumption_count,
  sum(si.line_total_usd)                   as cost_usd,
  sum(si.quantity)                         as units
from public.sales s
join public.sale_items si on si.sale_id = s.id
where s.is_internal = true
  and s.status = 'completada'
group by public.ve_date(s.created_at)
order by 1 desc;

create or replace view public.v_family_kpis as
select
  (select coalesce(sum(si.line_total_usd), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and public.ve_date(s.created_at) = public.ve_today()) as cost_today_usd,

  (select coalesce(sum(si.line_total_usd), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('month', s.created_at at time zone 'America/Caracas')
       = date_trunc('month', (now() at time zone 'America/Caracas'))) as cost_month_usd,

  (select coalesce(sum(si.line_total_usd), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('year', s.created_at at time zone 'America/Caracas')
       = date_trunc('year', (now() at time zone 'America/Caracas'))) as cost_year_usd,

  (select count(*)
   from public.sales s
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('month', s.created_at at time zone 'America/Caracas')
       = date_trunc('month', (now() at time zone 'America/Caracas'))) as consumption_count_month,

  (select count(distinct si.product_id)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.is_internal = true
     and s.status = 'completada'
     and date_trunc('month', s.created_at at time zone 'America/Caracas')
       = date_trunc('month', (now() at time zone 'America/Caracas'))) as unique_products_month,

  (select max(created_at)
   from public.sales
   where is_internal = true
     and status = 'completada') as last_consumption_at;

-- ===========================================================================
-- 9) daily_summary RPC (cierre de caja) — usa p_date como referencia VE
-- ===========================================================================

create or replace function public.daily_summary(p_date date)
returns json
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_sales_count    int;
  v_revenue        numeric(14,2);
  v_cogs           numeric(14,2);
  v_profit         numeric(14,2);
  v_voided_count   int;
  v_voided_usd     numeric(14,2);
  v_by_payment     jsonb;
  v_by_currency    jsonb;
  v_credits_open_c int;
  v_credits_open_u numeric(14,2);
  v_credits_paid_c int;
  v_credits_paid_u numeric(14,2);
  v_family_count   int;
  v_family_cost    numeric(14,2);
begin
  select
    count(*) filter (where status = 'completada'),
    coalesce(sum(total_usd) filter (where status = 'completada'), 0)
  into v_sales_count, v_revenue
  from public.sales
  where public.ve_date(created_at) = p_date
    and is_internal = false;

  select
    coalesce(sum(si.unit_cost_usd * si.quantity), 0),
    coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
  into v_cogs, v_profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where public.ve_date(s.created_at) = p_date
    and s.is_internal = false
    and s.status = 'completada';

  select
    count(*),
    coalesce(sum(total_usd), 0)
  into v_voided_count, v_voided_usd
  from public.sales
  where public.ve_date(created_at) = p_date
    and is_internal = false
    and status = 'anulada';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'method',    payment_method,
        'count',     tx_count,
        'total_usd', total_usd
      ) order by total_usd desc
    ),
    '[]'::jsonb
  )
  into v_by_payment
  from (
    select
      payment_method,
      count(*)                       as tx_count,
      coalesce(sum(total_usd), 0)    as total_usd
    from public.sales
    where public.ve_date(created_at) = p_date
      and is_internal = false
      and status = 'completada'
    group by payment_method
  ) q;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'currency',             paid_currency,
        'count',                tx_count,
        'total_received_native', total_received_native,
        'total_received_usd',   total_received_usd
      ) order by total_received_usd desc
    ),
    '[]'::jsonb
  )
  into v_by_currency
  from (
    select
      paid_currency,
      count(*)                      as tx_count,
      coalesce(sum(paid_amount), 0) as total_received_native,
      coalesce(sum(total_usd), 0)   as total_received_usd
    from public.sales
    where public.ve_date(created_at) = p_date
      and is_internal = false
      and status = 'completada'
    group by paid_currency
  ) q;

  select
    count(*),
    coalesce(sum(original_amount_usd), 0)
  into v_credits_open_c, v_credits_open_u
  from public.credits
  where public.ve_date(created_at) = p_date;

  select
    count(*),
    coalesce(sum(amount_usd), 0)
  into v_credits_paid_c, v_credits_paid_u
  from public.credit_payments
  where public.ve_date(created_at) = p_date;

  select
    count(distinct s.id),
    coalesce(sum(si.line_total_usd), 0)
  into v_family_count, v_family_cost
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where public.ve_date(s.created_at) = p_date
    and s.is_internal = true
    and s.status = 'completada';

  return jsonb_build_object(
    'date',                  p_date,
    'sales_count',           coalesce(v_sales_count, 0),
    'revenue_usd',           coalesce(v_revenue, 0),
    'cogs_usd',              coalesce(v_cogs, 0),
    'profit_usd',            coalesce(v_profit, 0),
    'margin_pct',            case when coalesce(v_revenue, 0) > 0
                              then v_profit / v_revenue * 100 else 0 end,
    'voided_count',          coalesce(v_voided_count, 0),
    'voided_usd',            coalesce(v_voided_usd, 0),
    'by_payment',            coalesce(v_by_payment, '[]'::jsonb),
    'by_currency',           coalesce(v_by_currency, '[]'::jsonb),
    'credits_opened_count',  coalesce(v_credits_open_c, 0),
    'credits_opened_usd',    coalesce(v_credits_open_u, 0),
    'credits_paid_count',    coalesce(v_credits_paid_c, 0),
    'credits_paid_usd',      coalesce(v_credits_paid_u, 0),
    'family_count',          coalesce(v_family_count, 0),
    'family_cost_usd',       coalesce(v_family_cost, 0)
  );
end;
$$;

grant execute on function public.daily_summary(date) to authenticated;

-- ===========================================================================
-- 10) list_users_with_stats — stats por cajero en hora Caracas
-- ===========================================================================

create or replace function public.list_users_with_stats()
returns table (
  id              uuid,
  full_name       text,
  email           text,
  role            user_role,
  active          boolean,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  sales_today     bigint,
  revenue_today   numeric,
  sales_30d       bigint,
  revenue_30d     numeric,
  voided_30d      bigint
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_supervisor() then
    raise exception 'Sin permisos para listar usuarios';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.active,
    p.created_at,
    u.last_sign_in_at,
    coalesce(
      count(s.id) filter (
        where s.status = 'completada'
          and public.ve_date(s.created_at) = public.ve_today()
      ),
      0
    )::bigint,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and public.ve_date(s.created_at) = public.ve_today()
      ),
      0
    )::numeric,
    coalesce(
      count(s.id) filter (
        where s.status = 'completada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::numeric,
    coalesce(
      count(s.id) filter (
        where s.status = 'anulada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.sales s on s.cashier_id = p.id
  group by p.id, p.full_name, p.email, p.role, p.active, p.created_at, u.last_sign_in_at
  order by p.active desc, p.full_name asc;
end;
$$;

grant execute on function public.list_users_with_stats() to authenticated;

commit;
