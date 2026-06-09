import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getCurrentProfile } from '@/lib/auth';
import { getCachedLatestRate } from '@/lib/cached-data';
import CajaClient from '@/components/CajaClient';

export const dynamic = 'force-dynamic';

export default async function CajaPage({ searchParams }) {
  const supabase = createClient();

  const [user, profile, rate] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getCachedLatestRate(),
  ]);

  const role = profile?.role || 'cajero';

  // Fecha por defecto: hoy en zona horaria de Caracas
  const now = new Date();
  const veNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const yyyy = veNow.getFullYear();
  const mm = String(veNow.getMonth() + 1).padStart(2, '0');
  const dd = String(veNow.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const date = searchParams?.date || todayStr;

  // Calcular bounds del día en VE (UTC-4) → ISO UTC para query
  const startVE = new Date(`${date}T00:00:00-04:00`);
  const endVE = new Date(`${date}T23:59:59.999-04:00`);

  // Cajero ve solo sus ventas; admin/supervisor ven todas
  let query = supabase
    .from('sales')
    .select(`
      id, total_usd, payment_method, paid_currency, paid_amount,
      status, created_at, cashier_id,
      profiles:cashier_id ( full_name )
    `)
    .gte('created_at', startVE.toISOString())
    .lte('created_at', endVE.toISOString())
    .eq('status', 'completada')
    .order('created_at', { ascending: false });

  if (role === 'cajero') {
    query = query.eq('cashier_id', user.id);
  }

  const { data: sales } = await query;

  // sale_items del día con cashier_id (para agrupar por categoría en cliente
  // y reaccionar al filtro "Todos los cajeros" / cajero específico).
  let saleItems = [];
  const saleIdsRaw = (sales || []).map((s) => s.id);
  if (saleIdsRaw.length > 0) {
    const { data: items } = await supabase
      .from('sale_items')
      .select(`
        sale_id, quantity, unit_cost_usd, line_total_usd,
        sales:sale_id ( cashier_id ),
        products:product_id ( category_id, categories ( name ) )
      `)
      .in('sale_id', saleIdsRaw);
    saleItems = (items || []).map((it) => ({
      sale_id:       it.sale_id,
      cashier_id:    it.sales?.cashier_id || null,
      category_name: it.products?.categories?.name || 'Sin categoría',
      quantity:      Number(it.quantity) || 0,
      line_total_usd: Number(it.line_total_usd) || 0,
      cost_total_usd: (Number(it.unit_cost_usd) || 0) * (Number(it.quantity) || 0),
    }));
  }

  // Lista de cajeros disponibles (solo para admin/supervisor)
  let cashiers = [];
  if (role !== 'cajero') {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('active', true)
      .order('full_name');
    cashiers = data || [];
  }

  // Cierre del día (si existe) — solo admin/supervisor lo consultan
  let dailyClose = null;
  if (role !== 'cajero') {
    const { data } = await supabase
      .from('daily_closes')
      .select('*, profiles:closed_by ( full_name )')
      .eq('close_date', date)
      .maybeSingle();
    dailyClose = data || null;
  }

  return (
    <CajaClient
      initialSales={sales || []}
      initialSaleItems={saleItems}
      role={role}
      cashiers={cashiers}
      date={date}
      todayStr={todayStr}
      rate={rate || {}}
      dailyClose={dailyClose}
    />
  );
}
