-- =========================================================================
-- 017_fix_void_sale.sql — Anulación de venta correcta con variants
-- =========================================================================
-- Requisitos: 001-016 aplicadas.
--
-- Bugs corregidos:
--   1) DOBLE retorno de stock al anular:
--      - tg_sale_void trigger en sales (003) suma quantity al stock
--      - void_sale RPC (005) ADEMÁS suma quantity nuevamente en su loop
--      Resultado: anular 1 venta de 1 unidad inflaba el stock en +2.
--   2) FALTA multiplicador de variant al revertir:
--      - Ambos sitios usaban v_item.quantity en bruto, ignorando
--        base_qty_per_unit_snapshot. Una venta de 1 cartón (descuenta 30
--        huevos) al anularse solo reintegraba 1 huevo.
--
-- Solución:
--   - tg_sale_void: eliminar (era la fuente del doble retorno).
--   - void_sale RPC: reescribir con base_qty_per_unit_snapshot y crear
--     un único movimiento en kardex 'devolucion' con la cantidad real.
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Quitar el trigger sale_void — era el segundo punto que reintegraba stock
-- ===========================================================================

drop trigger if exists sale_void on public.sales;
drop function if exists public.tg_sale_void();

-- ===========================================================================
-- 2) void_sale — usa multiplicador y NO duplica con el trigger ausente
-- ===========================================================================

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_role text;
  v_sale record;
  v_item record;
  v_multiplier numeric(14,4);
  v_decrement_back numeric(14,4);
  v_new_stock numeric(14,3);
begin
  -- Verificar rol
  select role into v_user_role
  from public.profiles where id = auth.uid();

  if v_user_role not in ('admin', 'supervisor') then
    raise exception 'Solo administradores y supervisores pueden anular ventas';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Debes especificar un motivo de anulación (mínimo 3 caracteres)';
  end if;

  -- Bloquear y obtener la venta
  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.status = 'anulada' then
    raise exception 'La venta ya está anulada';
  end if;

  -- Marcar como anulada (el trigger sale_void ya no existe, no hay efectos secundarios)
  update public.sales
  set status = 'anulada',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(p_reason)
  where id = p_sale_id;

  -- Reintegrar stock: para variants, multiplica por base_qty_per_unit_snapshot
  for v_item in
    select product_id, quantity, unit_cost_usd,
           variant_name_snapshot, base_qty_per_unit_snapshot
    from public.sale_items
    where sale_id = p_sale_id
  loop
    v_multiplier := coalesce(v_item.base_qty_per_unit_snapshot, 1);
    v_decrement_back := v_item.quantity * v_multiplier;

    update public.products
    set stock = stock + v_decrement_back
    where id = v_item.product_id
    returning stock into v_new_stock;

    insert into public.inventory_movements
      (product_id, movement_type, quantity, balance_after, unit_cost_usd,
       reference_type, reference_id, created_by, notes)
    values
      (v_item.product_id, 'devolucion', v_decrement_back, v_new_stock,
       v_item.unit_cost_usd, 'sale', p_sale_id, auth.uid(),
       case
         when v_item.variant_name_snapshot is not null then
           format('Anulación venta #%s · Presentación: %s × %s · Motivo: %s',
                  v_sale.invoice_number, v_item.variant_name_snapshot,
                  v_item.quantity, v_sale.void_reason)
         else
           format('Anulación venta #%s · Motivo: %s',
                  v_sale.invoice_number, v_sale.void_reason)
       end);
  end loop;

  return json_build_object(
    'ok', true,
    'sale_id', p_sale_id,
    'voided_at', now()
  );
end;
$$;

grant execute on function public.void_sale(uuid, text) to authenticated;

-- ===========================================================================
-- 3) v_dashboard_kpis — 'Stock bajo mínimo' no debe incluir sin_stock
-- ===========================================================================
-- Antes: where stock <= min_stock → incluía productos con stock = 0
-- Eso desalineaba el KPI con el filtro del inventario (deriveStatus()
-- prioriza sin_stock sobre bajo_minimo). Al hacer click del dashboard,
-- el usuario veía menos productos que los reportados en el KPI.
-- Ahora: requiere stock > 0 para considerarse "bajo mínimo".
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

  -- 'Bajo mínimo' coincide con deriveStatus(): stock > 0 y stock <= min_stock
  (select count(*) from public.products
   where stock > 0
     and stock <= min_stock
     and active = true) as low_stock_count,

  (select coalesce(sum(balance_usd), 0)
   from public.credits where status = 'abierto') as pending_credits_usd;

commit;
