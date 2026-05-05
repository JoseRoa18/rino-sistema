/**
 * Sparkline minimalista hecho a mano (SVG inline, sin librería).
 *
 * Recibe un array de números y dibuja una línea + área sutil debajo.
 * Si todos los valores son iguales, dibuja una línea horizontal en el medio.
 * Si no hay datos suficientes (< 2), no renderiza nada.
 *
 *   <Sparkline data={[10, 12, 8, 14, 13, 18]} className="h-8 w-24" />
 *
 * Color: `accent` controla los colores (emerald/rose/brand/amber/violet/slate).
 */
const ACCENT_COLORS = {
  brand:   { stroke: '#0284c7', fill: '#0ea5e9' },
  emerald: { stroke: '#059669', fill: '#10b981' },
  rose:    { stroke: '#e11d48', fill: '#f43f5e' },
  amber:   { stroke: '#d97706', fill: '#f59e0b' },
  violet:  { stroke: '#7c3aed', fill: '#8b5cf6' },
  slate:   { stroke: '#64748b', fill: '#94a3b8' },
};

export default function Sparkline({
  data = [],
  accent = 'brand',
  className = 'h-8 w-24',
  showDot = true,
}) {
  if (!Array.isArray(data) || data.length < 2) return null;

  const values = data.map((v) => Number(v) || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const W = 100;
  const H = 32;
  const padY = 3;
  const usableH = H - padY * 2;

  const stepX = W / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padY + (1 - (v - min) / range) * usableH;
    return [x, y];
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

  // Área debajo de la línea: cierra al baseline
  const areaPath =
    `${linePath} L${W},${H} L0,${H} Z`;

  const colors = ACCENT_COLORS[accent] || ACCENT_COLORS.brand;
  const lastPoint = points[points.length - 1];
  const gradientId = `sparkGrad-${accent}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={colors.fill} stopOpacity="0.25" />
          <stop offset="100%" stopColor={colors.fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDot && lastPoint && (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r="1.8"
          fill={colors.stroke}
          stroke="white"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
