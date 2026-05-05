-- =========================================================================
-- SISTEMA RINO - POLÍTICAS DE SEGURIDAD A NIVEL DE FILA (RLS)
-- Migración 002
-- =========================================================================
-- Roles:
--   admin     -> acceso total
--   supervisor-> ve todo, anula transacciones, no modifica configuración
--   cajero    -> solo POS, no ve costos ni reportes financieros
-- =========================================================================

-- Función helper para obtener el rol del usuario autenticado
create or replace function public.current_user_role()
returns user_role
language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false)
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean language sql stable security definer as $$
  select coalesce((select role from public.profiles where id = auth.uid())
                  in ('admin', 'supervisor'), false)
$$;

-- =========================================================================
-- ACTIVAR RLS EN TODAS LAS TABLAS
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.credits enable row level security;
alter table public.credit_payments enable row level security;
alter table public.audit_log enable row level security;

-- =========================================================================
-- PROFILES
-- =========================================================================

create policy "profiles: usuario ve su propio perfil"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin_or_supervisor());

create policy "profiles: solo admin crea usuarios"
  on public.profiles for insert
  with check (public.is_admin());

create policy "profiles: solo admin actualiza"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- CATEGORÍAS - lectura para todos los autenticados; escritura solo admin
-- =========================================================================

create policy "categories: lectura autenticados"
  on public.categories for select
  using (auth.uid() is not null);

create policy "categories: escritura solo admin"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- PRODUCTOS - cajero los ve pero NO ve campos de costo (filtrar en API)
-- =========================================================================

create policy "products: lectura autenticados"
  on public.products for select
  using (auth.uid() is not null);

create policy "products: escritura solo admin"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- PROVEEDORES - solo admin
-- =========================================================================

create policy "suppliers: solo admin"
  on public.suppliers for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- CLIENTES - todos pueden leer y crear; solo admin actualiza/borra
-- =========================================================================

create policy "customers: lectura autenticados"
  on public.customers for select
  using (auth.uid() is not null);

create policy "customers: insert autenticados"
  on public.customers for insert
  with check (auth.uid() is not null);

create policy "customers: update solo admin/supervisor"
  on public.customers for update
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

create policy "customers: delete solo admin"
  on public.customers for delete
  using (public.is_admin());

-- =========================================================================
-- TASAS CAMBIARIAS - lectura todos; escritura solo admin
-- =========================================================================

create policy "rates: lectura autenticados"
  on public.exchange_rates for select
  using (auth.uid() is not null);

create policy "rates: escritura solo admin"
  on public.exchange_rates for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- TURNOS DE CAJA - cada cajero ve sus turnos; admin/supervisor ven todos
-- =========================================================================

create policy "cash_sessions: cajero ve los suyos"
  on public.cash_sessions for select
  using (cashier_id = auth.uid() or public.is_admin_or_supervisor());

create policy "cash_sessions: cajero crea los suyos"
  on public.cash_sessions for insert
  with check (cashier_id = auth.uid());

create policy "cash_sessions: cajero cierra los suyos"
  on public.cash_sessions for update
  using (cashier_id = auth.uid() or public.is_admin_or_supervisor())
  with check (cashier_id = auth.uid() or public.is_admin_or_supervisor());

-- =========================================================================
-- VENTAS - cajero ve y crea las suyas; admin/supervisor ven todas y anulan
-- =========================================================================

create policy "sales: cajero ve sus ventas"
  on public.sales for select
  using (cashier_id = auth.uid() or public.is_admin_or_supervisor());

create policy "sales: cajero crea ventas"
  on public.sales for insert
  with check (cashier_id = auth.uid());

create policy "sales: solo admin/supervisor anulan"
  on public.sales for update
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

-- Detalle de ventas: hereda visibilidad de la venta padre
create policy "sale_items: lectura según venta"
  on public.sale_items for select
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
      and (s.cashier_id = auth.uid() or public.is_admin_or_supervisor())
    )
  );

create policy "sale_items: insert junto con venta"
  on public.sale_items for insert
  with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and s.cashier_id = auth.uid()
    )
  );

-- =========================================================================
-- COMPRAS - solo admin
-- =========================================================================

create policy "purchases: solo admin"
  on public.purchases for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "purchase_items: solo admin"
  on public.purchase_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- KARDEX - lectura admin/supervisor
-- =========================================================================

create policy "movements: lectura admin/supervisor"
  on public.inventory_movements for select
  using (public.is_admin_or_supervisor());

create policy "movements: escritura admin"
  on public.inventory_movements for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- CRÉDITOS - admin/supervisor; cajero crea créditos al registrar ventas
-- =========================================================================

create policy "credits: lectura admin/supervisor"
  on public.credits for select
  using (public.is_admin_or_supervisor());

create policy "credits: insert al hacer venta"
  on public.credits for insert
  with check (auth.uid() is not null);

create policy "credits: update admin/supervisor"
  on public.credits for update
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

create policy "credit_payments: admin/supervisor"
  on public.credit_payments for all
  using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

-- =========================================================================
-- AUDIT LOG - solo lectura admin; insert automático
-- =========================================================================

create policy "audit: lectura solo admin"
  on public.audit_log for select
  using (public.is_admin());

create policy "audit: insert para todos"
  on public.audit_log for insert
  with check (auth.uid() is not null);
