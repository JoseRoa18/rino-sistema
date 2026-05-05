import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * Devuelve el usuario actual de auth.
 * Memoizado: si se llama varias veces dentro del mismo request,
 * la query a Supabase se hace UNA sola vez.
 */
export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Devuelve el perfil completo del usuario actual.
 * Memoizado: layout y página comparten la misma query.
 */
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, active')
    .eq('id', user.id)
    .maybeSingle();

  return data;
});
