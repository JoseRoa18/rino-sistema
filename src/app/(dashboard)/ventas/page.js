import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import SalesClient from '@/components/SalesClient';

export const dynamic = 'force-dynamic';

// Tamaños de página permitidos (sincronizados con el selector del cliente).
const ALLOWED_PER_PAGE = [10, 20, 50, 100, 200, 500];
const DEFAULT_PER_PAGE = 20;

export default async function VentasPage({ searchParams }) {
  const supabase = createClient();

  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);

  const role = profile?.role || 'cajero';

  // Sanitizar parámetros de paginación
  const requestedPerPage = Number(searchParams?.perPage) || DEFAULT_PER_PAGE;
  const perPage = ALLOWED_PER_PAGE.includes(requestedPerPage)
    ? requestedPerPage
    : DEFAULT_PER_PAGE;

  const requestedPage = Math.max(1, Number(searchParams?.page) || 1);
  const from = (requestedPage - 1) * perPage;
  const to = from + perPage - 1;

  // Query base — cajero solo ve las suyas
  let query = supabase
    .from('sales')
    .select(`
      id, invoice_number, total_usd, payment_method, paid_currency, paid_amount,
      status, created_at, voided_at, void_reason,
      profiles:cashier_id ( full_name ),
      customers ( name )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (role === 'cajero') {
    query = query.eq('cashier_id', user.id);
  }

  const { data: sales, count } = await query;

  const totalCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  // Si el usuario pidió una página fuera de rango, reflejamos la última real
  const currentPage = Math.min(requestedPage, totalPages);

  return (
    <SalesClient
      initialSales={sales || []}
      role={role}
      pagination={{
        page: currentPage,
        perPage,
        totalCount,
        totalPages,
        allowedPerPage: ALLOWED_PER_PAGE,
      }}
    />
  );
}
