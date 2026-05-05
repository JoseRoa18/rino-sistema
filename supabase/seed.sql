-- =========================================================================
-- SISTEMA RINO - DATOS INICIALES (SEED)
-- =========================================================================

-- Categorías base (de la propuesta: Pollo, Huevos, Víveres, Charcutería, Hogar y Miscelánea)
insert into public.categories (name, description) values
  ('Pollo', 'Productos avícolas frescos y congelados'),
  ('Huevos', 'Huevos por unidad y por cartón'),
  ('Víveres', 'Granos, harinas, aceite y abarrotes en general'),
  ('Charcutería', 'Embutidos y quesos'),
  ('Hogar', 'Artículos de limpieza y hogar'),
  ('Miscelánea', 'Productos varios')
on conflict (name) do nothing;

-- Tasa cambiaria semilla (se actualiza automáticamente con el cron)
insert into public.exchange_rates (rate_date, usd_ves_paralelo, usd_ves_bcv, usd_cop, source)
values (current_date, 40.50, 38.75, 4150.00, 'seed')
on conflict (rate_date) do nothing;

-- =========================================================================
-- IMPORTANTE: el primer usuario admin se crea desde la consola de Supabase:
--   1) Authentication -> Users -> Add user (email + contraseña)
--   2) Luego ejecutar:
--        update public.profiles set role = 'admin' where email = 'tu_email@dominio.com';
--   3) Si no existe perfil aún, créalo manualmente:
--        insert into public.profiles (id, full_name, email, role)
--        select id, 'Tu Nombre', email, 'admin' from auth.users where email = 'tu_email@dominio.com';
-- =========================================================================
