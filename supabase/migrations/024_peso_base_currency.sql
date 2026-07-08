-- =========================================================================
-- 024_peso_base_currency.sql
-- =========================================================================
-- Requisitos: 001-023 aplicadas.
--
-- El PESO COLOMBIANO pasa a ser la moneda ancla del costo y del precio de
-- venta. El comerciante registra en pesos y queda FIJO en pesos; USD y Bs. se
-- DERIVAN del peso a la tasa de la operación.
--
-- Diseño (aditivo, sin tocar vistas):
--   products.cost_avg_cop  → costo promedio ponderado en COP (autoritativo)
--   products.price_cop     → precio de venta autoritativo (ya existía)
--   products.cost_avg (USD), price_usd, price_ves → DERIVADOS pero guardados,
--     para que las ~15 vistas y RPCs sigan funcionando sin cambios.
--
-- usd_cop es MANUAL con fallback al TRM (Fase 1). Ese fallback vivía solo en
-- JS (getCachedLatestRate); aquí lo replicamos en los RPC SQL con
-- coalesce(usd_cop, usd_cop_trm) para que un día sin tasa manual no divida por
-- NULL al derivar COP→USD.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1) Columnas nuevas (ancla en pesos)
-- -------------------------------------------------------------------------
alter table public.products
  add column if not exists cost_avg_cop numeric(14,4) not null default 0;

alter table public.purchase_items
  add column if not exists unit_cost_cop numeric(14,4);

comment on column public.products.cost_avg_cop is
  'Costo promedio ponderado en COP. Ancla fija en pesos; cost_avg (USD) se deriva de este.';
comment on column public.purchase_items.unit_cost_cop is
  'Costo unitario de compra en COP (peso = moneda base). unit_cost_usd se deriva de este.';

-- -------------------------------------------------------------------------
-- 2) Backfill — congelar el valor en pesos de HOY
-- -------------------------------------------------------------------------
-- purchase_items: usa el rate snapshot de su compra; si es NULL, la última
-- tasa efectiva (manual con fallback al TRM).
update public.purchase_items pi
set unit_cost_cop = round(
      coalesce(pi.unit_cost_usd, 0) * coalesce(
        pu.rate_usd_cop,
        (select coalesce(usd_cop, usd_cop_trm)
           from public.exchange_rates order by rate_date desc limit 1)
      ), 4)
from public.purchases pu
where pi.purchase_id = pu.id
  and pi.unit_cost_cop is null;

-- products: cost_avg_cop = cost_avg (USD) × tasa efectiva actual.
update public.products
set cost_avg_cop = round(
      cost_avg * coalesce(
        (select coalesce(usd_cop, usd_cop_trm)
           from public.exchange_rates order by rate_date desc limit 1),
        0), 4)
where cost_avg_cop = 0 and cost_avg > 0;

-- -------------------------------------------------------------------------
-- 3) register_purchase — captura el costo en COP y deriva USD
-- -------------------------------------------------------------------------
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
  v_qty         numeric(14,3);
  v_cost_cop    numeric(14,4);
  v_cost_usd    numeric(14,4);
  v_line_usd    numeric(14,2);
begin
  -- Permisos: admin o supervisor
  if not public.is_admin_or_supervisor() then
    raise exception 'Solo administradores y supervisores pueden registrar compras';
  end if;

  -- Tasas del día. usd_cop es MANUAL con fallback al TRM (peso = moneda base).
  select usd_ves_paralelo, coalesce(usd_cop, usd_cop_trm)
    into v_rate_ves, v_rate_cop
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
    coalesce((payload->>'currency_paid')::currency, 'COP'),
    v_rate_ves, v_rate_cop,
    payload->>'notes',
    auth.uid()
  ) returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    v_qty      := (v_item->>'quantity')::numeric;
    v_cost_cop := (v_item->>'unit_cost_cop')::numeric;
    -- USD derivado del peso a la tasa del día
    v_cost_usd := case when v_rate_cop is not null and v_rate_cop > 0
                       then round(v_cost_cop / v_rate_cop, 4)
                       else 0 end;
    v_line_usd := round(v_qty * v_cost_usd, 2);

    insert into public.purchase_items (
      purchase_id, product_id, quantity,
      unit_cost_cop, unit_cost_usd, line_total_usd,
      expires_at, batch_code
    ) values (
      v_purchase_id,
      (v_item->>'product_id')::uuid,
      v_qty,
      v_cost_cop,
      v_cost_usd,
      v_line_usd,
      nullif(v_item->>'expires_at', '')::date,
      nullif(trim(v_item->>'batch_code'), '')
    );

    v_total := v_total + v_line_usd;
  end loop;

  update public.purchases
  set total_usd = v_total
  where id = v_purchase_id;

  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'create_purchase', 'purchase', v_purchase_id, payload);

  return v_purchase_id;
end;
$$;

grant execute on function public.register_purchase(jsonb) to authenticated;

-- -------------------------------------------------------------------------
-- 4) tg_purchase_item_apply — promedio ponderado EN COP, deriva USD/Bs
-- -------------------------------------------------------------------------
create or replace function public.tg_purchase_item_apply()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock  numeric(14,3);
  v_current_cop    numeric(14,4);
  v_new_stock      numeric(14,3);
  v_new_cop        numeric(14,4);
  v_target_margin  numeric(5,2);
  v_rate_ves       numeric(14,4);
  v_rate_cop       numeric(14,4);
  v_rino           numeric(14,6);
  v_tracks_expiry  boolean;
  v_price_cop      numeric(14,2);
begin
  select stock, cost_avg_cop, target_margin, coalesce(tracks_expiry, false)
    into v_current_stock, v_current_cop, v_target_margin, v_tracks_expiry
  from public.products
  where id = new.product_id
  for update;

  v_new_stock := coalesce(v_current_stock, 0) + new.quantity;

  -- Promedio ponderado del costo EN PESOS
  if v_new_stock > 0 then
    v_new_cop := ((coalesce(v_current_stock, 0) * coalesce(v_current_cop, 0))
                  + (new.quantity * coalesce(new.unit_cost_cop, 0)))
                 / v_new_stock;
  else
    v_new_cop := coalesce(new.unit_cost_cop, 0);
  end if;

  -- Tasa de la compra (ya trae fallback al TRM desde register_purchase)
  select rate_usd_ves, rate_usd_cop
    into v_rate_ves, v_rate_cop
  from public.purchases
  where id = new.purchase_id;

  -- Tasa Rino COP→Bs vigente para derivar el precio en bolívares (igual que el POS)
  select rino_cop_ves into v_rino
  from public.exchange_rates
  order by rate_date desc limit 1;

  -- Precio de venta sugerido, ANCLADO en pesos
  v_price_cop := round(v_new_cop * (1 + coalesce(v_target_margin, 30) / 100), 2);

  update public.products
  set
    stock        = v_new_stock,
    cost_avg_cop = v_new_cop,
    cost_avg     = case when v_rate_cop is not null and v_rate_cop > 0
                        then round(v_new_cop / v_rate_cop, 4)
                        else cost_avg end,
    price_cop    = v_price_cop,
    price_usd    = case when v_rate_cop is not null and v_rate_cop > 0
                        then round(v_price_cop / v_rate_cop, 2)
                        else price_usd end,
    price_ves    = case
                     when v_rino is not null and v_rino > 0
                       then ceil(v_price_cop / v_rino)
                     when v_rate_ves is not null and v_rate_cop is not null and v_rate_cop > 0
                       then round((v_price_cop / v_rate_cop) * v_rate_ves, 2)
                     else price_ves
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
     format('Compra. Costo previo (COP): %s, costo nuevo (COP): %s%s',
            v_current_cop, v_new_cop,
            case when v_tracks_expiry and new.expires_at is not null
                 then format(' · Vence %s', to_char(new.expires_at, 'YYYY-MM-DD'))
                 else '' end));

  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 5) register_sale — fallback TRM en la tasa snapshot (peso = base)
--    (idéntica a 018, solo cambia el SELECT de la tasa)
-- -------------------------------------------------------------------------
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
  select usd_ves_paralelo, coalesce(usd_cop, usd_cop_trm)
    into v_rate_ves, v_rate_cop
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

-- -------------------------------------------------------------------------
-- 6) register_family_consumption — fallback TRM en la tasa snapshot
--    (idéntica a 011, solo cambia el SELECT de la tasa)
-- -------------------------------------------------------------------------
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

  -- Tasas vigentes (snapshot). usd_cop con fallback al TRM.
  select usd_ves_paralelo, coalesce(usd_cop, usd_cop_trm)
    into v_rate_ves, v_rate_cop
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

    insert into public.sale_items (
      sale_id, product_id, product_name, quantity,
      unit_price_usd, unit_cost_usd, line_total_usd
    ) values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_product_name,
      v_qty,
      v_cost,
      v_cost,
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

commit;
