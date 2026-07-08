/**
 * Escribe en `exchange_rates` las tasas automáticas del día (paralelo, BCV y
 * el TRM de referencia) SIN pisar la tasa `usd_cop` manual del admin.
 *
 * `usd_cop` es la moneda base del negocio y la fija el admin a diario. Como el
 * cron / refresh automático no la conoce, aplicamos "carry-forward":
 *   - Si la fila de hoy ya tiene `usd_cop` (el admin lo puso) → se conserva.
 *   - Si no, se hereda el último `usd_cop` manual conocido, para que los
 *     cálculos de precios nunca se queden sin tasa.
 *
 * @param {object} service - Supabase service client
 * @param {string} today   - fecha YYYY-MM-DD
 * @param {object} fetched - resultado de fetchAllRates() (incluye usd_cop_trm)
 * @param {string} source  - etiqueta de origen ('cron' | 'auto' | 'manual')
 */
export async function upsertAutoRates(service, today, fetched, source = 'auto') {
  // Valor de `usd_cop` a conservar: el de hoy si existe, si no el último manual.
  const { data: todayRow } = await service
    .from('exchange_rates')
    .select('usd_cop')
    .eq('rate_date', today)
    .maybeSingle();

  let carryCop = todayRow?.usd_cop ?? null;
  if (carryCop == null) {
    const { data: prior } = await service
      .from('exchange_rates')
      .select('usd_cop')
      .not('usd_cop', 'is', null)
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    carryCop = prior?.usd_cop ?? null;
  }

  const payload = {
    rate_date: today,
    usd_ves_paralelo: fetched.usd_ves_paralelo,
    usd_ves_bcv: fetched.usd_ves_bcv,
    usd_cop_trm: fetched.usd_cop_trm ?? null,
    source,
  };
  // Solo tocamos usd_cop para conservarlo/heredarlo; nunca lo dejamos en null
  // si ya conocíamos un valor manual.
  if (carryCop != null) payload.usd_cop = carryCop;

  return service
    .from('exchange_rates')
    .upsert(payload, { onConflict: 'rate_date' })
    .select()
    .single();
}
