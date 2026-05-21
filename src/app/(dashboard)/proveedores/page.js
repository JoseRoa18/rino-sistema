import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import SuppliersClient from '@/components/SuppliersClient';

export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // Solo admin/supervisor operan con proveedores
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    redirect('/dashboard');
  }

  const supabase = createClient();

  const [suppliersRes, kpisRes] = await Promise.all([
    supabase.from('v_supplier_stats').select('*').order('name'),
    supabase.from('v_suppliers_kpis').select('*').single(),
  ]);

  return (
    <SuppliersClient
      initialSuppliers={suppliersRes.data || []}
      initialKpis={kpisRes.data || {}}
      role={profile.role}
    />
  );
}
