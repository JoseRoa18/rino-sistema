-- =========================================================================
-- 010_reports_views.sql — Vistas auxiliares para el módulo de Reportes
-- =========================================================================
-- Requisitos: 001-009 aplicadas.
--
-- Estas vistas se diseñan para servir reportes de:
--   - Ventas: por cajero, por método, por categoría, por hora, por moneda
--   - Inventario: valuación, rotación
--   - Productos: rentabilidad, sin movimiento
--
-- No filtran por fecha (eso se hace en el query del reporte) salvo cuando
-- el cálculo es naturalmente histórico (lifetime / 30d / 90d).
-- =========================================================================

begin;

-- ===========================================================================
-- 1) Ventas por cajero (histórico). Filtrar por created_at en el query.
-- ===========================================================================

create or replace view public.v_sales_by_cashier as
select
  s.cashier_id,
  pr.full_name                                  as cashier_name,
  s.created_at::date                            as day,
  count(*) filter (where s.status = 'completada') as tx_count,
  count(*) filter (where s.status = 'anulada')    as void_count,
  coalesce(sum(s.total_usd) filter (where s.status = 'completada'), 0)
                                                  as total_usd,
  coalesce(sum(s.total_usd) filter (where s.status = 'anulada'), 0)
                                                  as voided_usd
from public.sales s
left join public.profiles pr on pr.id = s.cashier_id
group by s.cashier_id, pr.full_name, s.created_at::date;

-- ===========================================================================
-- 2) Ventas por método de pago (histórico, agregado por día)
-- ===========================================================================

create or replace view public.v_sales_by_payment as
select
  s.created_at::date                            as day,
  s.payment_method,
  s.paid_currency,
  count(*)                                      as tx_count,
  coalesce(sum(s.total_usd), 0)                 as total_usd
from public.sales s
where s.status = 'completada'
group by s.created_at::date, s.payment_method, s.paid_currency;

-- ===========================================================================
-- 3) Ventas por categoría (lifetime, agregado por día)
-- ===========================================================================

create or replace view public.v_sales_by_category as
select
  s.created_at::date                              as day,
  coalesce(c.id, '00000000-0000-0000-0000-000000000000'::uuid) as category_id,
  coalesce(c.name, 'Sin categoría')               as category_name,
  count(distinct s.id)                            as tx_count,
  sum(si.quantity)                                as units_sold,
  sum(si.line_total_usd)                          as revenue_usd,
  sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity)
                                                  as profit_usd
from public.sales s
join public.sale_items si on si.sale_id = s.id
join public.products p    on p.id = si.product_id
left join public.categories c on c.id = p.category_id
where s.status = 'completada'
group by s.created_at::date, c.id, c.name;

-- ===========================================================================
-- 4) Ventas por hora (mapa de calor, últimos 90 días)
-- ===========================================================================

create or replace view public.v_sales_by_hour as
select
  extract(dow  from s.created_at at time zone 'America/Caracas')::int as dow,    -- 0=domingo, 6=sábado
  extract(hour from s.created_at at time zone 'America/Caracas')::int as hour,   -- 0..23
  count(*)                                                              as tx_count,
  sum(s.total_usd)                                                      as total_usd
from public.sales s
where s.status = 'completada'
  and s.created_at >= now() - interval '90 days'
group by 1, 2;

-- ===========================================================================
-- 5) P&L diario (ventas, costo, ganancia, margen) — histórico
-- ===========================================================================

create or replace view public.v_pnl_daily as
select
  s.created_at::date                                              as day,
  count(distinct s.id)                                            as tx_count,
  sum(si.line_total_usd)                                          as revenue_usd,
  sum(si.unit_cost_usd * si.quantity)                             as cogs_usd,
  sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity)       as profit_usd,
  case
    when sum(si.line_total_usd) > 0
    then sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity) / sum(si.line_total_usd) * 100
    else 0
  end                                                             as margin_pct
from public.sales s
join public.sale_items si on si.sale_id = s.id
where s.status = 'completada'
group by s.created_at::date;

-- ===========================================================================
-- 6) Rentabilidad por producto (lifetime)
-- ===========================================================================

create or replace view public.v_product_profitability as
select
  p.id                                              as product_id,
  p.sku,
  p.name,
  p.category_id,
  c.name                                            as category_name,
  p.stock,
  p.cost_avg,
  p.price_usd,
  p.target_margin,
  coalesce(sum(si.quantity), 0)                     as units_sold,
  coalesce(sum(si.line_total_usd), 0)               as revenue_usd,
  coalesce(sum(si.unit_cost_usd * si.quantity), 0)  as cogs_usd,
  coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
                                                    as profit_usd,
  case
    when coalesce(sum(si.line_total_usd), 0) > 0
    then sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity)
       / sum(si.line_total_usd) * 100
    else 0
  end                                               as margin_pct,
  max(s.created_at)                                 as last_sold_at,
  case
    when max(s.created_at) is null then null
    else extract(day from (now() - max(s.created_at)))::int
  end                                               as days_since_last_sale
from public.products p
left join public.categories c on c.id = p.category_id
left join public.sale_items si on si.product_id = p.id
left join public.sales s on s.id = si.sale_id and s.status = 'completada'
group by p.id, p.sku, p.name, p.category_id, c.name,
         p.stock, p.cost_avg, p.price_usd, p.target_margin;

-- ===========================================================================
-- 7) Valuación de inventario (por producto + agrupado por categoría)
-- ===========================================================================

create or replace view public.v_inventory_valuation as
select
  p.id                                  as product_id,
  p.sku,
  p.name,
  p.category_id,
  c.name                                as category_name,
  p.stock,
  p.min_stock,
  p.cost_avg,
  p.price_usd,
  (p.stock * p.cost_avg)                as stock_cost_usd,
  (p.stock * p.price_usd)               as stock_value_usd,
  (p.stock * (p.price_usd - p.cost_avg)) as potential_profit_usd,
  (p.stock <= p.min_stock and p.min_stock > 0) as is_low_stock,
  p.active
from public.products p
left join public.categories c on c.id = p.category_id;

create or replace view public.v_inventory_valuation_by_category as
select
  coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)   as category_id,
  coalesce(category_name, 'Sin categoría')                              as category_name,
  count(*) filter (where active)                                        as active_products,
  sum(stock)                  filter (where active)                     as total_units,
  sum(stock_cost_usd)         filter (where active)                     as total_cost_usd,
  sum(stock_value_usd)        filter (where active)                     as total_value_usd,
  sum(potential_profit_usd)   filter (where active)                     as potential_profit_usd,
  count(*) filter (where is_low_stock and active)                       as low_stock_count
from public.v_inventory_valuation
group by category_id, category_name;

-- ===========================================================================
-- 8) Compras por proveedor por día (para reporte de compras)
-- ===========================================================================

create or replace view public.v_purchases_daily as
select
  pu.created_at::date                          as day,
  pu.supplier_id,
  sp.name                                      as supplier_name,
  count(*)                                     as purchases_count,
  sum(pu.total_usd)                            as total_usd
from public.purchases pu
left join public.suppliers sp on sp.id = pu.supplier_id
group by pu.created_at::date, pu.supplier_id, sp.name;

-- ===========================================================================
-- 9) Grants para todas las vistas
-- ===========================================================================

grant select on public.v_sales_by_cashier                to authenticated;
grant select on public.v_sales_by_payment                to authenticated;
grant select on public.v_sales_by_category               to authenticated;
grant select on public.v_sales_by_hour                   to authenticated;
grant select on public.v_pnl_daily                       to authenticated;
grant select on public.v_product_profitability           to authenticated;
grant select on public.v_inventory_valuation             to authenticated;
grant select on public.v_inventory_valuation_by_category to authenticated;
grant select on public.v_purchases_daily                 to authenticated;

commit;
