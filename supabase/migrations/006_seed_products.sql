-- ===========================================================================
-- 006_seed_products.sql — Carga inicial del catálogo desde Rino_ver_3.xlsx
-- ===========================================================================
-- Productos cargados: 79
-- Con costo asignado:  73
-- Sin costo (cost_avg=0): 6
-- 
-- Idempotente: usa ON CONFLICT (sku) para que se pueda re-correr sin duplicar.
-- Los precios se actualizan en cada corrida; el stock NO se toca (el inventario
-- vive aparte, gestionado por compras y ventas).
-- ===========================================================================

begin;

-- 1. Categorías --------------------------------------------------------------
insert into public.categories (name, description, active) values
  ('Pollo', 'Categoría importada del Excel inicial', true),
  ('Huevos', 'Categoría importada del Excel inicial', true),
  ('Víveres', 'Categoría importada del Excel inicial', true),
  ('Charcutería', 'Categoría importada del Excel inicial', true),
  ('Hogar', 'Categoría importada del Excel inicial', true),
  ('Miscelánea', 'Categoría importada del Excel inicial', true)
on conflict (name) do nothing;

-- 2. Productos ---------------------------------------------------------------
with cat as (
  select id, name from public.categories
)
insert into public.products
  (sku, name, category_id, price_ves, price_cop, price_usd,
   cost_avg, cost_currency, target_margin, stock, min_stock, unit, active)
values
  ('POL-001', 'ENTERO', (select id from cat where name = 'Pollo'), 2307.69, 15000.00, 4.0541, 3.1944, 'USD', 21.2, 0, 0, 'unidad', true),
  ('POL-002', 'PECHUGA', (select id from cat where name = 'Pollo'), 2461.54, 16000.00, 4.3243, 3.1944, 'USD', 26.13, 0, 0, 'unidad', true),
  ('POL-003', 'MUSLO', (select id from cat where name = 'Pollo'), 2230.77, 14500.00, 3.9189, 3.1944, 'USD', 18.49, 0, 0, 'unidad', true),
  ('POL-004', 'ALAS', (select id from cat where name = 'Pollo'), 2230.77, 14500.00, 3.9189, 3.1944, 'USD', 18.49, 0, 0, 'unidad', true),
  ('POL-005', 'PATAS', (select id from cat where name = 'Pollo'), 1384.62, 9000.00, 2.4324, 1.9444, 'USD', 20.06, 0, 0, 'unidad', true),
  ('POL-006', 'MOLLEJA', (select id from cat where name = 'Pollo'), 1384.62, 9000.00, 2.4324, 1.9444, 'USD', 20.06, 0, 0, 'unidad', true),
  ('POL-007', 'HUESOS DE POLLO', (select id from cat where name = 'Pollo'), 384.62, 2500.00, 0.6757, 0.5556, 'USD', 17.78, 0, 0, 'unidad', true),
  ('HUE-001', 'CARTON', (select id from cat where name = 'Huevos'), 2615.38, 17000.00, 4.5946, 3.6806, 'USD', 19.89, 0, 0, 'unidad', true),
  ('HUE-002', 'MEDIO CARTON', (select id from cat where name = 'Huevos'), 1307.69, 8500.00, 2.2973, 1.8403, 'USD', 19.89, 0, 0, 'unidad', true),
  ('HUE-003', 'CAJA DETAL', (select id from cat where name = 'Huevos'), 25384.62, 165000.00, 44.5946, 51.2500, 'USD', 30.0, 0, 0, 'unidad', true),
  ('HUE-004', 'MEDIA CAJA', (select id from cat where name = 'Huevos'), 12692.31, 82500.00, 22.2973, 25.6250, 'USD', 30.0, 0, 0, 'unidad', true),
  ('HUE-005', 'CARTON PEQUEÑO', (select id from cat where name = 'Huevos'), 2000.00, 13000.00, 3.5135, 3.6111, 'USD', 30.0, 0, 0, 'unidad', true),
  ('HUE-006', 'CARTON GRANDE', (select id from cat where name = 'Huevos'), 3076.92, 20000.00, 5.4054, 5.5556, 'USD', 30.0, 0, 0, 'unidad', true),
  ('HUE-007', 'CAJA AL MAYOR', (select id from cat where name = 'Huevos'), 28038.46, 182250.00, 49.2568, 45.8333, 'USD', 6.95, 0, 0, 'unidad', true),
  ('HUE-008', 'CARTON AL MAYOR', (select id from cat where name = 'Huevos'), 2564.15, 16667.00, 4.5046, 3.8194, 'USD', 15.21, 0, 0, 'unidad', true),
  ('VIV-001', 'HARINA PAN', (select id from cat where name = 'Víveres'), 615.38, 4000.00, 1.0811, 1.3750, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-002', 'HARINA OZ', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 1.2917, 'USD', 4.42, 0, 0, 'unidad', true),
  ('VIV-003', 'HARINA LUCHA AREPA', (select id from cat where name = 'Víveres'), 692.31, 4500.00, 1.2162, 1.2375, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-004', 'HARINA LEUDANTE', (select id from cat where name = 'Víveres'), 692.31, 4500.00, 1.2162, 1.3611, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-005', 'AZUCAR MONTALBAN 1 KGS', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 0.0000, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-006', 'AZUCAR KONFIT 1GRS', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 0.0000, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-007', 'ARROZ MARY', (select id from cat where name = 'Víveres'), 646.15, 4200.00, 1.1351, 1.1692, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-008', 'ARROZ INNOVA', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 1.3500, 'USD', 0.1, 0, 0, 'unidad', true),
  ('VIV-009', 'ARROZ MASIA', (select id from cat where name = 'Víveres'), 692.31, 4500.00, 1.2162, 1.1111, 'USD', 8.64, 0, 0, 'unidad', true),
  ('VIV-010', 'ARROZ LUCHA', (select id from cat where name = 'Víveres'), 753.85, 4900.00, 1.3243, 1.2250, 'USD', 7.5, 0, 0, 'unidad', true),
  ('VIV-011', 'ACEITE MAZAITE 1L', (select id from cat where name = 'Víveres'), 2923.08, 19000.00, 5.1351, 4.2222, 'USD', 17.78, 0, 0, 'unidad', true),
  ('VIV-012', 'ACEITE COAMO 900ML', (select id from cat where name = 'Víveres'), 1692.31, 11000.00, 2.9730, 2.6389, 'USD', 11.24, 0, 0, 'unidad', true),
  ('VIV-013', 'ACEITE NATURA OIL 900ML', (select id from cat where name = 'Víveres'), 1923.08, 12500.00, 3.3784, 2.9631, 'USD', 12.29, 0, 0, 'unidad', true),
  ('VIV-014', 'ACEITE PUROGOLD 900ML', (select id from cat where name = 'Víveres'), 2153.85, 14000.00, 3.7838, 3.1375, 'USD', 17.08, 0, 0, 'unidad', true),
  ('VIV-015', 'ACEITE LUCHA 828ML', (select id from cat where name = 'Víveres'), 2000.00, 13000.00, 3.5135, 3.0000, 'USD', 14.62, 0, 0, 'unidad', true),
  ('VIV-016', 'ACEITE VATEL 1L', (select id from cat where name = 'Víveres'), 1846.15, 12000.00, 3.2432, 3.6111, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-017', 'CAFÉ KIWA 200 GR', (select id from cat where name = 'Víveres'), 1307.69, 8500.00, 2.2973, 2.2222, 'USD', 3.27, 0, 0, 'unidad', true),
  ('VIV-018', 'CAFÉ F. DE AMERICA 200G', (select id from cat where name = 'Víveres'), 1230.77, 8000.00, 2.1622, 2.0889, 'USD', 3.39, 0, 0, 'unidad', true),
  ('VIV-019', 'CAFÉ AROMA 250G', (select id from cat where name = 'Víveres'), 1384.62, 9000.00, 2.4324, 2.3150, 'USD', 4.83, 0, 0, 'unidad', true),
  ('VIV-020', 'PASTA CORTA CAPRI', (select id from cat where name = 'Víveres'), 1000.00, 6500.00, 1.7568, 1.5047, 'USD', 14.35, 0, 0, 'unidad', true),
  ('VIV-021', 'PASTA LARGA CAPRI', (select id from cat where name = 'Víveres'), 1000.00, 6500.00, 1.7568, 1.5047, 'USD', 14.35, 0, 0, 'unidad', true),
  ('VIV-022', 'PASTA LARGA MARY', (select id from cat where name = 'Víveres'), 1000.00, 6500.00, 1.7568, 1.6206, 'USD', 7.75, 0, 0, 'unidad', true),
  ('VIV-023', 'PASTA CORTA MARY', (select id from cat where name = 'Víveres'), 1000.00, 6500.00, 1.7568, 1.6206, 'USD', 7.75, 0, 0, 'unidad', true),
  ('VIV-024', 'MARGAR MAVES 500GR', (select id from cat where name = 'Víveres'), 1200.00, 7800.00, 2.1081, 2.5928, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-025', 'MARGAR NELLY 500GR', (select id from cat where name = 'Víveres'), 1384.62, 9000.00, 2.4324, 2.3875, 'USD', 1.85, 0, 0, 'unidad', true),
  ('VIV-026', 'MARGAR INNOVA 500GR', (select id from cat where name = 'Víveres'), 1307.69, 8500.00, 2.2973, 2.1750, 'USD', 5.32, 0, 0, 'unidad', true),
  ('VIV-027', 'MAYONESA MAVESA 445GR', (select id from cat where name = 'Víveres'), 2692.31, 17500.00, 4.7297, 4.2825, 'USD', 9.46, 0, 0, 'unidad', true),
  ('VIV-028', 'MAYONESA INNOVA 445GR', (select id from cat where name = 'Víveres'), 2076.92, 13500.00, 3.6486, 3.1000, 'USD', 15.04, 0, 0, 'unidad', true),
  ('VIV-029', 'MAYONESA MAVESA 175 GR', (select id from cat where name = 'Víveres'), 1166.77, 7584.00, 2.0497, 2.5000, 'USD', 30.0, 0, 0, 'unidad', true),
  ('VIV-030', 'SALSA HEIZ 397 G', (select id from cat where name = 'Víveres'), 1353.85, 8800.00, 2.3784, 2.2375, 'USD', 5.92, 0, 0, 'unidad', true),
  ('VIV-031', 'SALSA PAMPERO  397G', (select id from cat where name = 'Víveres'), 1230.77, 8000.00, 2.1622, 2.0447, 'USD', 5.43, 0, 0, 'unidad', true),
  ('VIV-032', 'SALSA TIQUIRE 397G', (select id from cat where name = 'Víveres'), 1076.92, 7000.00, 1.8919, 1.8519, 'USD', 2.11, 0, 0, 'unidad', true),
  ('VIV-033', 'MOSTAZA HEINZ 195 GR.', (select id from cat where name = 'Víveres'), 1353.85, 8800.00, 2.3784, 2.1125, 'USD', 11.18, 0, 0, 'unidad', true),
  ('VIV-034', 'LECHE LIQUIDA LATTI', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 1.1344, 'USD', 16.05, 0, 0, 'unidad', true),
  ('VIV-035', 'COMBO DE SALSAS', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 1.1806, 'USD', 12.64, 0, 0, 'unidad', true),
  ('VIV-036', 'SUNTEA', (select id from cat where name = 'Víveres'), 230.77, 1500.00, 0.4054, 0.3242, 'USD', 20.04, 0, 0, 'unidad', true),
  ('VIV-037', 'PANELA', (select id from cat where name = 'Víveres'), 384.62, 2500.00, 0.6757, 0.3936, 'USD', 41.75, 0, 0, 'unidad', true),
  ('VIV-038', 'COMBOS DE PANELAX3', (select id from cat where name = 'Víveres'), 769.23, 5000.00, 1.3514, 1.1806, 'USD', 12.64, 0, 0, 'unidad', true),
  ('VIV-039', 'SAL BAHÍA', (select id from cat where name = 'Víveres'), 538.46, 3500.00, 0.9459, 0.8000, 'USD', 15.43, 0, 0, 'unidad', true),
  ('VIV-040', 'VINAGRE MAVESA 1 LT', (select id from cat where name = 'Víveres'), 1230.77, 8000.00, 2.1622, 1.9500, 'USD', 9.81, 0, 0, 'unidad', true),
  ('VIV-041', 'VINAGRE 1 LT', (select id from cat where name = 'Víveres'), 707.69, 4600.00, 1.2432, 0.0000, 'USD', 30.0, 0, 0, 'unidad', true),
  ('CHA-001', 'QUESO BLANCO DURO', (select id from cat where name = 'Charcutería'), 3538.46, 23000.00, 6.2162, 5.5556, 'USD', 10.63, 0, 0, 'unidad', true),
  ('CHA-002', 'QUESO MOZZARELLA', (select id from cat where name = 'Charcutería'), 3538.46, 23000.00, 6.2162, 5.5556, 'USD', 10.63, 0, 0, 'unidad', true),
  ('CHA-003', 'SALCHICHAS CON TOC/QUE', (select id from cat where name = 'Charcutería'), 3384.62, 22000.00, 5.9459, 5.1389, 'USD', 13.57, 0, 0, 'unidad', true),
  ('HOG-001', 'SERVILLETAS PEQUEÑA', (select id from cat where name = 'Hogar'), 615.38, 4000.00, 1.0811, 0.7475, 'USD', 30.86, 0, 0, 'unidad', true),
  ('HOG-002', 'JABON BONAROPA POLVO', (select id from cat where name = 'Hogar'), 1076.92, 7000.00, 1.8919, 1.6944, 'USD', 10.44, 0, 0, 'unidad', true),
  ('HOG-003', 'JABON MULTI CLEAN POLVO 400G', (select id from cat where name = 'Hogar'), 769.23, 5000.00, 1.3514, 1.0586, 'USD', 21.66, 0, 0, 'unidad', true),
  ('HOG-004', 'JABON MULTI CLEAN POLVO 900G', (select id from cat where name = 'Hogar'), 1384.62, 9000.00, 2.4324, 2.3056, 'USD', 5.22, 0, 0, 'unidad', true),
  ('HOG-005', 'JABON PANELA AZUL LLAVES-P', (select id from cat where name = 'Hogar'), 769.23, 5000.00, 1.3514, 1.2500, 'USD', 7.5, 0, 0, 'unidad', true),
  ('HOG-006', 'LAVAPLATOS AGENTEX 500GRS', (select id from cat where name = 'Hogar'), 615.38, 4000.00, 1.0811, 0.7986, 'USD', 26.13, 0, 0, 'unidad', true),
  ('HOG-007', 'CREMA DENTAL FLUO CARDEN', (select id from cat where name = 'Hogar'), 461.54, 3000.00, 0.8108, 0.7872, 'USD', 2.91, 0, 0, 'unidad', true),
  ('HOG-008', 'CREMA DENTAL COLGATE 60 ML', (select id from cat where name = 'Hogar'), 538.46, 3500.00, 0.9459, 0.8567, 'USD', 9.44, 0, 0, 'unidad', true),
  ('HOG-009', 'JABON DE BAÑO', (select id from cat where name = 'Hogar'), 307.69, 2000.00, 0.5405, 0.4167, 'USD', 22.92, 0, 0, 'unidad', true),
  ('HOG-010', 'TOALLIN', (select id from cat where name = 'Hogar'), 461.54, 3000.00, 0.8108, 0.0000, 'USD', 30.0, 0, 0, 'unidad', true),
  ('HOG-011', 'PAPEL RENDY DUO', (select id from cat where name = 'Hogar'), 692.31, 4500.00, 1.2162, 1.0881, 'USD', 10.54, 0, 0, 'unidad', true),
  ('MIS-001', 'BOLSA DE HIELO 8KGS', (select id from cat where name = 'Miscelánea'), 538.46, 3500.00, 0.9459, 0.2778, 'USD', 70.63, 0, 0, 'unidad', true),
  ('MIS-002', 'BOLSA DE HIELO PEQUENA 5KGS', (select id from cat where name = 'Miscelánea'), 384.62, 2500.00, 0.6757, 0.1667, 'USD', 75.33, 0, 0, 'unidad', true),
  ('MIS-003', 'BOLSA DE HIELO 8 KGS AL MAYOR', (select id from cat where name = 'Miscelánea'), 384.62, 2500.00, 0.6757, 0.2222, 'USD', 67.11, 0, 0, 'unidad', true),
  ('MIS-004', 'BOLSA DE HIELO 5 KGS AL MAYOR', (select id from cat where name = 'Miscelánea'), 384.62, 2500.00, 0.6757, 0.1389, 'USD', 79.44, 0, 0, 'unidad', true),
  ('MIS-005', 'COCA COLA Y REFRESCOS 2LTS', (select id from cat where name = 'Miscelánea'), 769.23, 5000.00, 1.3514, 1.7131, 'USD', 30.0, 0, 0, 'unidad', true),
  ('MIS-006', 'PEPSI COLA Y REFRESCOS 2LTS', (select id from cat where name = 'Miscelánea'), 1076.92, 7000.00, 1.8919, 1.5742, 'USD', 16.79, 0, 0, 'unidad', true),
  ('MIS-007', 'ASPEED MAX 269 ml', (select id from cat where name = 'Miscelánea'), 307.69, 2000.00, 0.5405, 0.3706, 'USD', 31.45, 0, 0, 'unidad', true),
  ('MIS-008', 'MALTA', (select id from cat where name = 'Miscelánea'), 307.69, 2000.00, 0.5405, 0.0000, 'USD', 30.0, 0, 0, 'unidad', true),
  ('MIS-009', 'CREMA DE LECHE LATTI', (select id from cat where name = 'Miscelánea'), 461.54, 3000.00, 0.8108, 0.0000, 'USD', 30.0, 0, 0, 'unidad', true)
on conflict (sku) do update set
  name         = excluded.name,
  category_id  = excluded.category_id,
  price_ves    = excluded.price_ves,
  price_cop    = excluded.price_cop,
  price_usd    = excluded.price_usd,
  cost_avg     = excluded.cost_avg,
  active       = excluded.active,
  updated_at   = now();

commit;

-- ===========================================================================
-- AVISO: 6 productos quedaron con cost_avg = 0:
--   [Víveres] AZUCAR MONTALBAN 1 KGS
--   [Víveres] AZUCAR KONFIT 1GRS
--   [Víveres] VINAGRE 1 LT
--   [Hogar] TOALLIN
--   [Miscelánea] MALTA
--   [Miscelánea] CREMA DE LECHE LATTI
-- Revisa estos costos manualmente desde la página de productos del sistema
-- antes de habilitar las alertas de margen negativo.
-- ===========================================================================