/**
 * Utilidades de pricing y conversión de monedas.
 *
 * El cálculo de promedio ponderado del costo se hace en la base de datos
 * (trigger tg_purchase_item_apply). Aquí dejamos helpers para mostrar
 * la lógica al usuario y para conversiones en el frontend.
 */

/**
 * Promedio ponderado.
 *
 * Ejemplo del cliente:
 *   - Día 1: compro 1 bulto a $10 -> stock 1, costo $10
 *   - Día 2: compro 1 bulto a $11 -> stock 2, costo (1*10+1*11)/2 = $10.50
 *   - Día 3: compro 1 bulto a $8  -> stock 3, costo (2*10.50+1*8)/3 = $9.6667
 *
 * @param {number} currentStock - stock actual en unidades
 * @param {number} currentCost  - costo promedio actual
 * @param {number} qtyIn        - cantidad que entra
 * @param {number} costIn       - costo unitario de la entrada
 */
export function weightedAvgCost(currentStock, currentCost, qtyIn, costIn) {
  const newStock = (currentStock || 0) + qtyIn;
  if (newStock <= 0) return costIn;
  return ((currentStock || 0) * (currentCost || 0) + qtyIn * costIn) / newStock;
}

/**
 * Calcula el precio de venta sugerido aplicando un margen porcentual al costo.
 */
export function priceWithMargin(costUsd, marginPct) {
  return Math.round(costUsd * (1 + marginPct / 100) * 100) / 100;
}

/**
 * Convierte un monto USD a otra moneda usando la tasa correspondiente.
 */
export function convertFromUsd(amountUsd, currency, rates) {
  if (currency === 'USD') return amountUsd;
  if (currency === 'VES') return amountUsd * (rates?.usd_ves_paralelo ?? 0);
  if (currency === 'COP') return amountUsd * (rates?.usd_cop ?? 0);
  return amountUsd;
}

/**
 * Convierte un monto en cualquier moneda a USD.
 */
export function convertToUsd(amount, currency, rates) {
  if (currency === 'USD') return amount;
  if (currency === 'VES') return amount / (rates?.usd_ves_paralelo || 1);
  if (currency === 'COP') return amount / (rates?.usd_cop || 1);
  return amount;
}

/**
 * Formatea un monto con su moneda.
 */
export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount || 0);
  const formatters = {
    USD: { locale: 'en-US', options: { style: 'currency', currency: 'USD' } },
    VES: { locale: 'es-VE', options: { style: 'currency', currency: 'VES', minimumFractionDigits: 2 } },
    COP: { locale: 'es-CO', options: { style: 'currency', currency: 'COP', maximumFractionDigits: 0 } },
  };
  const f = formatters[currency] || formatters.USD;
  try {
    return new Intl.NumberFormat(f.locale, f.options).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
