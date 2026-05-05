-- =========================================================================
-- SISTEMA RINO - FUNCIONES Y TRIGGERS DE NEGOCIO
-- Migración 003
-- =========================================================================
-- Aquí vive la lógica que pediste:
--   * Promedio ponderado del costo cuando entra mercancía a un precio
--     diferente (ej: $10 + $11 + $8 -> nuevo costo promedio).
--   * Descuento automático de stock al registrar una venta.
--   * Generación de movimiento en kardex.
-- =========================================================================

-- =========================================================================
-- 1) PROMEDIO PONDERADO DE COSTO AL REGISTRAR UNA COMPRA
-- =========================================================================
-- Fórmula:
--   nuevo_costo_promedio = (stock_actual * costo_actual + cantidad_compra * costo_compra)
--                          / (stock_actual + cantidad_compra)
-- =========================================================================

create or replace function public.tg_purchase_item_apply()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock numeric(14,3);
  v_current_cost numeric(14,4);
  v_new_stock numeric(14,3);
  v_new_cost numeric(14,4);
  v_target_margin numeric(5,2);
  v_rate_ves numeric(14,4);
  v_rate_cop numeric(14,4);
begin
  -- Lock en el producto para evitar condiciones de carrera
  select stock, cost_avg, target_margin
    into v_current_stock, v_current_cost, v_target_margin
  from public.products
  where id = new.product_id
  for update;

  v_new_stock := coalesce(v_current_stock, 0) + new.quantity;

  -- Promedio ponderado
  if v_new_stock > 0 then
    v_new_cost := ((coalesce(v_current_stock, 0) * coalesce(v_current_cost, 0))
                   + (new.quantity * new.unit_cost_usd))
                  / v_new_stock;
  else
    v_new_cost := new.unit_cost_usd;
  end if;

  -- Tasas vigentes para sugerencia de precios
  select rate_usd_ves, rate_usd_cop
    into v_rate_ves, v_rate_cop
  from public.purchases
  where id = new.purchase_id;

  -- Actualiza producto: stock + costo promedio + sugerir precios con margen objetivo
  update public.products
  set
    stock = v_new_stock,
    cost_avg = v_new_cost,
    -- Solo sugerimos precio si target_margin > 0; el admin puede sobrescribir
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

  -- Movimiento en kardex
  insert into public.inventory_movements
    (product_id, movement_type, quantity, balance_after, unit_cost_usd,
     reference_type, reference_id, created_by, notes)
  values
    (new.product_id, 'entrada', new.quantity, v_new_stock, new.unit_cost_usd,
     'purchase', new.purchase_id, auth.uid(),
     format('Compra. Costo previo: %s, costo nuevo: %s', v_current_cost, v_new_cost));

  return new;
end;
$$;

drop trigger if exists purchase_item_apply on public.purchase_items;
create trigger purchase_item_apply
  after insert on public.purchase_items
  for each row execute function public.tg_purchase_item_apply();

-- =========================================================================
-- 2) DESCUENTO DE STOCK AL REGISTRAR UN ITEM DE VENTA
-- =========================================================================

create or replace function public.tg_sale_item_apply()
returns trigger language plpgsql security definer as $$
declare
  v_current_stock numeric(14,3);
  v_current_cost numeric(14,4);
  v_new_stock numeric(14,3);
begin
  select stock, cost_avg
    into v_current_stock, v_current_cost
  from public.products
  where id = new.product_id
  for update;

  -- Snapshot del costo en el momento de la venta (para análisis de margen real)
  if new.unit_cost_usd is null or new.unit_cost_usd = 0 then
    new.unit_cost_usd := coalesce(v_current_cost, 0);
  end if;

  v_new_stock := coalesce(v_current_stock, 0) - new.quantity;

  update public.products
  set stock = v_new_stock
  where id = new.product_id;

  -- Movimiento en kardex (cantidad negativa por ser salida)
  insert into public.inventory_movements
    (product_id, movement_type, quantity, balance_after, unit_cost_usd,
     reference_type, reference_id, created_by, notes)
  values
    (new.product_id, 'venta', -new.quantity, v_new_stock, new.unit_cost_usd,
     'sale', new.sale_id, auth.uid(), null);

  return new;
end;
$$;

drop trigger if exists sale_item_apply on public.sale_items;
create trigger sale_item_apply
  before insert on public.sale_items
  for each row execute function public.tg_sale_item_apply();

-- =========================================================================
-- 3) RECALCULAR TOTALES DE LA VENTA AUTOMÁTICAMENTE
-- =========================================================================

create or replace function public.tg_sale_totals_recalc()
returns trigger language plpgsql security definer as $$
declare
  v_sale_id uuid;
  v_total numeric(14,2);
begin
  v_sale_id := coalesce(new.sale_id, old.sale_id);

  select coalesce(sum(line_total_usd), 0) into v_total
  from public.sale_items where sale_id = v_sale_id;

  update public.sales
  set subtotal_usd = v_total,
      total_usd = v_total
  where id = v_sale_id;

  return null;
end;
$$;

drop trigger if exists sale_totals_recalc on public.sale_items;
create trigger sale_totals_recalc
  after insert or update or delete on public.sale_items
  for each row execute function public.tg_sale_totals_recalc();

-- =========================================================================
-- 4) ANULACIÓN DE VENTA: revertir stock
-- =========================================================================

create or replace function public.tg_sale_void()
returns trigger language plpgsql security definer as $$
declare
  v_item record;
begin
  if new.status = 'anulada' and (old.status is null or old.status <> 'anulada') then
    for v_item in select * from public.sale_items where sale_id = new.id loop
      update public.products
      set stock = stock + v_item.quantity
      where id = v_item.product_id;

      insert into public.inventory_movements
        (product_id, movement_type, quantity, balance_after, unit_cost_usd,
         reference_type, reference_id, created_by, notes)
      select
        v_item.product_id, 'devolucion', v_item.quantity,
        (select stock from public.products where id = v_item.product_id),
        v_item.unit_cost_usd, 'sale', new.id, auth.uid(),
        format('Anulación de venta #%s. Motivo: %s', new.invoice_number, new.void_reason);
    end loop;

    new.voided_at := now();
    new.voided_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists sale_void on public.sales;
create trigger sale_void
  before update on public.sales
  for each row execute function public.tg_sale_void();

-- =========================================================================
-- 5) ABONO DE CRÉDITO - actualizar saldo
-- =========================================================================

create or replace function public.tg_credit_payment_apply()
returns trigger language plpgsql security definer as $$
declare
  v_balance numeric(14,2);
begin
  update public.credits
  set paid_amount_usd = paid_amount_usd + new.amount_usd
  where id = new.credit_id
  returning balance_usd into v_balance;

  if v_balance <= 0 then
    update public.credits set status = 'pagado' where id = new.credit_id;
  end if;

  return new;
end;
$$;

drop trigger if exists credit_payment_apply on public.credit_payments;
create trigger credit_payment_apply
  after insert on public.credit_payments
  for each row execute function public.tg_credit_payment_apply();

-- =========================================================================
-- 6) RPC: REGISTRAR VENTA COMPLETA EN UNA TRANSACCIÓN (uso desde el POS)
-- =========================================================================
-- Recibe un JSON con la cabecera y los items.
-- Devuelve el id de la venta creada.
-- =========================================================================

create or replace function public.register_sale(payload jsonb)
returns uuid
language plpgsql security definer as $$
declare
  v_sale_id uuid;
  v_session_id uuid;
  v_item jsonb;
  v_rate_ves numeric(14,4);
  v_rate_cop numeric(14,4);
  v_customer_id uuid;
  v_payment_method payment_method;
  v_paid_currency currency;
begin
  -- Tasas del día
  select usd_ves_paralelo, usd_cop into v_rate_ves, v_rate_cop
  from public.exchange_rates
  order by rate_date desc limit 1;

  -- Turno abierto del cajero (si existe)
  select id into v_session_id
  from public.cash_sessions
  where cashier_id = auth.uid() and closed_at is null
  order by opened_at desc limit 1;

  v_customer_id := nullif(payload->>'customer_id', '')::uuid;
  v_payment_method := coalesce((payload->>'payment_method')::payment_method, 'efectivo');
  v_paid_currency := coalesce((payload->>'paid_currency')::currency, 'USD');

  -- Crear cabecera
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

  -- Insertar items
  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into public.sale_items (
      sale_id, product_id, product_name, quantity, unit_price_usd, line_total_usd
    ) values (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price_usd')::numeric,
      (v_item->>'quantity')::numeric * (v_item->>'unit_price_usd')::numeric
    );
  end loop;

  -- Si es venta a crédito, abrir registro
  if v_payment_method = 'credito' and v_customer_id is not null then
    insert into public.credits (customer_id, sale_id, original_amount_usd, due_date, notes)
    select v_customer_id, v_sale_id, total_usd,
           nullif(payload->>'due_date', '')::date,
           'Venta a crédito #' || invoice_number
    from public.sales where id = v_sale_id;
  end if;

  -- Bitácora
  insert into public.audit_log (user_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'create_sale', 'sale', v_sale_id, payload);

  return v_sale_id;
end;
$$;

-- =========================================================================
-- 7) VISTA: KPIs DEL DASHBOARD (admin/supervisor)
-- =========================================================================

create or replace view public.v_dashboard_kpis as
select
  -- Ventas de hoy
  (select coalesce(sum(total_usd), 0)
   from public.sales
   where created_at::date = current_date and status = 'completada') as sales_today_usd,

  (select count(*)
   from public.sales
   where created_at::date = current_date and status = 'completada') as transactions_today,

  -- Ventas de la semana (últimos 7 días)
  (select coalesce(sum(total_usd), 0)
   from public.sales
   where created_at >= current_date - interval '6 days' and status = 'completada') as sales_week_usd,

  -- Ventas del mes
  (select coalesce(sum(total_usd), 0)
   from public.sales
   where date_trunc('month', created_at) = date_trunc('month', current_date)
     and status = 'completada') as sales_month_usd,

  -- Ganancia del día (precio - costo)
  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.created_at::date = current_date and s.status = 'completada') as profit_today_usd,

  -- Ganancia de la semana
  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where s.created_at >= current_date - interval '6 days'
     and s.status = 'completada') as profit_week_usd,

  -- Ganancia del mes
  (select coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
   from public.sale_items si
   join public.sales s on s.id = si.sale_id
   where date_trunc('month', s.created_at) = date_trunc('month', current_date)
     and s.status = 'completada') as profit_month_usd,

  -- Productos bajo mínimo
  (select count(*) from public.products
   where stock <= min_stock and active = true) as low_stock_count,

  -- Cuentas por cobrar pendientes
  (select coalesce(sum(balance_usd), 0)
   from public.credits where status = 'abierto') as pending_credits_usd;

-- =========================================================================
-- 8) VISTA: VENTAS POR DÍA (últimos 30 días) para gráficos del dashboard
-- =========================================================================

create or replace view public.v_sales_daily as
select
  created_at::date as day,
  count(*) as transactions,
  sum(total_usd) as total_usd
from public.sales
where status = 'completada'
  and created_at >= current_date - interval '29 days'
group by 1
order by 1;
