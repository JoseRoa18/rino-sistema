-- =========================================================================
-- 020_daily_summary_categories.sql — Cierre de caja por categoría
-- =========================================================================
-- Requisitos: 001-019 aplicadas.
--
-- Agrega la sección `by_category` al RPC daily_summary con:
--   category_name · units_sold · revenue_usd · cogs_usd · profit_usd · margin_pct
-- Se ordena por revenue_usd desc.
-- =========================================================================

begin;

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
  v_by_category    jsonb;
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

  -- NUEVO: por categoría
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category_name', category_name,
        'units_sold',    units_sold,
        'revenue_usd',   revenue_usd,
        'cogs_usd',      cogs_usd,
        'profit_usd',    profit_usd,
        'margin_pct',    case when revenue_usd > 0
                              then profit_usd / revenue_usd * 100
                              else 0 end
      ) order by revenue_usd desc
    ),
    '[]'::jsonb
  )
  into v_by_category
  from (
    select
      coalesce(c.name, 'Sin categoría')                          as category_name,
      coalesce(sum(si.quantity), 0)                              as units_sold,
      coalesce(sum(si.line_total_usd), 0)                        as revenue_usd,
      coalesce(sum(si.unit_cost_usd * si.quantity), 0)           as cogs_usd,
      coalesce(sum((si.unit_price_usd - si.unit_cost_usd) * si.quantity), 0)
                                                                 as profit_usd
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    join public.products p    on p.id = si.product_id
    left join public.categories c on c.id = p.category_id
    where public.ve_date(s.created_at) = p_date
      and s.is_internal = false
      and s.status = 'completada'
    group by c.id, c.name
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
    'by_category',           coalesce(v_by_category, '[]'::jsonb),
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

commit;
