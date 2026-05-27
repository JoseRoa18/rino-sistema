-- =========================================================================
-- 012_daily_close.sql — Cierre de día (cierre Z)
-- =========================================================================
-- Requisitos: 001-011 aplicadas.
--
-- Contenido:
--   1. Tabla daily_closes — snapshot del día cerrado
--   2. Vista v_daily_summary — preview de cualquier fecha (sin guardar)
--   3. RPC register_daily_close(p_date, p_notes) — admin/supervisor
--   4. RPC reopen_daily_close(p_date) — admin only (corregir errores)
--   5. RLS / Grants
--
-- Filosofía: el cierre es un SNAPSHOT INFORMATIVO. No bloquea ventas
-- posteriores. Si una venta entra después del cierre con fecha del mismo
-- día, queda fuera del snapshot pero sí en sales (se ve en /ventas).
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Tabla daily_closes
-- ===========================================================================

create table if not exists public.daily_closes (
  id              uuid primary key default uuid_generate_v4(),
  close_date      date not null unique,
  closed_by       uuid references public.profiles(id),
  closed_at       timestamptz not null default now(),

  -- Ventas externas (excluye is_internal)
  sales_count     int not null default 0,
  revenue_usd     numeric(14,2) not null default 0,
  cogs_usd        numeric(14,2) not null default 0,
  profit_usd      numeric(14,2) not null default 0,

  -- Anuladas del día
  voided_count    int not null default 0,
  voided_usd      numeric(14,2) not null default 0,

  -- Distribución por método de pago [{method, count, total_usd}]
  by_payment      jsonb not null default '[]'::jsonb,

  -- Distribución por moneda recibida [{currency, count, total_received_native, total_received_usd}]
  by_currency     jsonb not null default '[]'::jsonb,

  -- Cuentas por cobrar del día
  credits_opened_count int not null default 0,
  credits_opened_usd   numeric(14,2) not null default 0,
  credits_paid_count   int not null default 0,
  credits_paid_usd     numeric(14,2) not null default 0,

  -- Consumo familiar (informativo, ya excluido de revenue)
  family_count    int not null default 0,
  family_cost_usd numeric(14,2) not null default 0,

  notes           text
);

create index if not exists idx_daily_closes_date on public.daily_closes(close_date desc);

-- ===========================================================================
-- 2) Vista v_daily_summary — calcula resumen al vuelo de cualquier fecha
-- ===========================================================================
-- Útil tanto para el preview antes de cerrar como para reportes históricos.
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
  -- Totales de ventas (externas, completadas)
  select
    count(*) filter (where status = 'completada'),
    coalesce(sum(total_usd) filter (where status = 'completada'), 0)
  into v_sales_count, v_revenue
  from public.sales
  where created_at::date = p_date
    and is_internal = false;

  select
    coalesce(sum(si.unit_cost_usd * si.quantity), 0),
    coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
  into v_cogs, v_profit
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.created_at::date = p_date
    and s.is_internal = false
    and s.status = 'completada';

  -- Anuladas
  select
    count(*),
    coalesce(sum(total_usd), 0)
  into v_voided_count, v_voided_usd
  from public.sales
  where created_at::date = p_date
    and is_internal = false
    and status = 'anulada';

  -- Por método de pago
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
    where created_at::date = p_date
      and is_internal = false
      and status = 'completada'
    group by payment_method
  ) q;

  -- Por moneda recibida
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
    where created_at::date = p_date
      and is_internal = false
      and status = 'completada'
    group by paid_currency
  ) q;

  -- Créditos abiertos en el día (ventas a crédito → entradas en credits)
  select
    count(*),
    coalesce(sum(original_amount_usd), 0)
  into v_credits_open_c, v_credits_open_u
  from public.credits
  where created_at::date = p_date;

  -- Abonos recibidos de créditos en el día
  select
    count(*),
    coalesce(sum(amount_usd), 0)
  into v_credits_paid_c, v_credits_paid_u
  from public.credit_payments
  where created_at::date = p_date;

  -- Consumo familiar
  select
    count(distinct s.id),
    coalesce(sum(si.line_total_usd), 0)
  into v_family_count, v_family_cost
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where s.created_at::date = p_date
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
-- 3) RPC register_daily_close — guarda el cierre
-- ===========================================================================

create or replace function public.register_daily_close(p_date date, p_notes text default null)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role    text;
  v_summary jsonb;
  v_id      uuid;
begin
  -- Permisos: admin o supervisor
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'supervisor') then
    raise exception 'Solo admin o supervisor pueden cerrar el día';
  end if;

  -- No permitir cerrar el mismo día dos veces
  if exists (select 1 from public.daily_closes where close_date = p_date) then
    raise exception 'El día % ya está cerrado', to_char(p_date, 'YYYY-MM-DD');
  end if;

  -- Calcular el snapshot
  v_summary := public.daily_summary(p_date)::jsonb;

  -- Insertar fila con el snapshot
  insert into public.daily_closes (
    close_date, closed_by, notes,
    sales_count, revenue_usd, cogs_usd, profit_usd,
    voided_count, voided_usd,
    by_payment, by_currency,
    credits_opened_count, credits_opened_usd,
    credits_paid_count, credits_paid_usd,
    family_count, family_cost_usd
  ) values (
    p_date, auth.uid(), nullif(trim(coalesce(p_notes, '')), ''),
    (v_summary->>'sales_count')::int,
    (v_summary->>'revenue_usd')::numeric,
    (v_summary->>'cogs_usd')::numeric,
    (v_summary->>'profit_usd')::numeric,
    (v_summary->>'voided_count')::int,
    (v_summary->>'voided_usd')::numeric,
    v_summary->'by_payment',
    v_summary->'by_currency',
    (v_summary->>'credits_opened_count')::int,
    (v_summary->>'credits_opened_usd')::numeric,
    (v_summary->>'credits_paid_count')::int,
    (v_summary->>'credits_paid_usd')::numeric,
    (v_summary->>'family_count')::int,
    (v_summary->>'family_cost_usd')::numeric
  )
  returning id into v_id;

  -- Auditoría
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'register_daily_close', 'daily_close', v_id, v_summary);

  return jsonb_build_object('ok', true, 'id', v_id, 'summary', v_summary);
end;
$$;

grant execute on function public.register_daily_close(date, text) to authenticated;

-- ===========================================================================
-- 4) RPC reopen_daily_close — admin only, revierte un cierre
-- ===========================================================================
-- Útil si se cerró antes de tiempo o se necesita corregir algo.
-- Borra la fila y queda registrado en audit_log.
-- ===========================================================================

create or replace function public.reopen_daily_close(p_date date)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
  v_id   uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role <> 'admin' then
    raise exception 'Solo admin puede reabrir un cierre';
  end if;

  select id into v_id from public.daily_closes where close_date = p_date;
  if v_id is null then
    raise exception 'No hay cierre registrado para %', to_char(p_date, 'YYYY-MM-DD');
  end if;

  delete from public.daily_closes where id = v_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'reopen_daily_close', 'daily_close', v_id,
          jsonb_build_object('date', p_date));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.reopen_daily_close(date) to authenticated;

-- ===========================================================================
-- 5) RLS
-- ===========================================================================

alter table public.daily_closes enable row level security;

drop policy if exists "daily_closes: lectura admin/supervisor" on public.daily_closes;
create policy "daily_closes: lectura admin/supervisor"
  on public.daily_closes for select
  using (public.is_admin_or_supervisor());

drop policy if exists "daily_closes: escritura via rpc" on public.daily_closes;
create policy "daily_closes: escritura via rpc"
  on public.daily_closes for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

commit;
