-- =========================================================================
-- 022_add_binance_payment_method.sql
-- =========================================================================
-- Requisitos: 001-021 aplicadas.
--
-- Agrega 'binance' al enum payment_method para registrar cobros en USDT.
-- Binance/USDT es un método de monto exacto (sin vuelto) cobrado en dólares
-- (1 USDT = 1 USD).
--
-- Nota: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de un bloque de
-- transacción y el valor recién agregado no puede usarse en la misma
-- transacción, por eso esta migration NO usa begin/commit.
-- =========================================================================

alter type payment_method add value if not exists 'binance';
