-- =========================================================================
-- 021_migrate_transferencia_to_pagomovil.sql
-- =========================================================================
-- Requisitos: 001-020 aplicadas.
--
-- Como decisión de negocio: 'transferencia' y 'pago_movil' son
-- esencialmente lo mismo en este contexto. Reconvertimos todos los
-- registros históricos para unificar el método.
--
-- NO se borra el valor 'transferencia' del enum payment_method para
-- evitar romper el rollback. Si en el futuro quieres limpiar el enum,
-- una migration aparte puede hacerlo con seguridad.
-- =========================================================================

begin;

-- Ventas: cambiar payment_method de transferencia a pago_movil
update public.sales
set payment_method = 'pago_movil'
where payment_method = 'transferencia';

-- Abonos a créditos de clientes
update public.credit_payments
set payment_method = 'pago_movil'
where payment_method = 'transferencia';

-- Abonos a créditos de proveedores (si la tabla existe)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'supplier_credit_payments'
  ) then
    execute $sql$
      update public.supplier_credit_payments
      set payment_method = 'pago_movil'
      where payment_method = 'transferencia';
    $sql$;
  end if;
end $$;

-- Auditoría: dejar constancia del cambio masivo
insert into public.audit_log (user_id, action, entity_type, entity_id, details)
values (
  null, 'migrate_transferencia_to_pago_movil', 'system', null,
  jsonb_build_object(
    'reason', 'Decisión de negocio: transferencia y pago_movil son el mismo método operativo',
    'migration', '021_migrate_transferencia_to_pagomovil.sql'
  )
);

commit;
