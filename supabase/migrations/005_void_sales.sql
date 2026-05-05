-- ============================================================================
-- 005_void_sales.sql — Anular ventas
-- ============================================================================
-- Agrega columnas para tracking de anulación + función atómica para anular
-- una venta (cambia status, registra motivo, devuelve stock al inventario).
-- ============================================================================

-- 1. Columnas de tracking
alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text;

-- 2. Función para anular venta atómicamente
--    - Solo admin/supervisor
--    - Requiere motivo
--    - Cambia status a 'anulada'
--    - Devuelve stock de cada item
--    - Si era venta a crédito, también ajustaría el saldo (pendiente cuando
--      tengamos el módulo de créditos completo)
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
begin
  -- Verificar rol del usuario
  select role into v_user_role
  from public.profiles
  where id = auth.uid();

  if v_user_role not in ('admin', 'supervisor') then
    raise exception 'Solo administradores y supervisores pueden anular ventas';
  end if;

  -- Validar motivo
  if (p_reason is null or length(trim(p_reason)) < 3) then
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

  -- Marcar venta como anulada
  update public.sales
  set status = 'anulada',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(p_reason)
  where id = p_sale_id;

  -- Devolver stock de cada item
  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    update public.products
    set stock = stock + v_item.quantity
    where id = v_item.product_id;
  end loop;

  return json_build_object(
    'ok', true,
    'sale_id', p_sale_id,
    'voided_at', now()
  );
end;
$$;

grant execute on function public.void_sale(uuid, text) to authenticated;

-- 3. Asegurar que las vistas de KPIs y reportes excluyan anuladas.
--    Si tu vista v_dashboard_kpis o v_sales_daily ya filtra por
--    status = 'completada', ya estás cubierto. Si no, ejecuta:
--
-- create or replace view public.v_sales_daily as
-- select
--   date_trunc('day', created_at) as day,
--   sum(total_usd)               as total_usd,
--   count(*)                      as count
-- from public.sales
-- where status = 'completada'
--   and created_at >= now() - interval '30 days'
-- group by 1
-- order by 1;
--
-- (Ajusta según el esquema actual.)
