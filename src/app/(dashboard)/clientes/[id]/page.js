import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import CustomerDetailClient from '@/components/CustomerDetailClient';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const { id } = params;
  const supabase = createClient();

  // Stats agregadas + fila base del cliente (por si el agregado falla por RLS,
  // queremos confirmar 404 vs 0-data)
  const [statsRes, customerRes] = await Promise.all([
    supabase.from('v_customer_stats').select('*').eq('customer_id', id).maybeSingle(),
    supabase.from('customers').select('*').eq('id', id).maybeSingle(),
  ]);

  if (!customerRes.data) notFound();

  const stats = statsRes.data || {
    customer_id:           customerRes.data.id,
    name:                  customerRes.data.name,
    document_id:           customerRes.data.document_id,
    phone:                 customerRes.data.phone,
    email:                 customerRes.data.email,
    address:               customerRes.data.address,
    credit_limit_usd:      customerRes.data.credit_limit_usd,
    customer_type:         customerRes.data.customer_type,
    active:                customerRes.data.active,
    tags:                  customerRes.data.tags || [],
    birthday:              customerRes.data.birthday,
    notes:                 customerRes.data.notes,
    created_at:            customerRes.data.created_at,
    total_spent_usd:       0,
    sales_count:           0,
    avg_ticket_usd:        0,
    last_sale_at:          null,
    first_sale_at:         null,
    ar_balance_usd:        0,
    open_credits_count:    0,
    overdue_count:         0,
    overdue_balance_usd:   0,
    days_since_last_sale:  null,
    credit_available_usd:  customerRes.data.credit_limit_usd || 0,
    is_over_limit:         false,
  };

  const role = profile.role;
  const canSeeCredits = role === 'admin' || role === 'supervisor';

  // Fetches en paralelo
  const promises = [
    // Últimas 50 ventas del cliente
    supabase
      .from('sales')
      .select('id, invoice_number, total_usd, payment_method, paid_currency, status, created_at, voided_at, void_reason')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    // Top productos del cliente
    supabase
      .from('v_customer_top_products')
      .select('*')
      .eq('customer_id', id)
      .order('total_spent_usd', { ascending: false })
      .limit(10),
    // Gasto mensual (12 meses)
    supabase
      .from('v_customer_monthly_spending')
      .select('*')
      .eq('customer_id', id)
      .order('month'),
  ];

  if (canSeeCredits) {
    // Créditos del cliente con sus pagos anidados (PostgREST embedded select)
    promises.push(
      supabase
        .from('credits')
        .select(`
          id, sale_id, original_amount_usd, paid_amount_usd, balance_usd,
          due_date, status, notes, created_at,
          credit_payments (
            id, amount_usd, payment_method, paid_currency, paid_amount,
            created_at, notes, registered_by,
            profiles:registered_by ( full_name )
          )
        `)
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
    );
  }

  const results = await Promise.all(promises);
  const sales            = results[0].data || [];
  const topProducts      = results[1].data || [];
  const monthlySpending  = results[2].data || [];
  const creditsRaw       = canSeeCredits ? (results[3].data || []) : [];

  // Aplanar pagos para que el cliente los procese (más fácil que mantener la estructura anidada)
  const credits = creditsRaw.map(({ credit_payments, ...rest }) => rest);
  const payments = creditsRaw.flatMap((c) =>
    (c.credit_payments || []).map((p) => ({ ...p, credit_id: c.id }))
  );

  return (
    <CustomerDetailClient
      stats={stats}
      sales={sales}
      topProducts={topProducts}
      monthlySpending={monthlySpending}
      credits={credits}
      payments={payments}
      role={role}
    />
  );
}