-- =========================================================================
-- 008_customers_module.sql — Módulo completo de clientes
-- =========================================================================
-- Requisitos: 001-007 ya aplicadas (incluyendo 007_inventory_module.sql).
--
-- Contenido:
--   1. Patch de schema customers: customer_type, tags, birthday, updated_at
--   2. Vista v_customer_stats: agregados por cliente (ventas + créditos)
--   3. Vista v_customer_top_products: productos top por cliente
--   4. Vista v_customer_monthly_spending: gasto mensual últimos 12 meses
--   5. Vista v_customers_kpis: KPIs de la página de listado
--   6. RPC register_credit_payment: aplica pago a uno o varios créditos
--   7. RPC soft_delete_customer / reactivate_customer
--   8. Patch RLS para que supervisor también pueda editar clientes
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Schema patch sobre customers
-- ===========================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'customer_type') then
    create type customer_type as enum ('detal', 'mayorista', 'frecuente', 'eventual');
  end if;
end $$;

alter table public.customers
  add column if not exists customer_type customer_type not null default 'detal',
  add column if not exists tags          text[]        not null default '{}',
  add column if not exists birthday      date,
  add column if not exists updated_at    timestamptz   not null default now();

create index if not exists idx_customers_type   on public.customers(customer_type);
create index if not exists idx_customers_active on public.customers(active);
create index if not exists idx_customers_tags   on public.customers using gin(tags);

-- updated_at automático (idempotente)
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- 2) VIEW v_customer_stats — agregados por cliente
-- ===========================================================================
-- Por cada cliente: ventas (total, count, ticket promedio, primera/última),
-- créditos abiertos (saldo, count, vencidos), días desde última compra,
-- crédito disponible vs límite.
-- ===========================================================================

create or replace view public.v_customer_stats as
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
  where sa.customer_id = c.id and sa.status = 'completada'
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
) cr on true;

-- ===========================================================================
-- 3) VIEW v_customer_top_products — productos top por cliente (lifetime)
-- ===========================================================================

create or replace view public.v_customer_top_products as
select
  s.customer_id,
  si.product_id,
  si.product_name,
  sum(si.quantity)        as units_purchased,
  sum(si.line_total_usd)  as total_spent_usd,
  count(distinct s.id)    as times_bought,
  max(s.created_at)       as last_bought_at
from public.sales s
join public.sale_items si on si.sale_id = s.id
where s.status = 'completada' and s.customer_id is not null
group by s.customer_id, si.product_id, si.product_name;

-- ===========================================================================
-- 4) VIEW v_customer_monthly_spending — últimos 12 meses por cliente
-- ===========================================================================

create or replace view public.v_customer_monthly_spending as
select
  customer_id,
  date_trunc('month', created_at)::date as month,
  sum(total_usd)                        as total_usd,
  count(*)                              as sales_count
from public.sales
where status = 'completada'
  and customer_id is not null
  and created_at >= date_trunc('month', current_date) - interval '11 months'
group by customer_id, date_trunc('month', created_at);

-- ===========================================================================
-- 5) VIEW v_customers_kpis — encabezado del listado
-- ===========================================================================

create or replace view public.v_customers_kpis as
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
  (select count(*) from public.customers)                                 as total_customers,
  (select count(*) from public.customers where active = true)             as active_customers,
  (select count(*) from public.customers
    where active = true
      and created_at >= date_trunc('month', current_date))                as new_this_month,
  (select count(*) from credits_open)                                     as customers_with_credit,
  (select coalesce(sum(balance_usd), 0)         from credits_open)        as total_ar_balance,
  (select coalesce(sum(overdue_balance_usd), 0) from credits_open)        as overdue_ar_balance,
  (select count(*) from credits_open where overdue_balance_usd > 0)       as overdue_customers_count;

-- ===========================================================================
-- 6) RPC register_credit_payment
-- ===========================================================================
-- Aplica un pago a un crédito específico o auto-distribuye al más antiguo /
-- vencido primero (FIFO). El trigger tg_credit_payment_apply existente
-- actualiza paid_amount_usd y flipea el status a 'pagado' automáticamente
-- cuando el balance llega a 0.
-- ===========================================================================

create or replace function public.register_credit_payment(payload jsonb)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role          text;
  v_customer_id   uuid;
  v_credit_id     uuid;
  v_amount_usd    numeric(14,2);
  v_method        payment_method;
  v_paid_currency currency;
  v_paid_amount   numeric(14,2);
  v_rate_ves      numeric(14,4);
  v_rate_cop      numeric(14,4);
  v_notes         text;
  v_remaining     numeric(14,2);
  v_credit        record;
  v_apply         numeric(14,2);
  v_total_applied numeric(14,2) := 0;
  v_payment_ids   uuid[]        := array[]::uuid[];
  v_payment_id    uuid;
  v_split_paid    numeric(14,2);
begin
  -- Permisos
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'supervisor') then
    raise exception 'Solo admin o supervisor pueden registrar pagos de crédito';
  end if;

  -- Parseo
  v_customer_id   := nullif(payload->>'customer_id', '')::uuid;
  v_credit_id     := nullif(payload->>'credit_id', '')::uuid;
  v_amount_usd    := nullif(payload->>'amount_usd', '')::numeric;
  v_method        := coalesce((payload->>'payment_method')::payment_method, 'efectivo');
  v_paid_currency := coalesce((payload->>'paid_currency')::currency, 'USD');
  v_paid_amount   := coalesce(nullif(payload->>'paid_amount', '')::numeric, v_amount_usd);
  v_notes         := nullif(payload->>'notes', '');

  if v_customer_id is null then
    raise exception 'Cliente requerido';
  end if;
  if v_amount_usd is null or v_amount_usd <= 0 then
    raise exception 'Monto inválido (debe ser > 0)';
  end if;

  -- Snapshot de tasas vigentes para la fila de credit_payments
  select usd_ves_paralelo, usd_cop into v_rate_ves, v_rate_cop
  from public.exchange_rates
  order by rate_date desc
  limit 1;

  -- Caso A: crédito específico
  if v_credit_id is not null then
    select * into v_credit
    from public.credits
    where id = v_credit_id and customer_id = v_customer_id and status = 'abierto'
    for update;

    if not found then
      raise exception 'Crédito no encontrado, no pertenece al cliente o ya está pagado';
    end if;

    v_apply := least(v_amount_usd, v_credit.balance_usd);

    insert into public.credit_payments
      (credit_id, amount_usd, payment_method, paid_currency, paid_amount,
       rate_usd_ves, rate_usd_cop, registered_by, notes)
    values
      (v_credit_id, v_apply, v_method, v_paid_currency, v_paid_amount,
       v_rate_ves, v_rate_cop, auth.uid(), v_notes)
    returning id into v_payment_id;

    v_payment_ids   := array_append(v_payment_ids, v_payment_id);
    v_total_applied := v_apply;

  -- Caso B: auto-distribución FIFO (vencidos / más antiguos primero)
  else
    v_remaining := v_amount_usd;

    for v_credit in
      select * from public.credits
      where customer_id = v_customer_id and status = 'abierto'
      order by
        (due_date is null) asc,        -- los que tienen due_date definido primero
        due_date asc nulls last,
        created_at asc
      for update
    loop
      exit when v_remaining <= 0;

      v_apply      := least(v_remaining, v_credit.balance_usd);
      v_split_paid := round(v_paid_amount * v_apply / v_amount_usd, 2);

      insert into public.credit_payments
        (credit_id, amount_usd, payment_method, paid_currency, paid_amount,
         rate_usd_ves, rate_usd_cop, registered_by, notes)
      values
        (v_credit.id, v_apply, v_method, v_paid_currency, v_split_paid,
         v_rate_ves, v_rate_cop, auth.uid(), v_notes)
      returning id into v_payment_id;

      v_payment_ids   := array_append(v_payment_ids, v_payment_id);
      v_remaining     := v_remaining - v_apply;
      v_total_applied := v_total_applied + v_apply;
    end loop;

    if v_total_applied = 0 then
      raise exception 'El cliente no tiene créditos abiertos';
    end if;
  end if;

  -- Auditoría
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'register_credit_payment', 'customer', v_customer_id,
          jsonb_build_object(
            'amount_received_usd', v_amount_usd,
            'amount_applied_usd',  v_total_applied,
            'unallocated_usd',     greatest(v_amount_usd - v_total_applied, 0),
            'method',              v_method,
            'currency',            v_paid_currency,
            'paid_amount',         v_paid_amount,
            'payment_ids',         v_payment_ids));

  return json_build_object(
    'ok',                  true,
    'amount_applied_usd',  v_total_applied,
    'unallocated_usd',     greatest(v_amount_usd - v_total_applied, 0),
    'payment_count',       coalesce(array_length(v_payment_ids, 1), 0),
    'payment_ids',         v_payment_ids);
end;
$$;

grant execute on function public.register_credit_payment(jsonb) to authenticated;

-- ===========================================================================
-- 7) RPCs soft_delete_customer / reactivate_customer
-- ===========================================================================

create or replace function public.soft_delete_customer(p_customer_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role          text;
  v_open_balance  numeric(14,2);
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'supervisor') then
    raise exception 'Solo admin o supervisor pueden desactivar clientes';
  end if;

  select coalesce(sum(balance_usd), 0) into v_open_balance
  from public.credits
  where customer_id = p_customer_id and status = 'abierto';

  if v_open_balance > 0 then
    raise exception 'El cliente tiene $% pendientes en créditos. Salda primero.',
      to_char(v_open_balance, 'FM999G999G990D00');
  end if;

  update public.customers set active = false where id = p_customer_id;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'soft_delete_customer', 'customer', p_customer_id, '{}'::jsonb);

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.soft_delete_customer(uuid) to authenticated;

create or replace function public.reactivate_customer(p_customer_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'supervisor') then
    raise exception 'Solo admin o supervisor pueden reactivar clientes';
  end if;

  update public.customers set active = true where id = p_customer_id;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'reactivate_customer', 'customer', p_customer_id, '{}'::jsonb);

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.reactivate_customer(uuid) to authenticated;

-- ===========================================================================
-- 8) Patch RLS: supervisor también puede editar (no solo admin)
-- ===========================================================================

drop policy if exists "customers: update solo admin/supervisor" on public.customers;
drop policy if exists "customers: update admin/supervisor"      on public.customers;
create policy "customers: update admin/supervisor"
  on public.customers for update
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

-- ===========================================================================
-- 9) Grants para vistas
-- ===========================================================================

grant select on public.v_customer_stats            to authenticated;
grant select on public.v_customer_top_products     to authenticated;
grant select on public.v_customer_monthly_spending to authenticated;
grant select on public.v_customers_kpis            to authenticated;

commit;
