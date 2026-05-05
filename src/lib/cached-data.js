import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * Categorías activas - cambian muy rara vez.
 * Cache: 5 minutos. Tag: 'categories' para invalidación manual.
 */
export const getCachedCategories = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('name');
    return data || [];
  },
  ['categories-active'],
  { revalidate: 300, tags: ['categories'] }
);

/**
 * Tasa de cambio más reciente - se actualiza 1 vez al día por cron.
 * Cache: 10 minutos. Tag: 'rates' para invalidación al refresh manual.
 */
export const getCachedLatestRate = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('exchange_rates')
      .select('*')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
  ['exchange-rate-latest'],
  { revalidate: 600, tags: ['rates'] }
);
