import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import SalesClient from '@/components/SalesClient';

export const dynamic = 'force-dynamic';

// Tamaños del dataset a analizar. 'all' significa cargar TODAS las ventas
// (puede ser pesado si hay miles; es decisión explícita del usuario).
const ALLOWED_FETCH = [20, 50, 100, 200, 'all'];
const DEFAULT_FETCH = 50;

export default async function VentasPage({ searchParams }) {
  const supabase = createClient();

  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);

  const role = profile?.role || 'cajero';

  // Sanitizar tamaño del dataset
  const raw = searchParams?.fetch;
  let fetchSize = DEFAULT_FETCH;
  if (raw === 'all') {
    fetchSize = 'all';
  } else if (raw !== undefined) {
    const n = Number(raw);
    if (ALLOWED_FETCH.includes(n)) fetchSize = n;
  }

  // Query — cajero solo ve las suyas. Pedimos count para mostrar el total real
  let query = supabase
    .from('sales')
    .select(`
      id, invoice_number, total_usd, payment_method, paid_currency, paid_amount,
      status, created_at, voided_at, void_reason,
      profiles:cashier_id ( full_name ),
      customers ( name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  // Solo aplicar .limit() si NO se pidieron todas
  if (fetchSize !== 'all') {
    query = query.limit(fetchSize);
  }

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
