-- =========================================================================
-- 013_users_module.sql — Módulo de usuarios (stats + helpers)
-- =========================================================================
-- Requisitos: 001-012 aplicadas.
--
-- Contenido:
--   1. RPC list_users_with_stats() — devuelve perfiles con últimas
--      transacciones y último login (lectura de auth.users requiere
--      security definer porque RLS de auth.users es restrictiva).
--
-- La creación / actualización / desactivación de usuarios se hace desde
-- las server actions (src/app/(dashboard)/usuarios/actions.js) usando el
-- service role, así que no necesitamos RPCs adicionales.
-- =========================================================================

begin;

-- ===========================================================================
-- 1) list_users_with_stats — lista de perfiles con métricas agregadas
-- ===========================================================================

create or replace function public.list_users_with_stats()
returns table (
  id              uuid,
  full_name       text,
  email           text,
  role            user_role,
  active          boolean,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  sales_today     bigint,
  revenue_today   numeric,
  sales_30d       bigint,
  revenue_30d     numeric,
  voided_30d      bigint
)
language plpgsql security definer
set search_path = public
as $$
begin
  -- Solo admin o supervisor pueden listar usuarios
  if not public.is_admin_or_supervisor() then
    raise exception 'Sin permisos para listar usuarios';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.active,
    p.created_at,
    u.last_sign_in_at,
    coalesce(
      count(s.id) filter (
        where s.status = 'completada'
          and s.created_at::date = current_date
      ),
      0
    )::bigint as sales_today,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and s.created_at::date = current_date
      ),
      0
    )::numeric as revenue_today,
    coalesce(
      count(s.id) filter (
        where s.status = 'completada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint as sales_30d,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::numeric as revenue_30d,
    coalesce(
      count(s.id) filter (
        where s.status = 'anulada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint as voided_30d
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.sales s on s.cashier_id = p.id
  group by p.id, p.full_name, p.email, p.role, p.active, p.created_at, u.last_sign_in_at
  order by p.active desc, p.full_name asc;
end;
$$;

grant execute on function public.list_users_with_stats() to authenticated;

commit;
