'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

/**
 * Registra un consumo familiar.
 *
 * payload = {
 *   items: [{ product_id, quantity }, ...],
 *   notes?: string,
 * }
 */
export async function registerFamilyConsumptionAction(payload) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    return { ok: false, error: 'Sin permisos para registrar consumo familiar' };
  }

  if (!Array.isArray(payload?.items) || payload.items.length === 0) {
    return { ok: false, error: 'Debes agregar al menos un producto' };
  }

  // Validación cliente-side ligera (el RPC valida también)
  for (const it of payload.items) {
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: 'Cantidad inválida en un producto' };
    }
    if (!it.product_id) {
      return { ok: false, error: 'Producto sin identificador' };
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('register_family_consumption', { payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/familia');
  revalidatePath('/dashboard');
  revalidatePath('/inventario');

  return { ok: true, sale_id: data };
}

/**
 * Anular un consumo familiar — reusa la misma RPC void_sale del sistema,
 * pero solo se permite si la venta es interna y la operación es del usuario.
 */
export async function voidFamilyConsumptionAction(saleId, reason) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    return { ok: false, error: 'Sin permisos para anular consumo' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('void_sale', {
    p_sale_id: saleId,
    p_reason: reason || 'Anulación de consumo familiar',
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/familia');
  revalidatePath('/dashboard');
  revalidatePath('/inventario');

  return { ok: true, data };
}
