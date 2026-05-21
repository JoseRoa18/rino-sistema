/**
 * Logo del sistema Rino.
 *
 * Variantes:
 *   - "icon"  → solo el rinoceronte (uso en favicons, avatares, splash)
 *   - "mark"  → rinoceronte + texto "Rino" en horizontal (uso en navbar)
 *   - "stack" → rinoceronte arriba + texto abajo (uso en login, splash)
 *
 * Adapta colores automáticamente:
 *   - El cuerpo y oreja usan `currentColor` → se controla con `text-*` de Tailwind
 *   - El cuerno es ámbar fijo (#F59E0B)
 *   - El ojo es el inverso del cuerpo (claro en cuerpo oscuro y viceversa)
 *
 *   <RinoLogo variant="icon" className="h-8 w-8 text-slate-900 dark:text-slate-100" />
 */

function RinoIcon({ className = 'h-8 w-8', eyeMode = 'auto' }) {
  // eyeMode: 'auto' = inverso al cuerpo (white en claro / slate en oscuro)
  //           'dark' = siempre oscuro (sobre cuerpo claro)
  //           'light' = siempre claro (sobre cuerpo oscuro)
  return (
    <svg
      viewBox="0 0 120 100"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Rino"
    >
      {/* Cuerpo */}
      <path d="M 10 90 L 10 55 Q 10 28 35 28 L 65 28 L 72 30 L 82 5 L 95 32 L 110 42 L 110 75 L 96 78 L 96 90 L 70 95 L 35 95 Z" />
      {/* Oreja */}
      <path d="M 38 28 L 44 14 L 53 26 Z" />
      {/* Cuerno (ámbar fijo) */}
      <path d="M 72 30 L 82 5 L 95 32 Z" fill="#F59E0B" />
      {/* Ojo */}
      {eyeMode === 'dark' && <circle cx="58" cy="58" r="3.5" fill="#0f172a" />}
      {eyeMode === 'light' && <circle cx="58" cy="58" r="3.5" fill="#ffffff" />}
      {eyeMode === 'auto' && (
        <>
          <circle cx="58" cy="58" r="3.5" className="fill-white dark:fill-slate-900" />
        </>
      )}
    </svg>
  );
}

export default function RinoLogo({
  variant = 'mark',
  className = '',
  iconClassName,
  textClassName,
  subtitleClassName,
  showSubtitle = true,
  eyeMode = 'auto',
}) {
  if (variant === 'icon') {
    return <RinoIcon className={iconClassName || className || 'h-8 w-8'} eyeMode={eyeMode} />;
  }

  if (variant === 'stack') {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <RinoIcon
          className={iconClassName || 'h-16 w-16 text-slate-900 dark:text-slate-100'}
          eyeMode={eyeMode}
        />
        <p
          className={
            textClassName ||
            'mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100'
          }
        >
          Rino
        </p>
        {showSubtitle && (
          <p
            className={
              subtitleClassName ||
              'mt-0.5 text-[10px] font-medium uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400'
            }
          >
            Sistema · Plataforma
          </p>
        )}
      </div>
    );
  }

  // "mark" — horizontal: ícono a la izquierda, texto a la derecha
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <RinoIcon
        className={iconClassName || 'h-9 w-9 text-slate-900 dark:text-slate-100'}
        eyeMode={eyeMode}
      />
      <div className="leading-none">
        <p className={textClassName || 'text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100'}>
          Rino
        </p>
        {showSubtitle && (
          <p className={subtitleClassName || 'mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400'}>
            Sistema · Plataforma
          </p>
        )}
      </div>
    </div>
  );
}
