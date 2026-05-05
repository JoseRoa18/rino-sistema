import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import SalesClient from '@/components/SalesClient';

export const dynamic = 'force-dynamic';

export default async function VentasPage() {
  const supabase = createClient();

  const [user, profile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
  ]);

  const role = profile?.role || 'cajero';

  // Cajero ve solo sus propias ventas; admin/supervisor ven todas
  let query = supabase
    .from('sales')
    .select(`
      id, invoice_number, total_usd, payment_method, paid_currency, paid_amount,
      status, created_at, voided_at, void_reason,
      profiles:cashier_id ( full_name ),
      customers ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (role === 'cajero') {
    query = query.eq('cashier_id', user.id);
  }

  const { data: sales } = await query;

  return <SalesClient initialSales={sales || []} role={role} />;
}
