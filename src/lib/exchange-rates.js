/**
 * Servicio de tasas cambiarias.
 *
 * Fuente principal: DolarApi.com — proyecto open-source MIT que agrega
 * datos de fuentes públicas (BCV, monitores, Binance P2P, TRM Colombia).
 *
 *   - https://ve.dolarapi.com/v1/dolares  (BCV, paralelo, Binance P2P)
 *   - https://co.dolarapi.com/v1/dolares  (USD/COP oficial)
 *
 * Fallback para COP: open.er-api.com (mercado internacional)
 */

const DOLARAPI_VE = 'https://ve.dolarapi.com/v1/dolares';
const DOLARAPI_CO = 'https://co.dolarapi.com/v1/dolares';
const FALLBACK_CO = 'https://open.er-api.com/v6/latest/USD';

/**
 * Busca un valor en el array de DolarApi VE por palabras clave en `fuente` o `nombre`.
 */
function findRate(arr, keywords) {
  for (const item of arr) {
    const fuente = (item.fuente || '').toLowerCase();
    const nombre = (item.nombre || '').toLowerCase();
    if (keywords.some((k) => fuente.includes(k) || nombre.includes(k))) {
      const value = item.promedio ?? item.venta ?? item.compra ?? null;
      return value ? Number(value) : null;
    }
  }
  return null;
}

/**
 * Trae las cotizaciones del bolívar desde DolarApi en una sola llamada.
 * Devuelve { bcv, paralelo, fechaActualizacion }.
 *
 * Nota: La tasa Binance P2P se descontinuó del sistema en favor de la
 * tasa personalizada Rino (rino_cop_ves) editable manualmente por admin.
 */
async function fetchVeRates() {
  try {
    const res = await fetch(DOLARAPI_VE, { cache: 'no-store' });
    if (!res.ok) throw new Error(`DolarApi VE respondió ${res.status}`);
    const arr = await res.json();
    if (!Array.isArray(arr)) throw new Error('Respuesta inesperada de DolarApi VE');

    return {
      bcv: findRate(arr, ['oficial', 'bcv']),
      paralelo: findRate(arr, ['paralelo']),
      fechaActualizacion: arr[0]?.fechaActualizacion ?? null,
    };
  } catch (err) {
    console.error('[exchange] DolarApi VE falló:', err.message);
    return { bcv: null, paralelo: null, fechaActualizacion: null };
  }
}

/**
 * Trae USD/COP desde DolarApi; si falla, recurre a open.er-api.com.
 */
async function fetchCoRate() {
  try {
    const res = await fetch(DOLARAPI_CO, { cache: 'no-store' });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        const oficial = arr.find((x) => (x.fuente || '').toLowerCase().includes('oficial'));
        const value = oficial?.promedio ?? arr[0]?.promedio ?? arr[0]?.venta ?? null;
        if (value) return Number(value);
      }
    }
  } catch (err) {
    console.error('[exchange] DolarApi CO falló:', err.message);
  }

  // Fallback
  try {
    const res = await fetch(FALLBACK_CO, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      const cop = json?.rates?.COP;
      if (cop) return Number(cop);
    }
  } catch (err) {
    console.error('[exchange] Fallback COP falló:', err.message);
  }

  return null;
}

/**
 * Trae todas las tasas en paralelo. Usado por el cron y el botón manual.
 *
 * No incluye `rino_cop_ves` ni `usd_cop` — ambas se editan manualmente por el
 * admin. El USD/COP del TRM se devuelve como `usd_cop_trm` (solo referencia).
 */
export async function fetchAllRates() {
  const [ve, cop] = await Promise.all([fetchVeRates(), fetchCoRate()]);
  return {
    usd_ves_paralelo: ve.paralelo,
    usd_ves_bcv: ve.bcv,
    usd_cop_trm: cop,
    source_updated_at: ve.fechaActualizacion,
    fetched_at: new Date().toISOString(),
  };
}

// Wrappers de retrocompatibilidad
export async function fetchUsdVesParalelo() {
  return (await fetchVeRates()).paralelo;
}
export async function fetchUsdVesBcv() {
  return (await fetchVeRates()).bcv;
}
export async function fetchUsdCop() {
  return await fetchCoRate();
}
