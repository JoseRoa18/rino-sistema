import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';
import UsersClient from '@/components/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const profile = await getCurrentProfile();

  if (!profile) redirect('/login');
  if (profile.role !== 'admin') {
    redirect('/dashboard');
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('list_users_with_stats');

  return (
    <UsersClient
      users={data || []}
      currentUser={{ id: profile.id, role: profile.role, full_name: profile.full_name }}
      loadError={error?.message || null}
    />
  );
}
