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
 *
 * Tasa base del peso (usd_cop): si el admin NO fijó la tasa manual, se usa el
 * TRM automático (usd_cop_trm) como respaldo. Este es el ÚNICO punto donde se
 * resuelve el efectivo, así que todos los consumidores de cálculo (POS,
 * productos, compras, caja, créditos) heredan el fallback sin cambios. La
 * pantalla /tasas NO usa este helper (lee crudo), así que sigue mostrando el
 * valor manual real vs el TRM por separado.
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
    if (data && !(Number(data.usd_cop) > 0) && Number(data.usd_cop_trm) > 0) {
      return { ...data, usd_cop: Number(data.usd_cop_trm) };
    }
    return data;
  },
  ['exchange-rate-latest'],
  { revalidate: 600, tags: ['rates'] }
);
