'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function buildFields(input) {
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

  return {
    name:               clean(input.name),
    contact_name:       clean(input.contact_name),
    phone:              clean(input.phone),
    email:              clean(input.email),
    invoicing_currency: input.invoicing_currency || 'USD',
    payment_terms:      clean(input.payment_terms),
    tags,
    notes:              clean(input.notes),
  };
}

function validate(fields) {
  if (!fields.name) return 'El nombre es obligatorio';
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return 'Email inválido';
  }
  if (!['USD', 'VES', 'COP'].includes(fields.invoicing_currency)) {
    return 'Moneda de facturación inválida';
  }
  return null;
}

function requireRole(profile, roles = ['admin', 'supervisor']) {
  if (!profile) return 'No autenticado';
  if (!roles.includes(profile.role)) return 'Sin permisos para esta operación';
  return null;
}

// ---------------------------------------------------------------------------
// CRUD proveedor
// ---------------------------------------------------------------------------

export async function createSupplierAction(input) {
  const profile = await getCurrentProfile();
  const authErr = requireRole(profile);
  if (authErr) return { ok: false, error: authErr };

  const fields = buildFields(input);
  const err = validate(fields);
  if (err) return { ok: false, error: err };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...fields, active: true })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/proveedores');
  return { ok: true, id: data.id };
}

export async function updateSupplierAction(id, input) {
  const profile = await getCurrentProfile();
  const authErr = requireRole(profile);
  if (authErr) return { ok: false, error: authErr };

  const fields = buildFields(input);
  const err = validate(fields);
  if (err) return { ok: false, error: err };

  const supabase = createClient();
  const { error } = await supabase
    .from('suppliers')
    .update(fields)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/proveedores');
  revalidatePath(`/proveedores/${id}`);
  return { ok: true };
}

export async function deactivateSupplierAction(id) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('soft_delete_supplier', {
    p_supplier_id: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/proveedores');
  revalidatePath(`/proveedores/${id}`);
  return { ok: true, data };
}

export async function reactivateSupplierAction(id) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('reactivate_supplier', {
    p_supplier_id: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/proveedores');
  revalidatePath(`/proveedores/${id}`);
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Cuentas por pagar
// ---------------------------------------------------------------------------

export async function createSupplierCreditAction(input) {
  const profile = await getCurrentProfile();
  const authErr = requireRole(profile);
  if (authErr) return { ok: false, error: authErr };

  const supplierId = clean(input.supplier_id);
  if (!supplierId) return { ok: false, error: 'Proveedor requerido' };

  const amount = Number(input.original_amount_usd);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Monto inválido (debe ser > 0)' };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('supplier_credits')
    .insert({
      supplier_id:         supplierId,
      purchase_id:         clean(input.purchase_id),
      original_amount_usd: amount,
      due_date:            clean(input.due_date),
      notes:               clean(input.notes),
      created_by:          profile.id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/proveedores');
  revalidatePath(`/proveedores/${supplierId}`);
  return { ok: true, id: data.id };
}

export async function registerSupplierPaymentAction(payload) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('register_supplier_payment', { payload });
  if (error) return { ok: false, error: error.message };

  if (payload?.supplier_id) {
    revalidatePath(`/proveedores/${payload.supplier_id}`);
  }
  revalidatePath('/proveedores');
  revalidatePath('/dashboard');

  return { ok: true, ...(data || {}) };
}
