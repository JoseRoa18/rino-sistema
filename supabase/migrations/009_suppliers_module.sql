-- =========================================================================
-- 009_suppliers_module.sql — Módulo completo de proveedores + cuentas por pagar
-- =========================================================================
-- Requisitos: 001-008 aplicadas.
--
-- Contenido:
--   1. Patch de schema suppliers: tags, updated_at, índices
--   2. Tabla supplier_credits  (cuentas por pagar — lo que le debemos al proveedor)
--   3. Tabla supplier_credit_payments (abonos al proveedor)
--   4. Trigger tg_supplier_credit_payment_apply (saldo + status auto)
--   5. Vista v_supplier_stats: agregados por proveedor
--   6. Vista v_supplier_top_products: productos más comprados al proveedor
--   7. Vista v_supplier_monthly_purchases: compras mensuales últimos 12 meses
--   8. Vista v_suppliers_kpis: KPIs del listado
--   9. RPC register_supplier_payment: aplica pago FIFO
--  10. RPC soft_delete_supplier / reactivate_supplier
--  11. RLS para suppliers, supplier_credits, supplier_credit_payments
--  12. Grants para vistas
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Schema patch sobre suppliers
-- ===========================================================================

alter table public.suppliers
  add column if not exists tags       text[]      not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_suppliers_active on public.suppliers(active);
create index if not exists idx_suppliers_name   on public.suppliers(name);
create index if not exists idx_suppliers_tags   on public.suppliers using gin(tags);

-- updated_at automático (idempotente)
drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- 2) Tabla supplier_credits — cuentas por pagar
-- ===========================================================================
-- Lo que el negocio le debe al proveedor. Puede ligarse opcionalmente a una
-- compra (purchase_id) o crearse manualmente (deuda histórica, anticipo, etc).
-- ===========================================================================

create table if not exists public.supplier_credits (
  id                   uuid primary key default uuid_generate_v4(),
  supplier_id          uuid not null references public.suppliers(id) on delete restrict,
  purchase_id          uuid references public.purchases(id) on delete set null,
  original_amount_usd  numeric(14,2) not null check (original_amount_usd > 0),
  paid_amount_usd      numeric(14,2) not null default 0,
  balance_usd          numeric(14,2) generated always as (original_amount_usd - paid_amount_usd) stored,
  due_date             date,
  status               text not null default 'abierto', -- abierto / pagado / vencido
  notes                text,
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now()
);

create index if not exists idx_supplier_credits_supplier on public.supplier_credits(supplier_id);
create index if not exists idx_supplier_credits_status   on public.supplier_credits(status);
create index if not exists idx_supplier_credits_due_date on public.supplier_credits(due_date)
  where status = 'abierto';

-- ===========================================================================
-- 3) Tabla supplier_credit_payments — abonos
-- ===========================================================================

create table if not exists public.supplier_credit_payments (
  id              uuid primary key default uuid_generate_v4(),
  credit_id       uuid not null references public.supplier_credits(id) on delete cascade,
  amount_usd      numeric(14,2) not null check (amount_usd > 0),
  payment_method  payment_method not null default 'efectivo',
  paid_currency   currency       not null default 'USD',
  paid_amount     numeric(14,2)  not null,
  rate_usd_ves    numeric(14,4),
  rate_usd_cop    numeric(14,4),
  registered_by   uuid references public.profiles(id),
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_supplier_credit_payments_credit on public.supplier_credit_payments(credit_id);

-- ===========================================================================
-- 4) Trigger: aplicar abono al saldo del crédito al proveedor
-- ===========================================================================

create or replace function public.tg_supplier_credit_payment_apply()
returns trigger language plpgsql security definer as $$
declare
  v_balance numeric(14,2);
begin
  update public.supplier_credits
  set paid_amount_usd = paid_amount_usd + new.amount_usd
  where id = new.credit_id
  returning balance_usd into v_balance;

  if v_balance <= 0 then
    update public.supplier_credits set status = 'pagado' where id = new.credit_id;
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_credit_payment_apply on public.supplier_credit_payments;
create trigger supplier_credit_payment_apply
  after insert on public.supplier_credit_payments
  for each row execute function public.tg_supplier_credit_payment_apply();

-- ===========================================================================
-- 5) VIEW v_supplier_stats — agregados por proveedor
-- ===========================================================================

create or replace view public.v_supplier_stats as
select
  s.id              as supplier_id,
  s.name,
  s.contact_name,
  s.phone,
  s.email,
  s.invoicing_currency,
  s.payment_terms,
  s.notes,
  s.active,
  s.tags,
  s.created_at,
  s.updated_at,

  coalesce(p.total_purchased_usd, 0)  as total_purchased_usd,
  coalesce(p.purchases_count, 0)      as purchases_count,
  coalesce(p.avg_purchase_usd, 0)     as avg_purchase_usd,
  p.first_purchase_at,
  p.last_purchase_at,

  coalesce(cr.ap_balance_usd, 0)      as ap_balance_usd,
  coalesce(cr.open_credits_count, 0)  as open_credits_count,
  coalesce(cr.overdue_count, 0)       as overdue_count,
  coalesce(cr.overdue_balance_usd, 0) as overdue_balance_usd,

  case
    when p.last_purchase_at is null then null
    else extract(day from (now() - p.last_purchase_at))::int
  end                                  as days_since_last_purchase

from public.suppliers s

left join lateral (
  select
    sum(pu.total_usd)  as total_purchased_usd,
    count(*)           as purchases_count,
    avg(pu.total_usd)  as avg_purchase_usd,
    min(pu.created_at) as first_purchase_at,
    max(pu.created_at) as last_purchase_at
  from public.purchases pu
  where pu.supplier_id = s.id
) p on true

left join lateral (
  select
    sum(sc.balance_usd) as ap_balance_usd,
    count(*)            as open_credits_count,
    count(*) filter (where sc.due_date is not null and sc.due_date < current_date)
                        as overdue_count,
    sum(sc.balance_usd) filter (where sc.due_date is not null and sc.due_date < current_date)
                        as overdue_balance_usd
  from public.supplier_credits sc
  where sc.supplier_id = s.id and sc.status = 'abierto'
) cr on true;

-- ===========================================================================
-- 6) VIEW v_supplier_top_products — productos más comprados al proveedor (lifetime)
-- ===========================================================================

create or replace view public.v_supplier_top_products as
select
  pu.supplier_id,
  pi.product_id,
  pr.name              as product_name,
  pr.sku               as product_sku,
  sum(pi.quantity)     as units_purchased,
  sum(pi.line_total_usd) as total_spent_usd,
  count(distinct pu.id)  as times_bought,
  avg(pi.unit_cost_usd)  as avg_unit_cost_usd,
  max(pu.created_at)     as last_bought_at
from public.purchases pu
join public.purchase_items pi on pi.purchase_id = pu.id
join public.products pr on pr.id = pi.product_id
where pu.supplier_id is not null
group by pu.supplier_id, pi.product_id, pr.name, pr.sku;

-- ===========================================================================
-- 7) VIEW v_supplier_monthly_purchases — últimos 12 meses por proveedor
-- ===========================================================================

create or replace view public.v_supplier_monthly_purchases as
select
  supplier_id,
  date_trunc('month', created_at)::date as month,
  sum(total_usd)                        as total_usd,
  count(*)                              as purchases_count
from public.purchases
where supplier_id is not null
  and created_at >= date_trunc('month', current_date) - interval '11 months'
group by supplier_id, date_trunc('month', created_at);

-- ===========================================================================
-- 8) VIEW v_suppliers_kpis — encabezado del listado
-- ===========================================================================

create or replace view public.v_suppliers_kpis as
with credits_open as (
  select
    supplier_id,
    sum(balance_usd)                                                     as balance_usd,
    sum(case when due_date < current_date then balance_usd else 0 end)   as overdue_balance_usd
  from public.supplier_credits
  where status = 'abierto'
  group by supplier_id
)
select
  (select count(*) from public.suppliers)                                 as total_suppliers,
  (select count(*) from public.suppliers where active = true)             as active_suppliers,
  (select count(*) from public.suppliers
    where active = true
      and created_at >= date_trunc('month', current_date))                as new_this_month,
  (select count(*) from credits_open)                                     as suppliers_with_credit,
  (select coalesce(sum(balance_usd), 0)         from credits_open)        as total_ap_balance,
  (select coalesce(sum(overdue_balance_usd), 0) from credits_open)        as overdue_ap_balance,
  (select count(*) from credits_open where overdue_balance_usd > 0)       as overdue_suppliers_count;

-- ===========================================================================
-- 9) RPC register_supplier_payment — aplica pago FIFO o a un crédito específico
-- ===========================================================================

create or replace function public.register_supplier_payment(payload jsonb)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role          text;
  v_supplier_id   uuid;
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
    raise exception 'Solo admin o supervisor pueden registrar pagos a proveedores';
  end if;

  -- Parseo
  v_supplier_id   := nullif(payload->>'supplier_id', '')::uuid;
  v_credit_id     := nullif(payload->>'credit_id', '')::uuid;
  v_amount_usd    := nullif(payload->>'amount_usd', '')::numeric;
  v_method        := coalesce((payload->>'payment_method')::payment_method, 'efectivo');
  v_paid_currency := coalesce((payload->>'paid_currency')::currency, 'USD');
  v_paid_amount   := coalesce(nullif(payload->>'paid_amount', '')::numeric, v_amount_usd);
  v_notes         := nullif(payload->>'notes', '');

  if v_supplier_id is null then
    raise exception 'Proveedor requerido';
  end if;
  if v_amount_usd is null or v_amount_usd <= 0 then
    raise exception 'Monto inválido (debe ser > 0)';
  end if;

  -- Snapshot de tasas vigentes
  select usd_ves_paralelo, usd_cop into v_rate_ves, v_rate_cop
  from public.exchange_rates
  order by rate_date desc
  limit 1;

  -- Caso A: crédito específico
  if v_credit_id is not null then
    select * into v_credit
    from public.supplier_credits
    where id = v_credit_id and supplier_id = v_supplier_id and status = 'abierto'
    for update;

    if not found then
      raise exception 'Crédito no encontrado, no pertenece al proveedor o ya está pagado';
    end if;

    v_apply := least(v_amount_usd, v_credit.balance_usd);

    insert into public.supplier_credit_payments
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
      select * from public.supplier_credits
      where supplier_id = v_supplier_id and status = 'abierto'
      order by
        (due_date is null) asc,
        due_date asc nulls last,
        created_at asc
      for update
    loop
      exit when v_remaining <= 0;

      v_apply      := least(v_remaining, v_credit.balance_usd);
      v_split_paid := round(v_paid_amount * v_apply / v_amount_usd, 2);

      insert into public.supplier_credit_payments
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
      raise exception 'El proveedor no tiene créditos abiertos';
    end if;
  end if;

  -- Auditoría
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'register_supplier_payment', 'supplier', v_supplier_id,
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

grant execute on function public.register_supplier_payment(jsonb) to authenticated;

-- ===========================================================================
-- 10) RPCs soft_delete_supplier / reactivate_supplier
-- ===========================================================================

create or replace function public.soft_delete_supplier(p_supplier_id uuid)
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
    raise exception 'Solo admin o supervisor pueden desactivar proveedores';
  end if;

  select coalesce(sum(balance_usd), 0) into v_open_balance
  from public.supplier_credits
  where supplier_id = p_supplier_id and status = 'abierto';

  if v_open_balance > 0 then
    raise exception 'El proveedor tiene $% pendientes por pagar. Salda primero.',
      to_char(v_open_balance, 'FM999G999G990D00');
  end if;

  update public.suppliers set active = false where id = p_supplier_id;
  if not found then
    raise exception 'Proveedor no encontrado';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'soft_delete_supplier', 'supplier', p_supplier_id, '{}'::jsonb);

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.soft_delete_supplier(uuid) to authenticated;

create or replace function public.reactivate_supplier(p_supplier_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'supervisor') then
    raise exception 'Solo admin o supervisor pueden reactivar proveedores';
  end if;

  update public.suppliers set active = true where id = p_supplier_id;
  if not found then
    raise exception 'Proveedor no encontrado';
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'reactivate_supplier', 'supplier', p_supplier_id, '{}'::jsonb);

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.reactivate_supplier(uuid) to authenticated;

-- ===========================================================================
-- 11) RLS — habilitar y políticas para supplier_credits y supplier_credit_payments
-- ===========================================================================
-- La política original "suppliers: solo admin" se amplía a admin/supervisor
-- para mantener simetría con clientes (admin y supervisor gestionan operativa).
-- ===========================================================================

drop policy if exists "suppliers: solo admin"                on public.suppliers;
drop policy if exists "suppliers: lectura admin/supervisor"  on public.suppliers;
drop policy if exists "suppliers: escritura admin/supervisor" on public.suppliers;

create policy "suppliers: lectura admin/supervisor"
  on public.suppliers for select
  using (public.is_admin_or_supervisor());

create policy "suppliers: escritura admin/supervisor"
  on public.suppliers for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

alter table public.supplier_credits         enable row level security;
alter table public.supplier_credit_payments enable row level security;

drop policy if exists "supplier_credits: admin/supervisor" on public.supplier_credits;
create policy "supplier_credits: admin/supervisor"
  on public.supplier_credits for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

drop policy if exists "supplier_credit_payments: admin/supervisor" on public.supplier_credit_payments;
create policy "supplier_credit_payments: admin/supervisor"
  on public.supplier_credit_payments for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

-- ===========================================================================
-- 12) Grants para vistas
-- ===========================================================================

grant select on public.v_supplier_stats              to authenticated;
grant select on public.v_supplier_top_products       to authenticated;
grant select on public.v_supplier_monthly_purchases  to authenticated;
grant select on public.v_suppliers_kpis              to authenticated;

commit;
