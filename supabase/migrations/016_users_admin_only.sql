-- =========================================================================
-- 016_users_admin_only.sql — Gestión de usuarios exclusiva del admin
-- =========================================================================
-- Requisitos: 001-015 aplicadas.
--
-- El sistema sólo distingue admin y cajero. La pantalla de usuarios
-- (crear, editar, eliminar, ver estadísticas) ahora es exclusiva del
-- administrador.
-- =========================================================================

begin;

-- ===========================================================================
-- 1) list_users_with_stats — exige admin (antes admin o supervisor)
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
  if not public.is_admin() then
    raise exception 'Sólo el administrador puede ver la lista de usuarios';
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
          and public.ve_date(s.created_at) = public.ve_today()
      ),
      0
    )::bigint,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and public.ve_date(s.created_at) = public.ve_today()
      ),
      0
    )::numeric,
    coalesce(
      count(s.id) filter (
        where s.status = 'completada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint,
    coalesce(
      sum(s.total_usd) filter (
        where s.status = 'completada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::numeric,
    coalesce(
      count(s.id) filter (
        where s.status = 'anulada'
          and s.created_at >= now() - interval '30 days'
      ),
      0
    )::bigint
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.sales s on s.cashier_id = p.id
  group by p.id, p.full_name, p.email, p.role, p.active, p.created_at, u.last_sign_in_at
  order by p.active desc, p.full_name asc;
end;
$$;

grant execute on function public.list_users_with_stats() to authenticated;

commit;
