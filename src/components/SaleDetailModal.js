'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, X, Receipt, Wallet, FileText,
  Printer, Lock, User as UserIcon, Calendar,
  Banknote, Smartphone, ArrowLeftRight, CreditCard, Clock,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/pricing';
import { formatLongDateTime } from '@/lib/dates';

const PAYMENT_META = {
  efectivo:      { label: 'Efectivo',      icon: Banknote },
  pago_movil:    { label: 'Pago móvil',    icon: Smartphone },
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight },
  tarjeta:       { label: 'Tarjeta',       icon: CreditCard },
  credito:       { label: 'Crédito',       icon: Clock },
};

/**
 * Modal de detalle de venta. Reusable desde Ventas y Dashboard.
 *
 * Props:
 *   saleId   - id de la venta (cuando es null, no renderiza)
 *   role     - rol del usuario actual ('admin' | 'supervisor' | 'cajero')
 *   onClose  - callback para cerrar el modal
 *   onVoided - callback cuando una venta se anula con éxito.
 *              Recibe { saleId, invoiceNumber, reason }
 */
export default function SaleDetailModal({ saleId, role, onClose, onVoided }) {
  const supabase = createClient();
  const canVoid = role === 'admin' || role === 'supervisor';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [voidMode, setVoidMode] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState('');

  // Carga el detalle al cambiar saleId
  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;

    setLoading(true);
    setError('');
    setData(null);
    setVoidMode(false);
    setVoidReason('');
    setVoidError('');

    Promise.all([
      supabase
        .from('sales')
        .select(`
          *,
          cashier:profiles!cashier_id ( id, full_name ),
          voider:profiles!voided_by ( id, full_name ),
          customers ( id, name )
        `)
        .eq('id', saleId)
        .single(),
      supabase
        .from('sale_items')
        .select('id, product_name, quantity, unit_price_usd, line_total_usd, product_id')
        .eq('sale_id', saleId)
        .order('created_at'),
    ]).then(([saleRes, itemsRes]) => {
      if (cancelled) return;
      if (saleRes.error) {
        setError(saleRes.error.message);
      } else {
        setData({ sale: saleRes.data, items: itemsRes.data || [] });
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape para cerrar
  useEffect(() => {
    if (!saleId) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saleId, onClose]);

  async function confirmVoid() {
    if (!data?.sale) return;
    if (voidReason.trim().length < 3) {
      setVoidError('El motivo debe tener al menos 3 caracteres');
      return;
    }
    setVoiding(true);
    setVoidError('');

    const { error: rpcError } = await supabase.rpc('void_sale', {
      p_sale_id: data.sale.id,
      p_reason: voidReason.trim(),
    });

    if (rpcError) {
      setVoidError(rpcError.message);
      setVoiding(false);
      return;
    }

    onVoided?.({
      saleId: data.sale.id,
      invoiceNumber: data.sale.invoice_number,
      reason: voidReason.trim(),
    });

    setVoiding(false);
    onClose();
  }

  if (!saleId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
        {loading && <DetailLoading onClose={onClose} />}
        {!loading && error && <DetailError error={error} onClose={onClose} />}
        {!loading && !error && data && (
          <DetailContent
            data={data}
            canVoid={canVoid}
            voidMode={voidMode}
            voidReason={voidReason}
            voiding={voiding}
            voidError={voidError}
            onStartVoid={() => setVoidMode(true)}
            onCancelVoid={() => { setVoidMode(false); setVoidReason(''); setVoidError(''); }}
            onChangeReason={setVoidReason}
            onConfirmVoid={confirmVoid}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

// =========================================================================
// Estados auxiliares
// =========================================================================
function DetailLoading({ onClose }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cargando detalle...</h3>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-3 p-5">
        <div className="h-4 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-32 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/50" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-20 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800/50" />
      </div>
    </>
  );
}

function DetailError({ error, onClose }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Error</h3>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-5 text-sm text-red-700 dark:text-red-400">{error}</div>
    </>
  );
}

// =========================================================================
// Contenido del modal
// =========================================================================
function DetailContent({
  data, canVoid, voidMode, voidReason, voiding, voidError,
  onStartVoid, onCancelVoid, onChangeReason, onConfirmVoid, onClose,
}) {
  const { sale, items } = data;
  const anulada = sale.status === 'anulada';
  const Pay = PAYMENT_META[sale.payment_method] || { label: sale.payment_method, icon: Receipt };
  const PayIco = Pay.icon;

  const itemsUnits = items.reduce((acc, it) => acc + Number(it.quantity), 0);
  const hasDiscount = Number(sale.discount_pct || 0) > 0;
  const hasTax = Number(sale.tax_pct || 0) > 0;
  const hasChange = Number(sale.change_amount_usd || 0) > 0 || Number(sale.change_amount_cop || 0) > 0;
  const isCredit = sale.payment_method === 'credito';

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
              Factura #{String(sale.invoice_number).padStart(6, '0')}
            </h3>
            {anulada ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Ban className="h-3 w-3" />
                Anulada
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Completada
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            {formatLongDateTime(sale.created_at)}
          </p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          <DetailField icon={UserIcon} label="Cajero" value={sale.cashier?.full_name || '—'} />
          <DetailField icon={UserIcon} label="Cliente" value={sale.customers?.name || 'Cliente genérico'} />
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Items ({items.length} | {itemsUnits} u)
          </p>
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Producto</th>
                  <th className="px-3 py-2 text-center font-medium">Cant.</th>
                  <th className="px-3 py-2 text-right font-medium">Precio</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{it.product_name}</td>
                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                      {Number(it.quantity).toLocaleString('es-VE')}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                      {formatMoney(it.unit_price_usd)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(it.line_total_usd)}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">
                      Sin items registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Resumen */}
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Resumen
            </p>
            <div className="space-y-1 text-sm">
              <Row label={`Subtotal (${itemsUnits} u)`} value={formatMoney(sale.subtotal_usd)} />
              {hasDiscount && (
                <Row
                  label={`Descuento | ${sale.discount_pct}%`}
                  value={`-${formatMoney(sale.discount_amount_usd)}`}
                  variant="negative"
                />
              )}
              {hasTax && (
                <Row label={`IVA | ${sale.tax_pct}%`} value={formatMoney(sale.tax_amount_usd)} />
              )}
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              <Row label="Total" value={formatMoney(sale.total_usd)} bold large />
            </div>
          </div>

          {/* Pago */}
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Pago
            </p>
            <div className="space-y-1 text-sm">
              <Row
                label="Método"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <PayIco className="h-3.5 w-3.5 text-slate-400" />
                    {Pay.label}
                  </span>
                }
              />
              {!isCredit && (
                <>
                  <Row
                    label="Recibido"
                    value={`${formatPaidAmount(sale.paid_amount, sale.paid_currency)} ${sale.paid_currency}`}
                  />
                  {hasChange ? (
                    <div className="mt-2 rounded-md bg-emerald-50 p-2 dark:bg-emerald-500/10">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        <Wallet className="h-3 w-3" />
                        Vuelto entregado
                      </p>
                      <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {formatChange(sale.change_amount_usd, sale.change_amount_cop)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] italic text-slate-400">Sin vuelto</p>
                  )}
                </>
              )}
              {isCredit && (
                <p className="text-[11px] italic text-amber-600 dark:text-amber-400">
                  Venta a crédito — pendiente de cobro
                </p>
              )}
            </div>
          </div>
        </div>

        {sale.notes && (
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <FileText className="h-3 w-3" />
              Nota
            </p>
            <p className="text-sm italic text-slate-600 dark:text-slate-400">"{sale.notes}"</p>
          </div>
        )}

        {anulada && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-500/30 dark:bg-amber-500/5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Venta anulada
            </p>
            <div className="mt-1 space-y-0.5 text-sm text-amber-900 dark:text-amber-300">
              {sale.voided_at && (
                <p className="text-xs">
                  {formatLongDateTime(sale.voided_at)}
                  {sale.voider?.full_name && ` por ${sale.voider.full_name}`}
                </p>
              )}
              {sale.void_reason && (
                <p className="mt-1 italic">"{sale.void_reason}"</p>
              )}
            </div>
          </div>
        )}

        {voidMode && (
          <div className="rounded-lg border-2 border-red-200 bg-red-50/50 p-4 dark:border-red-500/30 dark:bg-red-500/5">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Confirmar anulación
            </p>
            <p className="mb-3 text-xs text-red-700 dark:text-red-400">
              Se devuelve el stock al inventario y la venta queda marcada como anulada.
            </p>
            <label className="label text-xs">Motivo *</label>
            <textarea
              autoFocus
              rows={3}
              value={voidReason}
              onChange={(e) => onChangeReason(e.target.value)}
              className="input"
              placeholder="Ej: cliente devolvió mercancía, error en cobro, producto dañado..."
            />
            {voidError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-400">{voidError}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={onCancelVoid} disabled={voiding} className="btn-secondary px-3 py-1.5 text-sm">
                Cancelar
              </button>
              <button
                onClick={onConfirmVoid}
                disabled={voiding || voidReason.trim().length < 3}
                className="btn-danger px-3 py-1.5 text-sm"
              >
                {voiding ? 'Anulando...' : 'Anular venta'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        <button
          disabled
          title="Próximamente"
          className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500"
        >
          <Lock className="h-3 w-3" />
          <Printer className="h-3 w-3" />
          Imprimir
        </button>

        <div className="flex items-center gap-2">
          {canVoid && !anulada && !voidMode && (
            <button
              onClick={onStartVoid}
              className="flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <Ban className="h-3.5 w-3.5" />
              Anular venta
            </button>
          )}
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

// =========================================================================
// Helpers
// =========================================================================
function DetailField({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
        {value}
      </p>
    </div>
  );
}

function Row({ label, value, variant, bold, large }) {
  return (
    <div className={`flex items-baseline justify-between ${variant === 'negative' ? 'text-red-600 dark:text-red-400' : ''}`}>
      <span className={`${bold ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
        {label}
      </span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${large ? 'text-lg' : ''} ${variant === 'negative' ? '' : (bold ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100')}`}>
        {value}
      </span>
    </div>
  );
}

function formatPaidAmount(amount, currency) {
  const n = Number(amount) || 0;
  if (currency === 'COP') return n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  if (currency === 'VES') return n.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  return n.toFixed(2);
}

function formatChange(usd, cop) {
  const u = Number(usd) || 0;
  const c = Number(cop) || 0;
  const parts = [];
  if (u > 0) parts.push(`$${u}`);
  if (c > 0) parts.push(`${c.toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`);
  return parts.length === 0 ? '—' : parts.join(' + ');
}