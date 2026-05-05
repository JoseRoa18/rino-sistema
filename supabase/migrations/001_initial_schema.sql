-- =========================================================================
-- SISTEMA RINO - ESQUEMA INICIAL DE BASE DE DATOS
-- Migración 001: Estructura base completa
-- =========================================================================
-- Cubre Semanas 1-4 del roadmap. Las semanas 1 y 2 usan un subconjunto.
-- =========================================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- =========================================================================
-- ENUMS
-- =========================================================================

create type user_role as enum ('admin', 'cajero', 'supervisor');
create type currency as enum ('VES', 'COP', 'USD');
create type sale_status as enum ('completada', 'anulada', 'pendiente');
create type payment_method as enum ('efectivo', 'transferencia', 'pago_movil', 'tarjeta', 'credito', 'mixto');
create type movement_type as enum ('entrada', 'salida', 'ajuste', 'venta', 'devolucion');

-- =========================================================================
-- PERFILES DE USUARIO (extiende auth.users de Supabase)
-- =========================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role user_role not null default 'cajero',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);

-- =========================================================================
-- CATEGORÍAS DE PRODUCTOS
-- =========================================================================

create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- PRODUCTOS
-- =========================================================================

create table public.products (
  id uuid primary key default uuid_generate_v4(),
  sku text unique,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,

  -- Costos (promedio ponderado se actualiza vía trigger en compras)
  cost_avg numeric(14,4) not null default 0,
  cost_currency currency not null default 'USD',

  -- Precios de venta por moneda
  price_ves numeric(14,2) not null default 0,
  price_cop numeric(14,2) not null default 0,
  price_usd numeric(14,2) not null default 0,

  -- Margen objetivo (%)
  target_margin numeric(5,2) not null default 30,

  -- Inventario
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  unit text not null default 'unidad',

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_sku on public.products(sku);
create index idx_products_name on public.products(name);
create index idx_products_category on public.products(category_id);
create index idx_products_active on public.products(active);

-- =========================================================================
-- PROVEEDORES
-- =========================================================================

create table public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  invoicing_currency currency default 'USD',
  payment_terms text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- CLIENTES
-- =========================================================================

create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  document_id text, -- C.I. / RIF
  phone text,
  email text,
  address text,
  credit_limit_usd numeric(14,2) not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_customers_document on public.customers(document_id);
create index idx_customers_name on public.customers(name);

-- =========================================================================
-- TASAS CAMBIARIAS (HISTÓRICO DIARIO)
-- =========================================================================

create table public.exchange_rates (
  id uuid primary key default uuid_generate_v4(),
  rate_date date not null,
  -- Tasas oficiales y de mercado
  usd_ves_paralelo numeric(14,4),  -- Yadio.io
  usd_ves_bcv numeric(14,4),       -- BCV oficial
  usd_cop numeric(14,4),           -- ExchangeRate-API
  -- Tasa personalizada Rino (admin la fija)
  rino_cop_ves numeric(14,6),
  source text default 'auto',
  created_at timestamptz not null default now(),
  unique(rate_date)
);

create index idx_exchange_rates_date on public.exchange_rates(rate_date desc);

-- =========================================================================
-- TURNOS DE CAJA (CASH SESSIONS)
-- =========================================================================

create table public.cash_sessions (
  id uuid primary key default uuid_generate_v4(),
  cashier_id uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount_usd numeric(14,2) not null default 0,
  opening_amount_ves numeric(14,2) not null default 0,
  opening_amount_cop numeric(14,2) not null default 0,
  closing_amount_usd numeric(14,2),
  closing_amount_ves numeric(14,2),
  closing_amount_cop numeric(14,2),
  notes text
);

create index idx_cash_sessions_cashier on public.cash_sessions(cashier_id);
create index idx_cash_sessions_open on public.cash_sessions(closed_at) where closed_at is null;

-- =========================================================================
-- VENTAS
-- =========================================================================

create table public.sales (
  id uuid primary key default uuid_generate_v4(),
  invoice_number bigserial unique,
  cashier_id uuid not null references public.profiles(id),
  cash_session_id uuid references public.cash_sessions(id),
  customer_id uuid references public.customers(id),

  -- Totales en cada moneda (calculados por trigger)
  subtotal_usd numeric(14,2) not null default 0,
  total_usd numeric(14,2) not null default 0,

  -- Pago
  payment_method payment_method not null default 'efectivo',
  paid_currency currency not null default 'USD',
  paid_amount numeric(14,2) not null default 0,

  -- Tasas usadas en la venta (snapshot)
  rate_usd_ves numeric(14,4),
  rate_usd_cop numeric(14,4),

  status sale_status not null default 'completada',
  notes text,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,

  created_at timestamptz not null default now()
);

create index idx_sales_created on public.sales(created_at desc);
create index idx_sales_cashier on public.sales(cashier_id);
create index idx_sales_customer on public.sales(customer_id);
create index idx_sales_status on public.sales(status);

-- =========================================================================
-- DETALLE DE VENTAS
-- =========================================================================

create table public.sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null, -- snapshot por si se renombra el producto
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price_usd numeric(14,2) not null,
  unit_cost_usd numeric(14,4) not null default 0, -- snapshot del costo en el momento de la venta
  line_total_usd numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create index idx_sale_items_sale on public.sale_items(sale_id);
create index idx_sale_items_product on public.sale_items(product_id);

-- =========================================================================
-- COMPRAS A PROVEEDORES
-- =========================================================================

create table public.purchases (
  id uuid primary key default uuid_generate_v4(),
  reference text,
  supplier_id uuid references public.suppliers(id),
  purchase_date date not null default current_date,
  total_usd numeric(14,2) not null default 0,
  currency_paid currency not null default 'USD',
  rate_usd_ves numeric(14,4),
  rate_usd_cop numeric(14,4),
  notes text,
  registered_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_purchases_supplier on public.purchases(supplier_id);
create index idx_purchases_date on public.purchases(purchase_date desc);

create table public.purchase_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost_usd numeric(14,4) not null,
  line_total_usd numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create index idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index idx_purchase_items_product on public.purchase_items(product_id);

-- =========================================================================
-- KARDEX / MOVIMIENTOS DE INVENTARIO
-- =========================================================================

create table public.inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id),
  movement_type movement_type not null,
  quantity numeric(14,3) not null, -- positivo entrada, negativo salida
  balance_after numeric(14,3) not null,
  unit_cost_usd numeric(14,4),
  reference_type text, -- 'sale', 'purchase', 'adjustment'
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_movements_product on public.inventory_movements(product_id, created_at desc);
create index idx_movements_reference on public.inventory_movements(reference_type, reference_id);

-- =========================================================================
-- CRÉDITOS Y ABONOS
-- =========================================================================

create table public.credits (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.customers(id),
  sale_id uuid references public.sales(id),
  original_amount_usd numeric(14,2) not null,
  paid_amount_usd numeric(14,2) not null default 0,
  balance_usd numeric(14,2) generated always as (original_amount_usd - paid_amount_usd) stored,
  due_date date,
  status text not null default 'abierto', -- abierto / pagado / vencido
  notes text,
  created_at timestamptz not null default now()
);

create index idx_credits_customer on public.credits(customer_id);
create index idx_credits_status on public.credits(status);

create table public.credit_payments (
  id uuid primary key default uuid_generate_v4(),
  credit_id uuid not null references public.credits(id) on delete cascade,
  amount_usd numeric(14,2) not null check (amount_usd > 0),
  payment_method payment_method not null default 'efectivo',
  paid_currency currency not null default 'USD',
  paid_amount numeric(14,2) not null,
  rate_usd_ves numeric(14,4),
  rate_usd_cop numeric(14,4),
  registered_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_credit_payments_credit on public.credit_payments(credit_id);

-- =========================================================================
-- BITÁCORA DE AUDITORÍA
-- =========================================================================

create table public.audit_log (
  id bigserial primary key,
  user_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_user on public.audit_log(user_id);
create index idx_audit_entity on public.audit_log(entity_type, entity_id);
create index idx_audit_created on public.audit_log(created_at desc);

-- =========================================================================
-- TRIGGER: updated_at automático
-- =========================================================================

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger products_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();
