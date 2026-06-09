import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import SalesClient from '@/components/SalesClient';

export const dynamic = 'force-dynamic';

// Cuántas ventas cargar del servidor (afecta KPIs, stats y gráficos)
const ALLOWED_FETCH = [20, 50, 100, 200];
const DEFAULT_FETCH = 50;

export default async function VentasPage({ searchParams }) {
  const supabase = createClient();

  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);

  const role = profile?.role || 'cajero';

  // Sanitizar tamaño del dataset
  const requestedFetch = Number(searchParams?.fetch) || DEFAULT_FETCH;
  const fetchSize = ALLOWED_FETCH.includes(requestedFetch)
    ? requestedFetch
    : DEFAULT_FETCH;

  // Query — cajero solo ve las suyas. Pedimos count para mostrar totales reales
  // pero solo cargamos `fetchSize` registros para los KPIs y la tabla.
  let query = supabase
    .from('sales')
    .select(`
      id, invoice_number, total_usd, payment_method, paid_currency, paid_amount,
      status, created_at, voided_at, void_reason,
      profiles:cashier_id ( full_name ),
      customers ( name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(fetchSize);

  if (role === 'cajero') {
    query = query.eq('cashier_id', user.id);
  }

  const { data: sales, count } = await query;

  return (
    <SalesClient
      initialSales={sales || []}
      role={role}
      fetchSize={fetchSize}
      allowedFetch={ALLOWED_FETCH}
      totalCount={count || 0}
    />
  );
}
