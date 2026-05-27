-- =========================================================================
-- 014_product_variants.sql — Presentaciones de venta (variants)
-- =========================================================================
-- Requisitos: 001-013 aplicadas.
--
-- Caso de uso: productos que se venden en múltiples presentaciones que
-- comparten el mismo pool de stock. Ej: huevos vendidos por caja (180u),
-- cartón (30u), medio cartón (15u) o unidad. El stock se lleva en la
-- unidad base (huevo individual); cada presentación define cuántas
-- unidades base consume al venderse y su propio precio.
--
-- Contenido:
--   1. Tabla product_variants
--   2. Columnas variant_* en sale_items
--   3. Trigger tg_sale_item_apply actualizado (usa multiplicador)
--   4. RPC register_sale actualizada (acepta variant_id por item)
--   5. RLS
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Tabla product_variants
-- ===========================================================================

create table if not exists public.product_variants (
  id             uuid primary key default uuid_generate_v4(),
  product_id     uuid not null references public.products(id) on delete cascade,
  name           text not null,
  base_quantity  numeric(14,4) not null check (base_quantity > 0),
  price_usd      numeric(14,4) not null default 0,
  price_cop      numeric(14,2) not null default 0,
  price_ves      numeric(14,2) not null default 0,
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(product_id, name)
);

create index if not exists idx_product_variants_product
  on public.product_variants(product_id);

drop trigger if exists product_variants_updated_at on public.product_variants;
create trigger product_variants_updated_at
  before update on public.product_variants
  for each row execute function public.tg_set_updated_at();

-- ===========================================================================
-- 2) Columnas variant_* en sale_items (idempotente)
-- ===========================================================================

alter table public.sale_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_name_snapshot text,
  add column if not exists base_qty_per_unit_snapshot numeric(14,4);

-- ===========================================================================
-- 3) Trigger tg_sale_item_apply — descuento de stock usando multiplicador
-- ===========================================================================
-- Si la fila trae base_qty_per_unit_snapshot, el descuento de stock es
-- quantity × multiplicador (ej. 1 cartón × 30 huevos = 30 unidades base).
-- Si no, multiplicador = 1 (comportamiento legacy).
-- ===========================================================================

create or replace function public.tg_sale_item_apply()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock numeric(14,3);
  v_current_cost  numeric(14,4);
  v_new_stock     numeric(14,3);
  v_multiplier    numeric(14,4);
  v_decrement     numeric(14,4);
begin
  select stock, cost_avg
    into v_current_stock, v_current_cost
  from public.products
  where id = new.product_id
  for update;

  -- Snapshot del costo
  if new.unit_cost_usd is null or new.unit_cost_usd = 0 then
    new.unit_cost_usd := coalesce(v_current_cost, 0);
  end if;

  v_multiplier := coalesce(new.base_qty_per_unit_snapshot, 1);
  v_decrement  := new.quantity * v_multiplier;

  v_new_stock := coalesce(v_current_stock, 0) - v_decrement;

  update public.products
  set stock = v_new_stock
  where id = new.product_id;

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
-- 4) RPC register_sale — acepta variant_id en items
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
    rate_usd_ves, rate_usd_cop, notes
  ) values (
    auth.uid(), v_session_id, v_customer_id,
    v_payment_method, v_paid_currency,
    coalesce((payload->>'paid_amount')::numeric, 0),
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

-- ===========================================================================
-- 5) RLS
-- ===========================================================================

alter table public.product_variants enable row level security;

drop policy if exists "product_variants: lectura autenticados" on public.product_variants;
create policy "product_variants: lectura autenticados"
  on public.product_variants for select
  using (auth.uid() is not null);

drop policy if exists "product_variants: escritura admin/supervisor" on public.product_variants;
create policy "product_variants: escritura admin/supervisor"
  on public.product_variants for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

commit;
