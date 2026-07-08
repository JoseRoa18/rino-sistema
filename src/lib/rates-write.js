/**
 * Escribe en `exchange_rates` las tasas automáticas del día (paralelo, BCV y
 * el TRM de referencia) SIN tocar la tasa `usd_cop` manual del admin.
 *
 * `usd_cop` es la moneda base del negocio y la fija el admin a diario. El cron
 * / refresh automático NUNCA la escribe: el upsert por `rate_date` solo toca
 * las columnas que le pasamos, así que un `usd_cop` ya puesto se conserva y, si
 * no está puesto, queda en null (los cálculos caen al TRM como respaldo —
 * ver getCachedLatestRate).
 *
 * @param {object} service - Supabase service client
 * @param {string} today   - fecha YYYY-MM-DD
 * @param {object} fetched - resultado de fetchAllRates() (incluye usd_cop_trm)
 * @param {string} source  - etiqueta de origen ('cron' | 'auto' | 'manual')
 */
export async function upsertAutoRates(service, today, fetched, source = 'auto') {
  return service
    .from('exchange_rates')
    .upsert(
      {
        rate_date: today,
        usd_ves_paralelo: fetched.usd_ves_paralelo,
        usd_ves_bcv: fetched.usd_ves_bcv,
        usd_cop_trm: fetched.usd_cop_trm ?? null,
        source,
      },
      { onConflict: 'rate_date' }
    )
    .select()
    .single();
}
