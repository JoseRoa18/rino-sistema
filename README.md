# Sistema Rino — Semanas 1 y 2

Plataforma web de gestión comercial multi-moneda construida sobre **Next.js 14 + Supabase + Tailwind**.

Esta entrega cubre las **Semanas 1 y 2** del roadmap definido en la propuesta:

- **Semana 1** — configuración del proyecto, base de datos en Supabase, autenticación de usuarios y estructura base.
- **Semana 2** — módulo de ventas (POS), catálogo de productos, tasas cambiarias automáticas y dashboard inicial.

Las páginas de Inventario, Clientes, Créditos, Proveedores y Reportes existen como stubs y se desarrollarán en la Semana 3.

---

## 📋 Contenido de la entrega

```
rino-sistema/
├── package.json
├── next.config.mjs
├── jsconfig.json
├── tailwind.config.js
├── postcss.config.mjs
├── vercel.json                 ← cron jobs para Vercel
├── .env.local.example
├── .gitignore
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql        ← TODAS las tablas
│   │   ├── 002_rls_policies.sql          ← seguridad por rol
│   │   └── 003_functions_triggers.sql    ← lógica de negocio
│   └── seed.sql                          ← datos iniciales
│
└── src/
    ├── middleware.js                     ← guarda rutas privadas
    ├── app/
    │   ├── layout.js, page.js, globals.css
    │   ├── login/page.js
    │   ├── (dashboard)/
    │   │   ├── layout.js                 ← sidebar + topbar
    │   │   ├── dashboard/page.js         ← KPIs + gráficos
    │   │   ├── pos/page.js               ← punto de venta
    │   │   ├── productos/page.js         ← catálogo CRUD
    │   │   ├── tasas/page.js             ← tasas cambiarias
    │   │   ├── usuarios/page.js          ← admin de usuarios
    │   │   └── (otros stubs)
    │   └── api/cron/exchange-rates/route.js
    ├── components/
    │   ├── Sidebar.js, TopBar.js, KPICard.js, SalesChart.js
    │   ├── ProductForm.js, ProductsClient.js, RatesClient.js
    │   └── pos/POSInterface.js
    └── lib/
        ├── supabase/{client,server,middleware}.js
        ├── exchange-rates.js             ← integración Yadio + ExchangeRate-API
        └── pricing.js                    ← promedio ponderado, conversión
```

---

## 🚀 Puesta en marcha

### 1) Crear proyecto en Supabase

1. Entra a https://supabase.com y crea un nuevo proyecto.
2. En **Project Settings → API** copia el `Project URL` y la `anon key` (también la `service_role key`).

### 2) Aplicar el esquema de base de datos

En el panel de Supabase ve a **SQL Editor** y ejecuta los archivos en este orden:

1. `supabase/migrations/001_initial_schema.sql` — crea todas las tablas, índices y enums.
2. `supabase/migrations/002_rls_policies.sql` — activa RLS y políticas por rol.
3. `supabase/migrations/003_functions_triggers.sql` — instala los triggers (promedio ponderado del costo, descuento de stock al vender, anulaciones, totales automáticos) y la RPC `register_sale`.
4. `supabase/seed.sql` — inserta categorías base y la primera tasa.

### 3) Crear el primer usuario administrador

1. **Authentication → Users → Add user** — crea un usuario con email y contraseña.
2. En **SQL Editor** ejecuta:
   ```sql
   insert into public.profiles (id, full_name, email, role)
   select id, 'Tu Nombre', email, 'admin'
   from auth.users
   where email = 'tu_email@ejemplo.com'
   on conflict (id) do update set role = 'admin';
   ```

### 4) Configurar variables de entorno

```bash
cp .env.local.example .env.local
```

Completa los valores con los de tu proyecto Supabase. Genera un `CRON_SECRET` aleatorio largo (puedes usar `openssl rand -hex 32`).

### 5) Instalar dependencias y arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:3000 — el sistema redirige a `/login`.

### 6) Despliegue en Vercel

1. Sube el código a GitHub.
2. Importa el repo en https://vercel.com.
3. Configura las mismas variables de entorno en **Project Settings → Environment Variables**.
4. Vercel detectará automáticamente el `vercel.json` y programará el cron de tasas.

---

## 🧠 Cómo funciona el promedio ponderado

Esto es lo que mencionaste en la conversación — vive directamente en la base de datos como un trigger (`tg_purchase_item_apply`). Cada vez que se inserta una fila en `purchase_items`:

```
nuevo_costo_promedio = (stock_actual × costo_actual + cantidad_compra × costo_compra)
                       / (stock_actual + cantidad_compra)
```

**Ejemplo del cliente:**

| Día | Stock previo | Costo previo | Compra | Costo compra | Stock nuevo | Costo nuevo |
|-----|--------------|--------------|--------|--------------|-------------|-------------|
| 1   | 0            | $0           | 1      | $10          | 1           | $10.00      |
| 2   | 1            | $10.00       | 1      | $11          | 2           | $10.50      |
| 3   | 2            | $10.50       | 1      | $8           | 3           | $9.6667     |

El precio de venta sugerido se recalcula automáticamente con el `target_margin` que tenga configurado el producto (por defecto 30%).

---

## 👥 Roles y permisos

| Rol         | Dashboard | POS | Productos       | Costos | Tasas | Reportes | Usuarios |
|-------------|-----------|-----|-----------------|--------|-------|----------|----------|
| admin       | ✅        | ✅  | crear/editar    | ✅     | crear | ✅       | ✅       |
| supervisor  | ✅        | ✅  | crear/editar    | ✅     | crear | ✅       | ❌       |
| **cajero**  | ❌        | ✅  | solo lectura    | ❌     | leer  | ❌       | ❌       |

El cajero **no ve costos ni ganancias** — esto se aplica tanto en RLS como en los componentes (los campos de costo no se renderizan si el rol no es admin).

---

## 💱 Tasas cambiarias automáticas

- **Yadio.io** — USD/VES paralelo (mercado libre venezolano).
- **ExchangeRate-API** — USD/COP.
- **BCV** — placeholder; el admin puede llenar el valor manualmente o se integra después con un scraper.

El cron está configurado en `vercel.json` para correr todos los días a las **11:00 UTC (≈7 AM Venezuela)**:

```json
{
  "crons": [
    { "path": "/api/cron/exchange-rates", "schedule": "0 11 * * *" }
  ]
}
```

El admin también tiene un botón **Actualizar ahora** en la página de Tasas.

---

## ✅ Qué está incluido en esta entrega (Semanas 1 y 2)

- [x] Proyecto Next.js 14 con App Router y JavaScript.
- [x] Esquema completo de base de datos (15 tablas, vistas, índices).
- [x] Row Level Security con 3 roles.
- [x] Triggers de negocio: promedio ponderado, descuento de stock, anulaciones.
- [x] RPC `register_sale` para venta atómica desde el POS.
- [x] Autenticación con Supabase Auth (email + contraseña).
- [x] Middleware que protege rutas privadas.
- [x] Layout con sidebar y topbar (con tasas en vivo).
- [x] **POS** con búsqueda, categorías, carrito, multi-moneda, pago a crédito.
- [x] **Catálogo** de productos con CRUD (admin) y vista (cajero, sin costos).
- [x] **Dashboard** con 7 KPIs y gráfico de ventas de 30 días.
- [x] **Tasas cambiarias** automáticas + endpoint cron + UI manual.
- [x] **Usuarios** (vista de admin).

## 🔜 Próximas semanas (no incluido aquí)

- **Semana 3** — Inventario (kardex completo), costos, alertas, cuentas por cobrar, proveedores.
- **Semana 4** — Reportes en PDF/Excel, migración de datos del Excel actual, capacitación.

---

## 📞 Notas

Cuando me pases el Excel con todos los productos del negocio, lo convierto a un `seed_products.sql` o a un script de importación que carga las ~398 SKUs (o las que sean) directamente a `products`, asignando categorías y costos iniciales.
