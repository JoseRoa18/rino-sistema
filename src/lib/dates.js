/**
 * Helpers para rangos de fechas en reportes.
 *
 * Todos trabajan en zona horaria de Caracas (UTC-4). Las funciones devuelven
 * strings ISO (yyyy-mm-dd) listos para enviar a Supabase como `gte`/`lte`.
 * El backend almacena `created_at` en UTC, así que el rango incluye los
 * límites como instantes ISO con offset -04:00.
 */

const TZ = 'America/Caracas';

function pad(n) {
  return String(n).padStart(2, '0');
}

function veNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: TZ }));
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hoy en VE como yyyy-mm-dd */
export function todayStr() {
  return toDateStr(veNow());
}

/** Ayer */
export function yesterdayStr() {
  const d = veNow();
  d.setDate(d.getDate() - 1);
  return toDateStr(d);
}

/** Hace N días (inclusive hoy) */
export function nDaysAgoStr(n) {
  const d = veNow();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

/** Primer día del mes en curso */
export function monthStartStr() {
  const d = veNow();
  d.setDate(1);
  return toDateStr(d);
}

/** Primer día del mes pasado */
export function lastMonthStartStr() {
  const d = veNow();
  d.setMonth(d.getMonth() - 1, 1);
  return toDateStr(d);
}

/** Último día del mes pasado */
export function lastMonthEndStr() {
  const d = veNow();
  d.setDate(0); // día 0 del mes actual = último día del mes pasado
  return toDateStr(d);
}

/** Primer día del año en curso */
export function yearStartStr() {
  const d = veNow();
  return `${d.getFullYear()}-01-01`;
}

/**
 * Convierte un rango {from, to} en strings ISO UTC para query supabase.
 * `to` se extiende a 23:59:59.999 del día.
 */
export function rangeToIso({ from, to }) {
  return {
    fromIso: from ? new Date(`${from}T00:00:00-04:00`).toISOString() : null,
    toIso:   to   ? new Date(`${to}T23:59:59.999-04:00`).toISOString() : null,
  };
}

/**
 * Presets comunes — devuelven { from, to, label }
 */
export function getPresets() {
  return [
    { value: 'today',         label: 'Hoy',         from: todayStr(),       to: todayStr() },
    { value: 'yesterday',     label: 'Ayer',        from: yesterdayStr(),   to: yesterdayStr() },
    { value: 'last_7',        label: 'Últimos 7d',  from: nDaysAgoStr(6),   to: todayStr() },
    { value: 'last_30',       label: 'Últimos 30d', from: nDaysAgoStr(29),  to: todayStr() },
    { value: 'this_month',    label: 'Este mes',    from: monthStartStr(),  to: todayStr() },
    { value: 'last_month',    label: 'Mes pasado',  from: lastMonthStartStr(), to: lastMonthEndStr() },
    { value: 'last_90',       label: 'Últimos 90d', from: nDaysAgoStr(89),  to: todayStr() },
    { value: 'this_year',     label: 'Este año',    from: yearStartStr(),   to: todayStr() },
  ];
}

/**
 * Dado un rango {from, to}, calcula el rango previo del mismo tamaño
 * (para comparativos).
 */
export function previousRange({ from, to }) {
  const start = new Date(`${from}T00:00:00`);
  const end   = new Date(`${to}T00:00:00`);
  const days  = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));

  return {
    from: toDateStr(prevStart),
    to:   toDateStr(prevEnd),
  };
}

/** Formato amigable de un rango */
export function formatRange({ from, to }) {
  if (!from || !to) return '—';
  if (from === to) {
    return new Date(`${from}T12:00:00`).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }
  const fmtShort = (d) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  const fmtFull = (d) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return sameYear ? `${fmtShort(from)} — ${fmtFull(to)}` : `${fmtFull(from)} — ${fmtFull(to)}`;
}

/** Nombre del día de la semana (0=domingo) */
export function dayOfWeekName(dow) {
  return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][dow] || '';
}

/**
 * Normaliza espacios especiales en strings producidos por `toLocaleString`.
 *
 * Intl.DateTimeFormat inserta U+202F (narrow no-break space) o U+00A0 (nbsp)
 * entre la hora y "a. m./p. m." en navegadores modernos. Node.js puede
 * insertar uno distinto según la versión de ICU. Esto provoca errores de
 * hidratación porque server y client renderizan strings "visualmente
 * iguales" pero con codepoints distintos.
 *
 * Aplicar este helper sobre el resultado de toLocaleString garantiza que
 * server y client coincidan exactamente.
 */
export function normalizeSpaces(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[   ]/g, ' ');
}

/**
 * Formato corto de fecha + hora ('27/05/26, 11:45 a. m.') con espacios
 * normalizados para evitar mismatch de hidratación.
 */
export function formatShortDateTime(input) {
  if (!input) return '';
  return normalizeSpaces(
    new Date(input).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
  );
}

/**
 * Formato largo de fecha + hora ('27 de mayo de 2026, 11:45 a. m.') con
 * espacios normalizados.
 */
export function formatLongDateTime(input) {
  if (!input) return '';
  return normalizeSpaces(
    new Date(input).toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' })
  );
}
