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
 *
 * VES con tasa personalizada (Rino COP→VES):
 *   - Si existe `rino_cop_ves` y `usd_cop`, calcula: USD → COP → VES con
 *     redondeo hacia arriba al bolívar entero.
 *   - Esto refleja el flujo real del negocio en frontera: el cliente piensa
 *     en pesos y paga en bolívares, así que el precio final en Bs siempre
 *     redondea hacia arriba.
 *   - Si no hay tasa personalizada, fallback al paralelo USD/VES.
 */
export function convertFromUsd(amountUsd, currency, rates) {
  if (currency === 'USD') return amountUsd;
  if (currency === 'COP') return amountUsd * (rates?.usd_cop ?? 0);
  if (currency === 'VES') {
    const rinoRate = Number(rates?.rino_cop_ves);
    const usdCop   = Number(rates?.usd_cop);
    if (rinoRate > 0 && usdCop > 0) {
      const cop = amountUsd * usdCop;
      return Math.ceil(cop / rinoRate);
    }
    return amountUsd * (Number(rates?.usd_ves_paralelo) || 0);
  }
  return amountUsd;
}

/**
 * Convierte un monto en cualquier moneda a USD.
 * Para VES, intenta invertir la conversión por tasa personalizada
 * (VES → COP → USD); si no hay, usa paralelo.
 */
export function convertToUsd(amount, currency, rates) {
  if (currency === 'USD') return amount;
  if (currency === 'COP') return amount / (rates?.usd_cop || 1);
  if (currency === 'VES') {
    const rinoRate = Number(rates?.rino_cop_ves);
    const usdCop   = Number(rates?.usd_cop);
    if (rinoRate > 0 && usdCop > 0) {
      const cop = amount * rinoRate;
      return cop / usdCop;
    }
    return amount / (Number(rates?.usd_ves_paralelo) || 1);
  }
  return amount;
}

/**
 * Convierte pesos colombianos a dólares usando la tasa USD/COP.
 * El peso es la moneda base: el USD se DERIVA del peso.
 *
 * Ej: copToUsd(5000, 4300) → 1.1628
 */
export function copToUsd(amountCop, usdCop) {
  const rate = Number(usdCop);
  if (!rate || rate <= 0) return 0;
  return Number(amountCop || 0) / rate;
}

/**
 * Convierte pesos colombianos directamente a bolívares usando la tasa
 * personalizada Rino con redondeo hacia arriba.
 *
 * Ej: copToVes(5000, 5.5) → 910 (resultado real 909.09, redondeado al alza)
 */
export function copToVes(amountCop, rinoCopVes) {
  const rate = Number(rinoCopVes);
  if (!rate || rate <= 0) return 0;
  return Math.ceil(Number(amountCop || 0) / rate);
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
