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

  const limit = Number(input.credit_limit_usd);
  return {
    name:             clean(input.name),
    document_id:      clean(input.document_id),
    phone:            clean(input.phone),
    email:            clean(input.email),
    address:          clean(input.address),
    customer_type:    input.customer_type || 'detal',
    credit_limit_usd: Number.isFinite(limit) && limit >= 0 ? limit : 0,
    birthday:         clean(input.birthday),
    tags,
    notes:            clean(input.notes),
  };
}

function validate(fields) {
  if (!fields.name) return 'El nombre es obligatorio';
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return 'Email inválido';
  }
  return null;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createCustomerAction(input) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };

  const fields = buildFields(input);
  const err = validate(fields);
  if (err) return { ok: false, error: err };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...fields, active: true })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/clientes');
  return { ok: true, id: data.id };
}

export async function updateCustomerAction(id, input) {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'No autenticado' };
  if (profile.role !== 'admin' && profile.role !== 'supervisor') {
    return { ok: false, error: 'Sin permisos para editar clientes' };
  }

  const fields = buildFields(input);
  const err = validate(fields);
  if (err) return { ok: false, error: err };

  const supabase = createClient();
  const { error } = await supabase
    .from('customers')
    .update(fields)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/clientes');
  revalidatePath(`/clientes/${id}`);
  return { ok: true };
}

export async function deactivateCustomerAction(id) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('soft_delete_customer', {
    p_customer_id: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/clientes');
  revalidatePath(`/clientes/${id}`);
  return { ok: true, data };
}

export async function reactivateCustomerAction(id) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('reactivate_customer', {
    p_customer_id: id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/clientes');
  revalidatePath(`/clientes/${id}`);
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Credit payment
// ---------------------------------------------------------------------------

export async function registerCreditPaymentAction(payload) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('register_credit_payment', { payload });
  if (error) return { ok: false, error: error.message };

  if (payload?.customer_id) {
    revalidatePath(`/clientes/${payload.customer_id}`);
  }
  revalidatePath('/clientes');
  revalidatePath('/dashboard');

  return { ok: true, ...(data || {}) };
}