-- =========================================================================
-- 018_bugfixes_batch.sql — Lote de bugfixes detectados en auditoría
-- =========================================================================
-- Requisitos: 001-017 aplicadas.
--
-- Bugs corregidos:
--   1) profiles: falta policy DELETE → ni el admin podía borrar
--   2) credit_payments puede dejar balance negativo (overpago)
--   3) sales: faltan columnas change_amount_usd / change_amount_cop;
--      el POS las enviaba pero register_sale no las persistía → "vuelto"
--      siempre vacío en SaleDetailModal
--   4) register_sale: ahora persiste change_amount_usd/cop
--   5) daily_summary: contaba TODOS los créditos y abonos, sin filtrar
--      los provenientes de ventas internas (Familia)
--   6) v_customers_kpis: total_ar_balance incluía al cliente Familia
--      si llegara a tener crédito
--   7) list_users_with_stats: revenue_30d/sales_30d/today incluían
--      ventas internas (Familia), inflando stats de cajeros
--   8) family_customer_id: deduplicación si por error hubiera más de
--      un cliente marcado is_internal=true
-- =========================================================================

begin;

-- ===========================================================================
-- 1) profiles: agregar policy DELETE para admin
-- ===========================================================================

drop policy if exists "profiles: solo admin elimina" on public.profiles;
create policy "profiles: solo admin elimina"
  on public.profiles for delete
  using (public.is_admin());

-- ===========================================================================
-- 2) credit_payments: bloquear overpago (no permite balance negativo)
-- ===========================================================================
-- Antes del INSERT, validamos que paid_amount_usd + new.amount_usd no
-- exceda original_amount_usd del crédito.

create or replace function public.tg_credit_payment_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original numeric(14,2);
  v_paid     numeric(14,2);
begin
  select original_amount_usd, paid_amount_usd
    into v_original, v_paid
  from public.credits
  where id = new.credit_id
  for update;

  if not found then
    raise exception 'Crédito no encontrado';
  end if;

  if new.amount_usd <= 0 then
    raise exception 'El monto del abono debe ser mayor que 0';
  end if;

  if (v_paid + new.amount_usd) > v_original + 0.01 then
    raise exception 'El abono ($%) excede el saldo pendiente del crédito ($%)',
      new.amount_usd, (v_original - v_paid);
  end if;

  return new;
end;
$$;

drop trigger if exists credit_payment_validate on public.credit_payments;
create trigger credit_payment_validate
  before insert on public.credit_payments
  for each row execute function public.tg_credit_payment_validate();

-- ===========================================================================
-- 3) sales: columnas para persistir el vuelto entregado al cliente
-- ===========================================================================

alter table public.sales
  add column if not exists change_amount_usd numeric(14,2) not null default 0,
  add column if not exists change_amount_cop numeric(14,2) not null default 0;

-- ===========================================================================
-- 4) register_sale: persistir change_amount_usd/cop del payload
-- ===========================================================================

create or replace function public.register_sale(payload jsonb)
returns uuid
language plpgsql security definer as $$
declare
  v_sale_id            uuid;
  v_session_id         uuid;
  v_item               jsonb;
  v_rate_ves           numeric(14,4);
  v_rate_cop           numeric(14,4);
  v_customer_id        uuid;
  v_payment_method     payment_method;
  v_paid_currency      currency;
  v_variant_id         uuid;
  v_variant_name       text;
  v_variant_base_qty   numeric(14,4);
begin
  select usd_ves_paralelo, usd_cop into v_rate_ves, v_rate_cop
  from public.exchange_rates
  order by rate_date desc limit 1;

  select id into v_session_id
  from public.cash_sessions
  where cashier_id = auth.uid() and closed_at is null
  order by opened_at desc limit 1;

  v_customer_id    := nullif(payload->>'customer_id', '')::uuid;
  v_payment_method := coalesce((payload->>'payment_method')::payment_method, 'efectivo');
  v_paid_currency  := coalesce((payload->>'paid_currency')::currency, 'USD');

  insert into public.sales (
    cashier_id, cash_session_id, customer_id,
    payment_method, paid_currency, paid_amount,
    change_amount_usd, change_amount_cop,
    rate_usd_ves, rate_usd_cop, notes
  ) values (
    auth.uid(), v_session_id, v_customer_id,
    v_payment_method, v_paid_currency,
    coalesce((payload->>'paid_amount')::numeric, 0),
    coalesce((payload->>'change_amount_usd')::numeric, 0),
    coalesce((payload->>'change_amount_cop')::numeric, 0),
    v_rate_ves, v_rate_cop,
    payload->>'notes'
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_variant_id       := nullif(v_item->>'variant_id', '')::uuid;
    v_variant_name     := null;
    v_variant_base_qty := null;

    if v_variant_id is not null then
      select name, base_quantity
        into v_variant_name, v_variant_base_qty
      from public.product_variants
      where id = v_variant_id;
    end if;

    insert into public.sale_items (
      sale_id, product_id, product_name, quantity, unit_price_usd, line_total_usd,
      variant_id, variant_name_snapshot, base_qty_per_unit_snapshot
    ) values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_usd')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'unit_price_usd')::numeric,
      v_variant_id, v_variant_name, v_variant_base_qty
    );
  end loop;

  if v_payment_method = 'credito' and v_customer_id is not null then
    insert into public.credits (customer_id, sale_id, original_amount_usd, due_date, notes)
    select v_customer_id, v_sale_id, total_usd,
           nullif(payload->>'due_date', '')::date,
           'Venta a crédito #' || invoice_number
    from public.sales where id = v_sale_id;
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'create_sale', 'sale', v_sale_id, payload);

  return v_sale_id;
end;
$$;

grant execute on function public.register_sale(jsonb) to authenticated;

-- ===========================================================================
-- 5) daily_summary: filtrar créditos y abonos por is_internal=false
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

  -- Créditos abiertos en el día: solo de ventas EXTERNAS
  select
    count(*),
    coalesce(sum(c.original_amount_usd), 0)
  into v_credits_open_c, v_credits_open_u
  from public.credits c
  left join public.sales s on s.id = c.sale_id
  where public.ve_date(c.created_at) = p_date
    and (s.id is null or s.is_internal = false);

  -- Abonos del día: solo de créditos de ventas EXTERNAS
  select
    count(*),
    coalesce(sum(cp.amount_usd), 0)
  into v_credits_paid_c, v_credits_paid_u
  from public.credit_payments cp
  join public.credits c on c.id = cp.credit_id
  left join public.sales s on s.id = c.sale_id
  where public.ve_date(cp.created_at) = p_date
    and (s.id is null or s.is_internal = false);

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
-- 6) v_customers_kpis: excluir cliente Familia del cómputo de cartera
-- ===========================================================================

create or replace view public.v_customers_kpis as
with credits_open as (
  select
    cr.customer_id,
    sum(cr.balance_usd)                                                     as balance_usd,
    sum(case when cr.due_date < public.ve_today() then cr.balance_usd else 0 end) as overdue_balance_usd
  from public.credits cr
  join public.customers cu on cu.id = cr.customer_id
  where cr.status = 'abierto'
    and cu.is_internal = false
  group by cr.customer_id
)
select
  (select count(*) from public.customers where is_internal = false)                  as total_customers,
  (select count(*) from public.customers where is_internal = false and active = true) as active_customers,
  (select count(*) from public.customers
    where is_internal = false
      and active = true
      and created_at >= date_trunc('month', (now() at time zone 'America/Caracas')))  as new_this_month,
  (select count(*) from credits_open)                                                 as customers_with_credit,
  (select coalesce(sum(balance_usd), 0)         from credits_open)                    as total_ar_balance,
  (select coalesce(sum(overdue_balance_usd), 0) from credits_open)                    as overdue_ar_balance,
  (select count(*) from credits_open where overdue_balance_usd > 0)                   as overdue_customers_count;

-- ===========================================================================
-- 7) list_users_with_stats: excluir ventas internas (Familia)
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
  if not public.is_admin() then
    raise exception 'Sólo el administrador puede ver la lista de usuarios';
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
          and s.is_internal = false
          and public.ve_date(s.created_at) = public.ve_today()
      ),
      0
    )::bigint,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and s.is_internal = false
          and public.ve_date(s.created_at) = public.ve_today()
      ),
      0
    )::numeric,
    coalesce(
      count(s.id) filter (
        where s.status = 'completada'
          and s.is_internal = false
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and s.is_internal = false
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::numeric,
    coalesce(
      count(s.id) filter (
        where s.status = 'anulada'
          and s.is_internal = false
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

-- ===========================================================================
-- 8) family_customer_id: garantizar un solo cliente Familia
-- ===========================================================================
-- Si por error existieran múltiples customers con is_internal=true, el
-- POS sigue usando el más antiguo pero el resto generaría ventas
-- "internas" perdidas para el módulo Familia. Forzamos índice único.

do $$
begin
  -- Verificar que no haya duplicados antes de crear el índice (si los hay,
  -- se desactivan todos menos el más antiguo)
  if exists (
    select 1 from public.customers
    where is_internal = true
    group by 1
    having count(*) > 1
  ) then
    update public.customers
    set active = false
    where is_internal = true
      and id <> (
        select id from public.customers
        where is_internal = true
        order by created_at asc
        limit 1
      );
  end if;
end $$;

create unique index if not exists ux_customers_one_internal
  on public.customers (is_internal)
  where is_internal = true;

commit;
