/**
 * Estado vacío reutilizable: icono + título + descripción + acción opcional.
 *
 * Modos:
 *   - default (padding generoso, centrado, para tarjetas o tablas vacías)
 *   - compact (padding reducido, para celdas dentro de tablas)
 *   - inline  (sin card, para usar dentro de un contenedor que ya tiene fondo)
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'default', // 'default' | 'compact' | 'inline'
  className = '',
}) {
  const padding =
    size === 'compact' ? 'py-8 px-4'
    : size === 'inline' ? 'py-6 px-3'
    : 'py-12 px-6';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${padding} ${className}`}>
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <Icon className="h-6 w-6" />
        </div>
      )}
      {title && (
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {title}
        </p>
      )}
      {description && (
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
