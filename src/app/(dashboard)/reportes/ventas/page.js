import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import SalesReport from '@/components/reports/SalesReport';
import { nDaysAgoStr, todayStr, rangeToIso, previousRange } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ReporteVentasPage({ searchParams }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();

  // Rango por defecto: últimos 30 días
  const from = searchParams?.from || nDaysAgoStr(29);
  const to   = searchParams?.to   || todayStr();
  const range = { from, to };
  const { fromIso, toIso } = rangeToIso(range);

  // Rango previo del mismo tamaño (comparativo)
  const prev = previousRange(range);
  const { fromIso: prevFromIso, toIso: prevToIso } = rangeToIso(prev);

  const [
    pnlRes, byCashierRes, byPaymentRes, byCategoryRes, byHourRes,
    prevPnlRes,
  ] = await Promise.all([
    supabase.from('v_pnl_daily').select('*').gte('day', from).lte('day', to).order('day'),
    supabase.from('v_sales_by_cashier').select('*').gte('day', from).lte('day', to),
    supabase.from('v_sales_by_payment').select('*').gte('day', from).lte('day', to),
    supabase.from('v_sales_by_category').select('*').gte('day', from).lte('day', to),
    supabase.from('v_sales_by_hour').select('*'),
    supabase.from('v_pnl_daily').select('*').gte('day', prev.from).lte('day', prev.to),
  ]);

  // Detectar si alguna vista no existe (migración no aplicada)
  const firstError = [pnlRes, byCashierRes, byPaymentRes, byCategoryRes, byHourRes, prevPnlRes]
    .find((r) => r.error)?.error?.message || null;

  return (
    <SalesReport
      initialRange={range}
      pnlDaily={pnlRes.data || []}
      byCashier={byCashierRes.data || []}
      byPayment={byPaymentRes.data || []}
      byCategory={byCategoryRes.data || []}
      byHour={byHourRes.data || []}
      previousPnl={prevPnlRes.data || []}
      previousRange={prev}
      error={firstError}
    />
  );
}
