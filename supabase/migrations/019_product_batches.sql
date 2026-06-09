-- =========================================================================
-- 019_product_batches.sql — Control de fechas de caducidad por lote
-- =========================================================================
-- Requisitos: 001-018 aplicadas.
--
-- Diseño:
--   - products.tracks_expiry boolean → activa el control por producto
--   - product_batches: cada compra de un producto con tracks_expiry crea
--     un lote con (cantidad, fecha de vencimiento, ref a la compra)
--   - Al vender, el trigger descuenta FIFO del lote más próximo a vencer
--   - sale_items.batches_consumed snapshot jsonb [{batch_id, qty}]
--     para trazabilidad y futura anulación a nivel de lote
--   - purchase_items.expires_at / batch_code opcional para captura
--   - Vista v_batches_alerts: lotes vencidos / por vencer
--
-- Notas de v1:
--   - Anular venta (void_sale) reintegra al stock total del producto
--     pero NO reabre los lotes consumidos (se deja para v2).
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Toggle por producto
-- ===========================================================================

alter table public.products
  add column if not exists tracks_expiry boolean not null default false;

-- ===========================================================================
-- 2) Columnas opcionales en purchase_items para capturar el lote
-- ===========================================================================

alter table public.purchase_items
  add column if not exists expires_at date,
  add column if not exists batch_code text;

-- ===========================================================================
-- 3) Tabla product_batches
-- ===========================================================================

create table if not exists public.product_batches (
  id                uuid primary key default uuid_generate_v4(),
  product_id        uuid not null references public.products(id) on delete cascade,
  batch_code        text,
  quantity          numeric(14,3) not null default 0 check (quantity >= 0),
  initial_quantity  numeric(14,3) not null check (initial_quantity > 0),
  expires_at        date,
  received_at       timestamptz not null default now(),
  purchase_item_id  uuid references public.purchase_items(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ix_batches_product_active
  on public.product_batches(product_id) where quantity > 0;
create index if not exists ix_batches_expires
  on public.product_batches(expires_at) where quantity > 0;

drop trigger if exists product_batches_updated_at on public.product_batches;
create trigger product_batches_updated_at
  before update on public.product_batches
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- 4) Snapshot de lotes consumidos en cada sale_item
-- ===========================================================================

alter table public.sale_items
  add column if not exists batches_consumed jsonb;

-- ===========================================================================
-- 5) RLS
-- ===========================================================================

alter table public.product_batches enable row level security;

drop policy if exists "batches: lectura autenticados" on public.product_batches;
create policy "batches: lectura autenticados"
  on public.product_batches for select
  using (auth.uid() is not null);

drop policy if exists "batches: escritura admin/supervisor" on public.product_batches;
create policy "batches: escritura admin/supervisor"
  on public.product_batches for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

-- ===========================================================================
-- 6) RPC consume_batches_fifo
-- ===========================================================================
-- Descuenta `p_quantity` del producto usando los lotes más próximos a vencer
-- primero (los sin fecha quedan al final). Devuelve [{batch_id, qty}] para
-- snapshot. Si la cantidad solicitada excede el stock por lotes, descuenta
-- todo lo disponible y devuelve lo consumido (el caller decide si tolera).

create or replace function public.consume_batches_fifo(
  p_product_id uuid,
  p_quantity   numeric
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_remaining numeric := p_quantity;
  v_batch     record;
  v_consumed  jsonb := '[]'::jsonb;
  v_take      numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    return v_consumed;
  end if;

  for v_batch in
    select id, quantity, expires_at
    from public.product_batches
    where product_id = p_product_id and quantity > 0
    order by
      case when expires_at is null then 1 else 0 end,
      expires_at asc,
      received_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_batch.quantity, v_remaining);

    update public.product_batches
      set quantity = quantity - v_take
      where id = v_batch.id;

    v_consumed := v_consumed
      || jsonb_build_array(
           jsonb_build_object('batch_id', v_batch.id, 'qty', v_take)
         );
    v_remaining := v_remaining - v_take;
  end loop;

  return v_consumed;
end;
$$;

-- ===========================================================================
-- 7) tg_purchase_item_apply — crea un batch si el producto rastrea expiración
-- ===========================================================================

create or replace function public.tg_purchase_item_apply()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock  numeric(14,3);
  v_current_cost   numeric(14,4);
  v_new_stock      numeric(14,3);
  v_new_cost       numeric(14,4);
  v_target_margin  numeric(5,2);
  v_rate_ves       numeric(14,4);
  v_rate_cop       numeric(14,4);
  v_tracks_expiry  boolean;
begin
  select stock, cost_avg, target_margin, coalesce(tracks_expiry, false)
    into v_current_stock, v_current_cost, v_target_margin, v_tracks_expiry
  from public.products
  where id = new.product_id
  for update;

  v_new_stock := coalesce(v_current_stock, 0) + new.quantity;

  if v_new_stock > 0 then
    v_new_cost := ((coalesce(v_current_stock, 0) * coalesce(v_current_cost, 0))
                   + (new.quantity * new.unit_cost_usd))
                  / v_new_stock;
  else
    v_new_cost := new.unit_cost_usd;
  end if;

  select rate_usd_ves, rate_usd_cop
    into v_rate_ves, v_rate_cop
  from public.purchases
  where id = new.purchase_id;

  update public.products
  set
    stock = v_new_stock,
    cost_avg = v_new_cost,
    price_usd = round(v_new_cost * (1 + coalesce(v_target_margin, 30) / 100), 2),
    price_ves = case
                  when v_rate_ves is not null
                  then round(v_new_cost * (1 + coalesce(v_target_margin, 30) / 100) * v_rate_ves, 2)
                  else price_ves
                end,
    price_cop = case
                  when v_rate_cop is not null
                  then round(v_new_cost * (1 + coalesce(v_target_margin, 30) / 100) * v_rate_cop, 2)
                  else price_cop
                end
  where id = new.product_id;

  -- Si el producto rastrea expiración, crear el lote
  if v_tracks_expiry then
    insert into public.product_batches (
      product_id, batch_code, quantity, initial_quantity,
      expires_at, received_at, purchase_item_id
    ) values (
      new.product_id, new.batch_code, new.quantity, new.quantity,
      new.expires_at, now(), new.id
    );
  end if;

  insert into public.inventory_movements
    (product_id, movement_type, quantity, balance_after, unit_cost_usd,
     reference_type, reference_id, created_by, notes)
  values
    (new.product_id, 'entrada', new.quantity, v_new_stock, new.unit_cost_usd,
     'purchase', new.purchase_id, auth.uid(),
     format('Compra. Costo previo: %s, costo nuevo: %s%s',
            v_current_cost, v_new_cost,
            case when v_tracks_expiry and new.expires_at is not null
                 then format(' · Vence %s', to_char(new.expires_at, 'YYYY-MM-DD'))
                 else '' end));

  return new;
end;
$$;

-- ===========================================================================
-- 8) tg_sale_item_apply — descuenta FIFO de batches si tracks_expiry
-- ===========================================================================

create or replace function public.tg_sale_item_apply()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock numeric(14,3);
  v_current_cost  numeric(14,4);
  v_new_stock     numeric(14,3);
  v_multiplier    numeric(14,4);
  v_decrement     numeric(14,4);
  v_tracks_expiry boolean;
  v_batches       jsonb;
begin
  select stock, cost_avg, coalesce(tracks_expiry, false)
    into v_current_stock, v_current_cost, v_tracks_expiry
  from public.products
  where id = new.product_id
  for update;

  if new.unit_cost_usd is null or new.unit_cost_usd = 0 then
    new.unit_cost_usd := coalesce(v_current_cost, 0);
  end if;

  v_multiplier := coalesce(new.base_qty_per_unit_snapshot, 1);
  v_decrement  := new.quantity * v_multiplier;

  v_new_stock := coalesce(v_current_stock, 0) - v_decrement;

  update public.products
  set stock = v_new_stock
  where id = new.product_id;

  -- Si el producto rastrea expiración, descontar FIFO de los batches
  if v_tracks_expiry then
    v_batches := public.consume_batches_fifo(new.product_id, v_decrement);
    new.batches_consumed := v_batches;
  end if;

  insert into public.inventory_movements
    (product_id, movement_type, quantity, balance_after, unit_cost_usd,
     reference_type, reference_id, created_by, notes)
  values
    (new.product_id, 'venta', -v_decrement, v_new_stock, new.unit_cost_usd,
     'sale', new.sale_id, auth.uid(),
     case
       when new.variant_id is not null then
         'Presentación: ' || coalesce(new.variant_name_snapshot, '?') || ' × ' || new.quantity
       else null
     end);

  return new;
end;
$$;

-- ===========================================================================
-- 9) Vista v_batches_alerts — lotes vencidos o por vencer
-- ===========================================================================

create or replace view public.v_batches_alerts as
select
  b.id                                                       as batch_id,
  b.product_id,
  p.name                                                     as product_name,
  p.sku,
  p.unit,
  c.name                                                     as category_name,
  b.batch_code,
  b.quantity,
  b.initial_quantity,
  b.expires_at,
  b.received_at,
  case
    when b.expires_at is null then null
    when b.expires_at < public.ve_today() then 'vencido'
    when b.expires_at <= public.ve_today() + 3 then 'critico'
    when b.expires_at <= public.ve_today() + 7 then 'urgente'
    when b.expires_at <= public.ve_today() + 30 then 'proximo'
    else 'ok'
  end                                                        as status,
  case
    when b.expires_at is null then null
    else b.expires_at - public.ve_today()
  end                                                        as days_to_expire,
  b.quantity * p.cost_avg                                    as value_at_risk_usd
from public.product_batches b
join public.products p   on p.id = b.product_id
left join public.categories c on c.id = p.category_id
where b.quantity > 0
  and p.active = true
order by
  case when b.expires_at is null then 1 else 0 end,
  b.expires_at asc;

grant select on public.v_batches_alerts to authenticated;

-- ===========================================================================
-- 10) Vista v_products_with_expiry — producto + lote más próximo a vencer
-- ===========================================================================
-- Útil para badges en POS e inventario sin pegarse a v_batches_alerts en cada
-- fila del listado.

create or replace view public.v_products_expiry_status as
select
  p.id                                                       as product_id,
  p.name,
  min(b.expires_at) filter (where b.quantity > 0)            as next_expires_at,
  count(*) filter (
    where b.quantity > 0
      and b.expires_at is not null
      and b.expires_at < public.ve_today()
  )                                                          as batches_expired,
  count(*) filter (
    where b.quantity > 0
      and b.expires_at is not null
      and b.expires_at >= public.ve_today()
      and b.expires_at <= public.ve_today() + 7
  )                                                          as batches_critical,
  count(*) filter (
    where b.quantity > 0
      and b.expires_at is not null
      and b.expires_at >= public.ve_today()
      and b.expires_at <= public.ve_today() + 30
  )                                                          as batches_warning,
  sum(b.quantity) filter (where b.quantity > 0)              as total_batched_qty
from public.products p
left join public.product_batches b on b.product_id = p.id
where p.tracks_expiry = true
group by p.id, p.name;

grant select on public.v_products_expiry_status to authenticated;

-- ===========================================================================
-- 11) v_dashboard_kpis — añadir KPI batches_expiring_count
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
   where stock > 0
     and stock <= min_stock
     and active = true) as low_stock_count,

  (select coalesce(sum(balance_usd), 0)
   from public.credits where status = 'abierto') as pending_credits_usd,

  -- NUEVO: lotes con vencimiento dentro de los próximos 7 días o ya vencidos
  (select count(*) from public.product_batches b
   join public.products p on p.id = b.product_id
   where b.quantity > 0
     and p.active = true
     and b.expires_at is not null
     and b.expires_at <= public.ve_today() + 7) as expiring_batches_count,

  -- Valor en USD comprometido en lotes por vencer / vencidos
  (select coalesce(sum(b.quantity * p.cost_avg), 0)
   from public.product_batches b
   join public.products p on p.id = b.product_id
   where b.quantity > 0
     and p.active = true
     and b.expires_at is not null
     and b.expires_at <= public.ve_today() + 7) as expiring_value_usd;

-- ===========================================================================
-- 12) register_purchase — acepta expires_at y batch_code por item
-- ===========================================================================
-- La RPC original estaba definida directamente en Supabase. La re-creamos
-- aquí para que acepte los nuevos campos. El trigger purchase_item_apply ya
-- detecta si el producto tracks_expiry y crea el batch correspondiente.

create or replace function public.register_purchase(payload jsonb)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_supplier_id uuid;
  v_rate_ves    numeric(14,4);
  v_rate_cop    numeric(14,4);
  v_item        jsonb;
  v_total       numeric(14,2) := 0;
begin
  -- Permisos: admin o supervisor
  if not public.is_admin_or_supervisor() then
    raise exception 'Solo administradores y supervisores pueden registrar compras';
  end if;

  -- Tasas vigentes del día
  select usd_ves_paralelo, usd_cop into v_rate_ves, v_rate_cop
  from public.exchange_rates
  order by rate_date desc limit 1;

  v_supplier_id := nullif(payload->>'supplier_id', '')::uuid;

  insert into public.purchases (
    reference, supplier_id, purchase_date, currency_paid,
    rate_usd_ves, rate_usd_cop, notes, registered_by
  ) values (
    nullif(payload->>'reference', ''),
    v_supplier_id,
    coalesce((payload->>'purchase_date')::date, current_date),
    coalesce((payload->>'currency_paid')::currency, 'USD'),
    v_rate_ves, v_rate_cop,
    payload->>'notes',
    auth.uid()
  ) returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into public.purchase_items (
      purchase_id, product_id, quantity, unit_cost_usd, line_total_usd,
      expires_at, batch_code
    ) values (
      v_purchase_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_cost_usd')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'unit_cost_usd')::numeric,
      nullif(v_item->>'expires_at', '')::date,
      nullif(trim(v_item->>'batch_code'), '')
    );

    v_total := v_total + ((v_item->>'quantity')::numeric * (v_item->>'unit_cost_usd')::numeric);
  end loop;

  -- Total de la compra
  update public.purchases
  set total_usd = v_total
  where id = v_purchase_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'create_purchase', 'purchase', v_purchase_id, payload);

  return v_purchase_id;
end;
$$;

grant execute on function public.register_purchase(jsonb) to authenticated;

commit;
