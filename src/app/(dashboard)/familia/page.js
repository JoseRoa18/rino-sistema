import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import FamilyClient from '@/components/FamilyClient';

export const dynamic = 'force-dynamic';

export default async function FamiliaPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();

  const [kpisRes, dailyRes, topRes, recentRes, productsRes] = await Promise.all([
    supabase.from('v_family_kpis').select('*').maybeSingle(),
    supabase.from('v_family_consumption_daily').select('*').limit(60),
    supabase
      .from('v_family_top_products')
      .select('*')
      .order('units_consumed', { ascending: false })
      .limit(20),
    // Últimos 30 consumos (sales con is_internal=true)
    supabase
      .from('sales')
      .select(`
        id, invoice_number, total_usd, status, notes, created_at,
        voided_at, void_reason,
        profiles:cashier_id ( full_name ),
        sale_items (
          id, product_name, quantity, unit_cost_usd, line_total_usd
        )
      `)
      .eq('is_internal', true)
      .order('created_at', { ascending: false })
      .limit(30),
    // Productos activos para el formulario
    supabase
      .from('products')
      .select('id, sku, name, unit, stock, cost_avg, category_id')
      .eq('active', true)
      .order('name'),
  ]);

  const firstError = [kpisRes, dailyRes, topRes, recentRes, productsRes]
    .find((r) => r.error)?.error?.message || null;

  return (
    <FamilyClient
      kpis={kpisRes.data || {}}
      daily={dailyRes.data || []}
      topProducts={topRes.data || []}
      recentConsumptions={recentRes.data || []}
      products={productsRes.data || []}
      role={profile.role}
      error={firstError}
    />
  );
}
