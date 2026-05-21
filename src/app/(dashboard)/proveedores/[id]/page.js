import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import SupplierDetailClient from '@/components/SupplierDetailClient';

export const dynamic = 'force-dynamic';

export default async function SupplierDetailPage({ params }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const { id } = params;
  const supabase = createClient();

  // Stats agregadas + fila base (por si la vista no devuelve por RLS o no
  // hay compras todavía)
  const [statsRes, supplierRes] = await Promise.all([
    supabase.from('v_supplier_stats').select('*').eq('supplier_id', id).maybeSingle(),
    supabase.from('suppliers').select('*').eq('id', id).maybeSingle(),
  ]);

  if (!supplierRes.data) notFound();

  const stats = statsRes.data || {
    supplier_id:               supplierRes.data.id,
    name:                      supplierRes.data.name,
    contact_name:              supplierRes.data.contact_name,
    phone:                     supplierRes.data.phone,
    email:                     supplierRes.data.email,
    invoicing_currency:        supplierRes.data.invoicing_currency,
    payment_terms:             supplierRes.data.payment_terms,
    notes:                     supplierRes.data.notes,
    active:                    supplierRes.data.active,
    tags:                      supplierRes.data.tags || [],
    created_at:                supplierRes.data.created_at,
    updated_at:                supplierRes.data.updated_at,
    total_purchased_usd:       0,
    purchases_count:           0,
    avg_purchase_usd:          0,
    last_purchase_at:          null,
    first_purchase_at:         null,
    ap_balance_usd:            0,
    open_credits_count:        0,
    overdue_count:             0,
    overdue_balance_usd:       0,
    days_since_last_purchase:  null,
  };

  // Fetches en paralelo
  const [purchasesRes, topProductsRes, monthlyRes, creditsRes] = await Promise.all([
    // Últimas 50 compras al proveedor
    supabase
      .from('purchases')
      .select(`
        id, reference, total_usd, currency_paid, purchase_date, notes, created_at,
        profiles:registered_by ( full_name )
      `)
      .eq('supplier_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    // Top productos
    supabase
      .from('v_supplier_top_products')
      .select('*')
      .eq('supplier_id', id)
      .order('total_spent_usd', { ascending: false })
      .limit(10),
    // Compras mensuales (12 meses)
    supabase
      .from('v_supplier_monthly_purchases')
      .select('*')
      .eq('supplier_id', id)
      .order('month'),
    // Cuentas por pagar con pagos anidados
    supabase
      .from('supplier_credits')
      .select(`
        id, purchase_id, original_amount_usd, paid_amount_usd, balance_usd,
        due_date, status, notes, created_at,
        supplier_credit_payments (
          id, amount_usd, payment_method, paid_currency, paid_amount,
          created_at, notes, registered_by,
          profiles:registered_by ( full_name )
        )
      `)
      .eq('supplier_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const purchases     = purchasesRes.data     || [];
  const topProducts   = topProductsRes.data   || [];
  const monthly       = monthlyRes.data       || [];
  const creditsRaw    = creditsRes.data       || [];

  // Aplanar pagos para que el cliente los procese
  const credits = creditsRaw.map(({ supplier_credit_payments, ...rest }) => rest);
  const payments = creditsRaw.flatMap((c) =>
    (c.supplier_credit_payments || []).map((p) => ({ ...p, credit_id: c.id }))
  );

  return (
    <SupplierDetailClient
      stats={stats}
      purchases={purchases}
      topProducts={topProducts}
      monthly={monthly}
      credits={credits}
      payments={payments}
      role={profile.role}
    />
  );
}
