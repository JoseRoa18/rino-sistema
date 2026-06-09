'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, X, CheckCircle2,
  Banknote, Smartphone, ArrowLeftRight, CreditCard, Clock,
  Package, AlertCircle, Wallet, AlertTriangle, ChevronDown,
  Pause, FileText, Percent, ScanLine, User as UserIcon,
  ListChecks, Lock, UserPlus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatMoney, convertFromUsd, copToVes } from '@/lib/pricing';
import CustomerForm from '../CustomerForm';
import { createCustomerAction } from '@/app/(dashboard)/clientes/actions';

const PAYMENT_METHODS = [
  { value: 'efectivo',      label: 'Efectivo',     icon: Banknote },
  { value: 'pago_movil',    label: 'Pago móvil',   icon: Smartphone },
  { value: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { value: 'tarjeta',       label: 'Tarjeta',      icon: CreditCard },
  { value: 'credito',       label: 'Crédito',      icon: Clock },
];

const CURRENCIES = [
  { value: 'USD', label: 'USD' },
  { value: 'COP', label: 'COP' },
  { value: 'VES', label: 'Bs.' },
];

const SUSPICIOUS_PAYMENT_MULTIPLIER = 3;
const PARKED_SALES_KEY = 'rino_pos_parked_sales';
const DISCOUNT_PRESETS = [5, 10, 15, 20];

// Métodos electrónicos: el monto siempre se cobra exacto, sin vuelto.
const EXACT_PAYMENT_METHODS = new Set(['pago_movil', 'tarjeta']);
const isExactMethod = (m) => EXACT_PAYMENT_METHODS.has(m);

// Unidades que se miden por peso/volumen → permiten cantidades decimales.
const FRACTIONAL_UNITS = new Set(['kg', 'g', 'litro', 'l', 'ml']);
const isFractionalUnit = (u) => FRACTIONAL_UNITS.has(String(u || '').toLowerCase());
const qtyStepFor = (u) => (isFractionalUnit(u) ? 0.1 : 1);
const formatQty = (q, u) => {
  const n = Number(q) || 0;
  if (isFractionalUnit(u)) {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  return String(n);
};

export default function POSInterface({
  initialProducts,
  initialBestSellers,
  initialCategories,
  initialRates,
  initialCustomers,
  role,
}) {
  const supabase = createClient();
  const [products] = useState(initialProducts || []);
  const [bestSellers] = useState(initialBestSellers || []);
  const [categories] = useState(initialCategories || []);
  const [customers, setCustomers] = useState(initialCustomers || []);
  const [rates] = useState(initialRates || {});

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [note, setNote] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [taxPct, setTaxPct] = useState(0);

  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paidCurrency, setPaidCurrency] = useState('USD');
  const [paidAmount, setPaidAmount] = useState('');

  // Punto/Pago móvil: la moneda es SIEMPRE Bs. Forzamos paidCurrency a 'VES'
  // cuando se selecciona uno de esos métodos.
  useEffect(() => {
    if (isExactMethod(paymentMethod) && paidCurrency !== 'VES') {
      setPaidCurrency('VES');
      setPaidAmount('');
    }
  }, [paymentMethod, paidCurrency]);

  const [parkedSales, setParkedSales] = useState([]);

  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showParkedModal, setShowParkedModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmingSuspicious, setConfirmingSuspicious] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PARKED_SALES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setParkedSales(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PARKED_SALES_KEY, JSON.stringify(parkedSales));
    } catch {}
  }, [parkedSales]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (showCustomerPicker) setShowCustomerPicker(false);
        else if (showDiscountModal) setShowDiscountModal(false);
        else if (showNoteModal) setShowNoteModal(false);
        else if (showParkedModal) setShowParkedModal(false);
        else if (search) setSearch('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search, showCustomerPicker, showDiscountModal, showNoteModal, showParkedModal]);

  const trimmedSearch = search.trim();

  const rankMap = useMemo(() => {
    const m = new Map();
    bestSellers.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [bestSellers]);

  const visibleProducts = useMemo(() => {
    const q = trimmedSearch.toLowerCase();
    const matchesQuery = (p) =>
      !q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
    const matchesCategory = (p) =>
      activeCategory === 'all' || p.category_id === activeCategory;

    const baseActive = products.filter((p) => p.active !== false);

    if (q) return baseActive.filter(matchesQuery).filter(matchesCategory).slice(0, 60);
    if (activeCategory !== 'all') return baseActive.filter(matchesCategory).slice(0, 60);

    const ranked = bestSellers
      .map((b) => products.find((p) => p.id === b.id))
      .filter(Boolean)
      .slice(0, 12);
    const rankedIds = new Set(ranked.map((p) => p.id));
    const filler = baseActive.filter((p) => !rankedIds.has(p.id)).slice(0, 12);
    return [...ranked, ...filler];
  }, [products, bestSellers, trimmedSearch, activeCategory]);

  // Aplana productos con variants: cada presentación se renderiza como su
  // propia tarjeta en el grid. Productos sin variants quedan tal cual.
  const displayItems = useMemo(() => {
    const items = [];
    for (const p of visibleProducts) {
      const vs = Array.isArray(p.variants) ? p.variants : [];
      if (vs.length === 0) {
        items.push({ key: p.id, product: p, variant: null });
      } else {
        for (const v of vs) {
          items.push({ key: `${p.id}|${v.id}`, product: p, variant: v });
        }
      }
    }
    return items;
  }, [visibleProducts]);

  // Identificador de una línea del carrito (product+variant)
  const lineKeyOf = (item) => `${item.product.id}|${item.variant?.id || ''}`;

  const categoryCounts = useMemo(() => {
    const counts = { all: 0 };
    for (const p of products) {
      if (p.active !== false) {
        counts.all = (counts.all || 0) + 1;
        if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      }
    }
    return counts;
  }, [products]);

  // selectedCustomer / isFamilyMode se calculan ANTES de `computed` porque
  // `computed` los necesita en su useMemo.
  const selectedCustomer = customers.find((c) => c.id === customerId) || null;
  const isFamilyMode     = !!selectedCustomer?.is_internal;
  const canFamily        = role === 'admin' || role === 'supervisor';

  const computed = useMemo(() => {
    // En modo familia, el "subtotal" se calcula al costo, sin descuentos ni
    // impuestos. Caso normal: precio de venta.
    const usdRate = Number(rates?.usd_cop) || 0;
    const rinoRate = Number(rates?.rino_cop_ves) || 0;
    const paraleloRate = Number(rates?.usd_ves_paralelo) || 0;

    // Helpers para extraer el precio efectivo de cada línea, respetando variant.
    // En modo familia el "precio" es el costo equivalente (base_qty × cost_avg
    // si hay variant; cost_avg si no).
    const lineUsd = (it) => {
      if (isFamilyMode) {
        const costPerBase = Number(it.product.cost_avg || 0);
        return it.variant ? costPerBase * Number(it.variant.base_quantity || 1) : costPerBase;
      }
      return it.variant ? Number(it.variant.price_usd || 0) : Number(it.product.price_usd || 0);
    };
    const lineCop = (it) => {
      if (isFamilyMode) {
        return lineUsd(it) * usdRate;
      }
      if (it.variant) {
        return Number(it.variant.price_cop) || (Number(it.variant.price_usd) * usdRate);
      }
      return Number(it.product.price_cop) || (Number(it.product.price_usd) * usdRate);
    };

    const subtotalUsd = cart.reduce((acc, it) => acc + lineUsd(it) * it.qty, 0);
    const subtotalCop = cart.reduce((acc, it) => acc + lineCop(it) * it.qty, 0);

    const discountPctNum = Number(discountPct) || 0;
    const taxPctNum = Number(taxPct) || 0;

    // Descuento e IVA proporcionales en cada moneda
    const discountAmount = isFamilyMode ? 0 : Math.round(subtotalUsd * discountPctNum) / 100;
    const afterDiscount = subtotalUsd - discountAmount;
    const taxAmount = isFamilyMode ? 0 : Math.round(afterDiscount * taxPctNum) / 100;
    const totalUsd = afterDiscount + taxAmount;

    const discountAmountCop = isFamilyMode ? 0 : Math.round(subtotalCop * discountPctNum) / 100;
    const afterDiscountCop = subtotalCop - discountAmountCop;
    const taxAmountCop = isFamilyMode ? 0 : Math.round(afterDiscountCop * taxPctNum) / 100;
    const totalCop = afterDiscountCop + taxAmountCop;

    // Bs.: si hay tasa personalizada Rino → COP/rino_rate redondeado arriba.
    //      Si no → USD × paralelo (fallback).
    let totalVes;
    if (rinoRate > 0 && totalCop > 0) {
      totalVes = Math.ceil(totalCop / rinoRate);
    } else {
      totalVes = totalUsd * paraleloRate;
    }

    return {
      subtotalUsd, discountAmount, taxAmount, totalUsd,
      familyCostUsd: isFamilyMode ? totalUsd : null,
      ves: totalVes,
      cop: totalCop,
      itemsLines: cart.length,
      itemsUnits: cart.reduce((acc, it) => acc + it.qty, 0),
    };
  }, [cart, discountPct, taxPct, rates, isFamilyMode]);

  const totalInPayCurrency = useMemo(() => {
    if (paidCurrency === 'USD') return computed.totalUsd;
    if (paidCurrency === 'VES') return computed.ves;
    if (paidCurrency === 'COP') return computed.cop;
    return computed.totalUsd;
  }, [paidCurrency, computed]);

  const changeBreakdown = useMemo(() => {
    if (cart.length === 0) return null;
    // Punto/Pago móvil: pago exacto siempre, nunca hay vuelto.
    if (isExactMethod(paymentMethod)) return null;
    const paid = Number(paidAmount) || 0;
    if (paid === 0) return null;

    const ratesCop = Number(rates.usd_cop) || 0;
    const ratesVes = Number(rates.usd_ves_paralelo) || 0;

    let paidUsd;
    if (paidCurrency === 'USD') paidUsd = paid;
    else if (paidCurrency === 'COP') paidUsd = ratesCop > 0 ? paid / ratesCop : 0;
    else if (paidCurrency === 'VES') paidUsd = ratesVes > 0 ? paid / ratesVes : 0;
    else paidUsd = 0;

    const diffUsd = paidUsd - computed.totalUsd;

    if (diffUsd < -0.005) {
      return {
        type: 'missing',
        missingUsd: Math.abs(diffUsd),
        missingInPaidCurrency: totalInPayCurrency - paid,
      };
    }
    if (Math.abs(diffUsd) < 0.005) return { type: 'exact' };

    if (ratesCop <= 0) {
      const rawInPaid = paid - totalInPayCurrency;
      const rounded = paidCurrency === 'USD' ? rawInPaid : Math.floor(rawInPaid / 100) * 100;
      return { type: 'change', mode: 'fallback', fallbackAmount: rounded, fallbackCurrency: paidCurrency, rawUsd: diffUsd };
    }
    if (paidCurrency === 'COP') {
      const rawCop = paid - totalInPayCurrency;
      return { type: 'change', mode: 'cop_only', usdPart: 0, copPart: Math.floor(rawCop / 100) * 100, rawUsd: diffUsd, rawCop };
    }
    if (paidCurrency === 'VES') {
      const rawCop = diffUsd * ratesCop;
      return { type: 'change', mode: 'cop_only', usdPart: 0, copPart: Math.floor(rawCop / 100) * 100, rawUsd: diffUsd, rawCop };
    }

    const wholeUsd = Math.floor(diffUsd);
    const remainderUsd = diffUsd - wholeUsd;
    const rawCop = remainderUsd * ratesCop;
    return { type: 'change', mode: 'split', usdPart: wholeUsd, copPart: Math.floor(rawCop / 100) * 100, rawUsd: diffUsd, rawCop };
  }, [paidAmount, paidCurrency, computed, totalInPayCurrency, rates, cart.length, paymentMethod]);

  // Alternativas de vuelto: para cuando el cajero no tenga la denominación recomendada.
  // Genera hasta 4-5 maneras distintas de devolver el mismo monto:
  //   - Recomendado (la regla de POS)
  //   - $5 / $1 USD + el resto en COP (dependiendo de qué quepa)
  //   - Todo en COP
  //   - Todo en USD (con pérdida si la hay)
  // No genera alternativas en Bs. (en bolívares no se devuelven vueltos).
  const changeOptions = useMemo(() => {
    if (!changeBreakdown || changeBreakdown.type !== 'change') return [];

    const opts = [];
    const seen = new Set();
    const keyOf = (b) => `${b.usdPart || 0}-${b.copPart || 0}`;

    // 1) La opción recomendada — usa los valores ya calculados en changeBreakdown
    const recUsd = changeBreakdown.mode === 'fallback'
      ? (changeBreakdown.fallbackCurrency === 'USD' ? Number(changeBreakdown.fallbackAmount) || 0 : 0)
      : (changeBreakdown.usdPart || 0);
    const recCop = changeBreakdown.mode === 'fallback'
      ? (changeBreakdown.fallbackCurrency === 'COP' ? Number(changeBreakdown.fallbackAmount) || 0 : 0)
      : (changeBreakdown.copPart || 0);
    opts.push({ key: 'recommended', label: 'Recomendado', usdPart: recUsd, copPart: recCop });
    seen.add(keyOf({ usdPart: recUsd, copPart: recCop }));

    // En modo fallback no podemos generar alternativas (no hay tasa COP)
    if (changeBreakdown.mode === 'fallback') return opts;

    const ratesCop = Number(rates.usd_cop) || 0;
    const rawUsd = Number(changeBreakdown.rawUsd) || 0;
    if (rawUsd <= 0 || ratesCop <= 0) return opts;

    // 2) Variantes con USD parcial + el resto en COP
    const wholeUsd = Math.floor(rawUsd);
    const COMMON_BILLS = [20, 10, 5, 1];
    for (const bill of COMMON_BILLS) {
      if (bill > wholeUsd) continue;
      const remainingUsd = rawUsd - bill;
      const copPart = Math.floor((remainingUsd * ratesCop) / 100) * 100;
      const breakdown = { usdPart: bill, copPart };
      const k = keyOf(breakdown);
      if (seen.has(k)) continue;
      opts.push({ ...breakdown, key: `usd_${bill}` });
      seen.add(k);
      if (opts.filter((o) => o.key.startsWith('usd_')).length >= 2) break;
    }

    // 3) Todo en COP
    const allCop = { usdPart: 0, copPart: Math.floor((rawUsd * ratesCop) / 100) * 100 };
    if (!seen.has(keyOf(allCop))) {
      opts.push({ ...allCop, key: 'all_cop', label: 'Todo en COP' });
      seen.add(keyOf(allCop));
    }

    // 4) Todo en USD (con pérdida si aplica)
    if (wholeUsd >= 1) {
      const allUsd = { usdPart: wholeUsd, copPart: 0 };
      const loss = rawUsd - wholeUsd;
      if (!seen.has(keyOf(allUsd))) {
        opts.push({
          ...allUsd,
          key: 'all_usd',
          label: 'Todo en USD',
          loss: loss > 0.005 ? loss : 0,
        });
        seen.add(keyOf(allUsd));
      }
    }

    return opts;
  }, [changeBreakdown, rates]);

  // Opción seleccionada por el cajero — resetea cuando cambia el monto, moneda o método
  const [selectedChangeKey, setSelectedChangeKey] = useState('recommended');
  useEffect(() => {
    setSelectedChangeKey('recommended');
  }, [changeBreakdown?.rawUsd, paidCurrency, paymentMethod]);

  const selectedChange = useMemo(
    () => changeOptions.find((o) => o.key === selectedChangeKey) || changeOptions[0] || null,
    [changeOptions, selectedChangeKey]
  );

  const isSuspicious = useMemo(() => {
    if (!paidAmount || cart.length === 0 || totalInPayCurrency <= 0) return false;
    const paid = Number(paidAmount) || 0;
    return paid > totalInPayCurrency * SUSPICIOUS_PAYMENT_MULTIPLIER;
  }, [paidAmount, totalInPayCurrency, cart.length]);

  // ID temporal de la venta para mostrar (el real lo asigna la BD).
  // Se genera SOLO en cliente después de montar para evitar mismatch de
  // hidratación: Math.random() produciría valores distintos en server vs
  // client durante el primer render.
  const [draftSaleId, setDraftSaleId] = useState('');
  useEffect(() => {
    const d = new Date();
    const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    setDraftSaleId(`${yymm}-${random}`);
  }, []);

  async function handleCreateCustomer(input) {
    const result = await createCustomerAction(input);
    if (!result.ok) {
      setError(result.error || 'No se pudo crear el cliente');
      return false;
    }
    // Construye el objeto local con el shape que el POS espera (id, name, is_internal)
    const newCustomer = {
      id: result.id,
      name: input.name,
      is_internal: false,
    };
    setCustomers((prev) =>
      [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    );
    setCustomerId(result.id);
    setShowNewCustomerForm(false);
    setShowCustomerPicker(false);
    setError('');
    return true;
  }

  function addToCart(product, variant = null) {
    if (product.stock <= 0) return;
    const key = `${product.id}|${variant?.id || ''}`;
    const baseQty = variant ? Number(variant.base_quantity) || 1 : 1;

    // Stock total reservado en el carrito para ESTE product.id (a través de
    // todas sus presentaciones), expresado en unidades base.
    const reservedBase = cart.reduce((acc, it) => {
      if (it.product.id !== product.id) return acc;
      const m = it.variant ? Number(it.variant.base_quantity) || 1 : 1;
      return acc + Number(it.qty) * m;
    }, 0);
    const availableBase = Number(product.stock) - reservedBase;

    if (availableBase < baseQty) {
      const unit = variant ? variant.name : (product.unit || 'unidad');
      setError(
        `No hay suficiente stock de ${product.name}. Disponible: ${Math.max(0, Math.floor(availableBase / baseQty))} ${unit}.`
      );
      return;
    }

    setCart((prev) => {
      const existing = prev.find((it) => lineKeyOf(it) === key);
      if (existing) {
        return prev.map((it) =>
          lineKeyOf(it) === key ? { ...it, qty: it.qty + 1 } : it
        );
      }
      return [...prev, { product, variant, qty: 1 }];
    });
    setError('');
  }

  function changeQty(lineKey, delta) {
    setCart((prev) =>
      prev.map((it) => {
        if (lineKeyOf(it) !== lineKey) return it;
        // Las variants (cartón, caja...) son siempre enteras. Las unidades
        // fraccionales (kg, L) solo aplican al producto base.
        const step = it.variant ? 1 : qtyStepFor(it.product.unit);
        const effective = Math.abs(delta) === 1 ? Math.sign(delta) * step : delta;
        let next = Number(it.qty) + effective;
        next = Math.round(next * 1000) / 1000;
        return { ...it, qty: next };
      })
      .filter((it) => it.qty > 0)
    );
  }

  function setQty(lineKey, qty) {
    const n = Math.max(0, Number(qty) || 0);
    if (n === 0) {
      setCart((prev) => prev.filter((it) => lineKeyOf(it) !== lineKey));
      return;
    }
    setCart((prev) =>
      prev.map((it) => (lineKeyOf(it) === lineKey ? { ...it, qty: n } : it))
    );
  }

  function removeFromCart(lineKey) {
    setCart((prev) => prev.filter((it) => lineKeyOf(it) !== lineKey));
  }

  function clearAll() {
    setCart([]);
    setPaidAmount('');
    setCustomerId('');
    setNote('');
    setDiscountPct(0);
    setTaxPct(0);
    setError('');
    setConfirmingSuspicious(false);
  }

  function setExactAmount() {
    setPaidAmount(totalInPayCurrency.toFixed(paidCurrency === 'COP' ? 0 : 2));
    setConfirmingSuspicious(false);
  }

  function addQuickAmount(delta) {
    const current = Number(paidAmount) || 0;
    const next = current + delta;
    setPaidAmount(next.toFixed(paidCurrency === 'COP' ? 0 : 2));
    setConfirmingSuspicious(false);
  }

  function parkCurrentSale() {
    if (cart.length === 0) {
      setError('No hay items en el carrito para poner en espera.');
      return;
    }
    const snapshot = {
      id: `parked_${Date.now()}`,
      timestamp: Date.now(),
      items: cart.map((it) => ({
        productId: it.product.id,
        productName: it.product.name,
        sku: it.product.sku,
        priceUsd: it.product.price_usd,
        priceVes: it.product.price_ves,
        priceCop: it.product.price_cop,
        stock: it.product.stock,
        unit: it.product.unit,
        categoryId: it.product.category_id,
        active: it.product.active,
        minStock: it.product.min_stock,
        costAvg: it.product.cost_avg,
        variants: it.product.variants,
        variant: it.variant || null,
        qty: it.qty,
      })),
      customerId,
      customerName: selectedCustomer?.name || null,
      note,
      discountPct,
      taxPct,
    };
    setParkedSales((prev) => [snapshot, ...prev].slice(0, 20));
    clearAll();
  }

  function recallParkedSale(parkedId) {
    const parked = parkedSales.find((p) => p.id === parkedId);
    if (!parked) return;
    if (cart.length > 0) {
      setError('Ya hay items en el carrito. Pon esa venta en espera o vacía antes de recuperar otra.');
      setShowParkedModal(false);
      return;
    }
    // Para evitar vender en negativo si el stock cambió mientras estaba
    // parqueado, releemos el stock ACTUAL del array `products`.
    const restoredCart = parked.items.map((it) => {
      const liveProduct = products.find((p) => p.id === it.productId);
      return {
        product: {
          id: it.productId,
          name: it.productName,
          sku: it.sku,
          price_usd: it.priceUsd,
          price_ves: it.priceVes,
          price_cop: it.priceCop,
          stock: liveProduct ? Number(liveProduct.stock) : it.stock,
          unit: it.unit,
          min_stock: it.minStock,
          category_id: it.categoryId,
          active: it.active,
          cost_avg: it.costAvg,
          variants: liveProduct?.variants || it.variants,
        },
        variant: it.variant || null,
        qty: it.qty,
      };
    });

    // Validar que el carrito reconstruido no exceda el stock actual.
    const reservedByProduct = new Map();
    for (const it of restoredCart) {
      const m = it.variant ? Number(it.variant.base_quantity) || 1 : 1;
      const reserved = (reservedByProduct.get(it.product.id) || 0) + Number(it.qty) * m;
      reservedByProduct.set(it.product.id, reserved);
    }
    const insufficient = [];
    for (const [pid, reserved] of reservedByProduct.entries()) {
      const live = products.find((p) => p.id === pid);
      const stock = live ? Number(live.stock) : 0;
      if (stock < reserved) insufficient.push(live?.name || pid);
    }
    if (insufficient.length > 0) {
      setError(
        `Stock insuficiente para recuperar la venta. Productos afectados: ${insufficient.join(', ')}.`
      );
      setShowParkedModal(false);
      return;
    }

    setCart(restoredCart);
    setCustomerId(parked.customerId || '');
    setNote(parked.note || '');
    setDiscountPct(parked.discountPct || 0);
    setTaxPct(parked.taxPct || 0);
    setParkedSales((prev) => prev.filter((p) => p.id !== parkedId));
    setShowParkedModal(false);
  }

  function deleteParkedSale(parkedId) {
    setParkedSales((prev) => prev.filter((p) => p.id !== parkedId));
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    setError('');

    // Modo familia: ruta separada, RPC distinta, sin pago ni vuelto.
    if (isFamilyMode) {
      if (!canFamily) {
        setError('Solo admin o supervisor pueden registrar consumo familiar.');
        return;
      }
      setSubmitting(true);
      const payloadFamily = {
        notes: note || null,
        // En consumo familiar, el descuento es siempre en unidades base. Si hay
        // variant, multiplicamos por base_quantity.
        items: cart.map((it) => ({
          product_id: it.product.id,
          quantity:   it.variant ? it.qty * Number(it.variant.base_quantity || 1) : it.qty,
        })),
      };
      const { data, error: famErr } = await supabase.rpc(
        'register_family_consumption',
        { payload: payloadFamily }
      );
      if (famErr) {
        setError(famErr.message);
        setSubmitting(false);
        return;
      }
      setSuccess({
        saleId: data,
        total: computed.familyCostUsd ?? computed.totalUsd,
        paidAmount: 0,
        paidCurrency: 'USD',
        breakdown: null,
        family: true,
      });
      clearAll();
      setSubmitting(false);
      setCartOpen(false);
      return;
    }

    if (paymentMethod === 'credito' && !customerId) {
      setError('Para venta a crédito debes seleccionar un cliente.');
      return;
    }

    if (isSuspicious && !confirmingSuspicious && paymentMethod !== 'credito' && !isExactMethod(paymentMethod)) {
      setConfirmingSuspicious(true);
      setError('El monto recibido parece muy alto. Verifica y vuelve a presionar Cobrar si está correcto.');
      return;
    }

    setSubmitting(true);

    // Métodos electrónicos: pago siempre exacto, sin vuelto. Forzamos el
    // monto pagado al total en la moneda seleccionada.
    const exactMethod = isExactMethod(paymentMethod);
    const effectivePaidAmount = exactMethod
      ? totalInPayCurrency
      : (Number(paidAmount) || 0);

    let usdPart = 0;
    let copPart = 0;
    if (paymentMethod !== 'credito' && !exactMethod && changeBreakdown?.type === 'change') {
      // Usamos lo que el cajero escogió en el picker (puede ser la opción
      // recomendada o cualquier alternativa). selectedChange siempre refleja
      // la opción activa.
      if (selectedChange) {
        usdPart = Number(selectedChange.usdPart) || 0;
        copPart = Number(selectedChange.copPart) || 0;
      } else if (changeBreakdown.mode === 'fallback') {
        // Fallback sin alternativas — comportamiento previo
        if (changeBreakdown.fallbackCurrency === 'USD') {
          usdPart = Number(changeBreakdown.fallbackAmount) || 0;
        } else if (changeBreakdown.fallbackCurrency === 'COP') {
          copPart = Number(changeBreakdown.fallbackAmount) || 0;
        }
      } else {
        usdPart = Number(changeBreakdown.usdPart) || 0;
        copPart = Number(changeBreakdown.copPart) || 0;
      }
    }

    const payload = {
      customer_id: customerId || null,
      payment_method: paymentMethod,
      paid_currency: paidCurrency,
      paid_amount: effectivePaidAmount,
      change_amount_usd: usdPart,
      change_amount_cop: copPart,
      discount_pct: Number(discountPct) || 0,
      tax_pct: Number(taxPct) || 0,
      notes: note || null,
      items: cart.map((it) => ({
        product_id: it.product.id,
        product_name: it.variant
          ? `${it.product.name} (${it.variant.name})`
          : it.product.name,
        quantity: it.qty,
        unit_price_usd: it.variant
          ? Number(it.variant.price_usd || 0)
          : Number(it.product.price_usd || 0),
        variant_id: it.variant?.id || null,
      })),
    };

    const { data, error: rpcError } = await supabase.rpc('register_sale', { payload });
    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    setSuccess({
      saleId: data,
      total: computed.totalUsd,
      paidAmount: effectivePaidAmount,
      paidCurrency,
      // Pasamos un breakdown con los amounts SELECCIONADOS (no necesariamente
      // los recomendados) para que el modal de éxito muestre lo que el cajero
      // realmente le devolvió al cliente.
      breakdown: exactMethod
        ? { type: 'exact' }
        : (changeBreakdown && changeBreakdown.type === 'change' && selectedChange
            ? { ...changeBreakdown, usdPart: selectedChange.usdPart, copPart: selectedChange.copPart }
            : changeBreakdown),
    });
    clearAll();
    setSubmitting(false);
    setCartOpen(false);
  }

  const quickAmounts =
    paidCurrency === 'USD' ? [1, 5, 10, 20, 50]
    : paidCurrency === 'COP' ? [5000, 10000, 20000, 50000, 100000]
    : [100, 500, 1000, 2000, 5000];

  const catNameFn = (id) => categories.find((c) => c.id === id)?.name || '';

  // ===== RENDER =====

  return (
    <>
      {/* BANNER MODO FAMILIA — fuera del grid para no romper layout */}
      {isFamilyMode && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-sky-300 bg-sky-50 px-4 py-2.5 text-sm shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10">
          <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300">
            <Lock className="h-4 w-4" />
            <span>
              <strong>Modo consumo familiar</strong> — los productos se cobrarán
              al <strong>precio costo</strong> y no aparecerán en reportes financieros.
              {!canFamily && (
                <span className="ml-1 font-semibold">
                  Solo admin o supervisor pueden registrar.
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => { setCustomerId(''); setError(''); }}
            className="text-xs font-medium text-sky-700 underline hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-200"
          >
            Salir del modo familia
          </button>
        </div>
      )}

    <div className="flex flex-col gap-4 lg:grid lg:h-[calc(100vh-9rem)] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* TOP: BÚSQUEDA + GRID */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text"
              autoFocus
              placeholder="Escanea, busca o toca un producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input h-12 pl-12 pr-24 text-base"
            />
            <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 sm:flex">
              Ctrl
              <span className="text-slate-300 dark:text-slate-600">/</span>
            </kbd>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-20 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                aria-label="Limpiar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => searchRef.current?.focus()}
            className="flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title="Enfocar búsqueda para escaneo (USB scanner)"
          >
            <ScanLine className="h-4 w-4" />
            Escanear
          </button>

          {parkedSales.length > 0 && (
            <button
              onClick={() => setShowParkedModal(true)}
              className="flex h-12 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              {parkedSales.length} en espera
            </button>
          )}
        </div>

        <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto px-1 pb-1">
          <CategoryChip label="Todos" count={categoryCounts.all || 0} active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
          {categories.map((c) => {
            const count = categoryCounts[c.id] || 0;
            const active = activeCategory === c.id;
            return (
              <CategoryChip key={c.id} label={c.name} count={count} active={active} disabled={count === 0 && !active} onClick={() => setActiveCategory(c.id)} />
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {trimmedSearch ? `Ningún producto coincide con "${trimmedSearch}".` : 'No hay productos disponibles.'}
              </p>
              {(trimmedSearch || activeCategory !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setActiveCategory('all'); }}
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {displayItems.map((it) => (
                <ProductCard
                  key={it.key}
                  product={it.product}
                  variant={it.variant}
                  rank={!trimmedSearch && activeCategory === 'all' && !it.variant ? rankMap.get(it.product.id) || null : null}
                  catName={catNameFn}
                  rates={rates}
                  onAdd={() => addToCart(it.product, it.variant)}
                  familyMode={isFamilyMode}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM (DESKTOP): CARRITO | RESUMEN | PAGO */}
      <div className={`hidden min-h-0 lg:grid lg:gap-4 ${
        isFamilyMode ? 'lg:grid-cols-[5fr_4fr]' : 'lg:grid-cols-[5fr_3fr_4fr]'
      }`}>
        <CartPanel
          cart={cart}
          draftSaleId={draftSaleId}
          itemsLines={computed.itemsLines}
          itemsUnits={computed.itemsUnits}
          customer={selectedCustomer}
          customers={customers}
          showCustomerPicker={showCustomerPicker}
          onCustomerToggle={() => setShowCustomerPicker((v) => !v)}
          onCustomerSelect={(id) => { setCustomerId(id); setShowCustomerPicker(false); }}
          onNewCustomer={() => { setShowCustomerPicker(false); setShowNewCustomerForm(true); }}
          onPark={parkCurrentSale}
          onShowParked={() => setShowParkedModal(true)}
          parkedCount={parkedSales.length}
          onClearAll={clearAll}
          onChangeQty={changeQty}
          onSetQty={setQty}
          onRemove={removeFromCart}
          familyMode={isFamilyMode}
        />
        {!isFamilyMode && (
          <ResumenPanel
            computed={computed}
            discountPct={discountPct}
            taxPct={taxPct}
            note={note}
            onOpenDiscount={() => setShowDiscountModal(true)}
            onOpenNote={() => setShowNoteModal(true)}
          />
        )}
        <PagoPanel
          paymentMethod={paymentMethod}
          onPaymentMethod={setPaymentMethod}
          paidCurrency={paidCurrency}
          onPaidCurrency={(v) => { setPaidCurrency(v); setPaidAmount(''); setConfirmingSuspicious(false); }}
          paidAmount={paidAmount}
          onPaidAmount={(v) => { setPaidAmount(v); setConfirmingSuspicious(false); }}
          onSetExactAmount={setExactAmount}
          quickAmounts={quickAmounts}
          onAddQuickAmount={addQuickAmount}
          changeBreakdown={changeBreakdown}
          changeOptions={changeOptions}
          selectedChangeKey={selectedChangeKey}
          onSelectChangeKey={setSelectedChangeKey}
          isSuspicious={isSuspicious}
          error={error}
          submitting={submitting}
          cartCount={cart.length}
          totalUsd={computed.totalUsd}
          totalInPayCurrency={totalInPayCurrency}
          onCheckout={handleCheckout}
          familyMode={isFamilyMode}
          canFamily={canFamily}
        />
      </div>

      {/* MOBILE drawer */}
      {!cartOpen && cart.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 lg:hidden"
        >
          <ShoppingCart className="h-4 w-4" />
          {computed.itemsUnits} u | {formatMoney(computed.totalUsd)}
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button aria-label="Cerrar" onClick={() => setCartOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="relative ml-auto flex w-full max-w-md flex-col overflow-y-auto bg-slate-50 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Venta actual</h2>
              <button onClick={() => setCartOpen(false)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-3">
              <CartPanel
                cart={cart}
                draftSaleId={draftSaleId}
                itemsLines={computed.itemsLines}
                itemsUnits={computed.itemsUnits}
                customer={selectedCustomer}
                customers={customers}
                showCustomerPicker={showCustomerPicker}
                onCustomerToggle={() => setShowCustomerPicker((v) => !v)}
                onCustomerSelect={(id) => { setCustomerId(id); setShowCustomerPicker(false); }}
                onNewCustomer={() => { setShowCustomerPicker(false); setShowNewCustomerForm(true); }}
                onPark={parkCurrentSale}
                onShowParked={() => setShowParkedModal(true)}
                parkedCount={parkedSales.length}
                onClearAll={clearAll}
                onChangeQty={changeQty}
                onSetQty={setQty}
                onRemove={removeFromCart}
                familyMode={isFamilyMode}
              />
              {!isFamilyMode && (
                <ResumenPanel
                  computed={computed}
                  discountPct={discountPct}
                  taxPct={taxPct}
                  note={note}
                  onOpenDiscount={() => setShowDiscountModal(true)}
                  onOpenNote={() => setShowNoteModal(true)}
                />
              )}
              <PagoPanel
                paymentMethod={paymentMethod}
                onPaymentMethod={setPaymentMethod}
                paidCurrency={paidCurrency}
                onPaidCurrency={(v) => { setPaidCurrency(v); setPaidAmount(''); setConfirmingSuspicious(false); }}
                paidAmount={paidAmount}
                onPaidAmount={(v) => { setPaidAmount(v); setConfirmingSuspicious(false); }}
                onSetExactAmount={setExactAmount}
                quickAmounts={quickAmounts}
                onAddQuickAmount={addQuickAmount}
                changeBreakdown={changeBreakdown}
                changeOptions={changeOptions}
                selectedChangeKey={selectedChangeKey}
                onSelectChangeKey={setSelectedChangeKey}
                isSuspicious={isSuspicious}
                error={error}
                submitting={submitting}
                cartCount={cart.length}
                totalUsd={computed.totalUsd}
                onCheckout={handleCheckout}
                familyMode={isFamilyMode}
                canFamily={canFamily}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODALES */}
      {showDiscountModal && (
        <DiscountModal
          discountPct={discountPct}
          taxPct={taxPct}
          onSave={(d, t) => { setDiscountPct(d); setTaxPct(t); setShowDiscountModal(false); }}
          onClose={() => setShowDiscountModal(false)}
        />
      )}
      {showNoteModal && (
        <NoteModal
          initialNote={note}
          onSave={(n) => { setNote(n); setShowNoteModal(false); }}
          onClose={() => setShowNoteModal(false)}
        />
      )}
      {showParkedModal && (
        <ParkedSalesModal
          parkedSales={parkedSales}
          onRecall={recallParkedSale}
          onDelete={deleteParkedSale}
          onClose={() => setShowParkedModal(false)}
        />
      )}
      {success && <SuccessModal success={success} onClose={() => setSuccess(null)} />}

      {showNewCustomerForm && (
        <CustomerForm
          initialValue={null}
          onClose={() => setShowNewCustomerForm(false)}
          onSave={handleCreateCustomer}
        />
      )}
    </div>
    </>
  );
}

// =========================================================================
// ProductCard
// =========================================================================
function ProductCard({ product: p, variant, rank, catName, rates, onAdd, familyMode }) {
  // Stock disponible para esta tarjeta. Si hay variant, mostramos cuántas
  // presentaciones completas caben en el stock base (ej. 180 huevos / 30 por
  // cartón = 6 cartones).
  const baseQty = variant ? Number(variant.base_quantity || 1) : 1;
  const variantStock = variant ? Math.floor(Number(p.stock || 0) / baseQty) : Number(p.stock || 0);
  const variantMinStock = variant
    ? Math.floor(Number(p.min_stock || 0) / baseQty)
    : Number(p.min_stock || 0);
  const lowStock = variantStock <= variantMinStock;
  const noStock = variantStock <= 0;
  const fractional = !variant && isFractionalUnit(p.unit);
  const stockUnit = variant
    ? (variant.name.length > 6 ? variant.name.slice(0, 5) + '.' : variant.name)
    : ((p.unit && p.unit[0]) || 'u');

  const rinoRate = Number(rates?.rino_cop_ves);
  const paraleloRate = Number(rates?.usd_ves_paralelo) || 0;
  const usdCop = Number(rates?.usd_cop) || 0;

  // USD base: variant.price_usd / product.price_usd / cost_avg (familia)
  let usdValue;
  if (familyMode) {
    const costPerBase = Number(p.cost_avg) || 0;
    usdValue = variant ? costPerBase * baseQty : costPerBase;
  } else {
    usdValue = variant ? Number(variant.price_usd || 0) : Number(p.price_usd || 0);
  }

  // COP y Bs. con la regla del negocio
  let priceCop, priceVes;
  if (familyMode) {
    priceCop = usdValue * usdCop;
    priceVes = rinoRate > 0 && priceCop > 0
      ? copToVes(priceCop, rinoRate)
      : usdValue * paraleloRate;
  } else if (variant) {
    priceCop = Number(variant.price_cop) || (usdValue * usdCop);
    priceVes = rinoRate > 0
      ? copToVes(priceCop, rinoRate)
      : usdValue * paraleloRate;
  } else {
    priceCop = Number(p.price_cop) || (usdValue * usdCop);
    priceVes = rinoRate > 0
      ? copToVes(priceCop, rinoRate)
      : usdValue * paraleloRate;
  }
  return (
    <button
      onClick={onAdd}
      disabled={noStock}
      className="group relative flex flex-col items-stretch gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-400 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500"
    >
      {typeof rank === 'number' && (
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
          <AwardIcon className="h-2.5 w-2.5" />
          {`#${rank}`}
        </div>
      )}
      <span
        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          noStock
            ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
            : lowStock
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
        }`}
      >
        {noStock ? 'Sin stock' : `${variantStock.toLocaleString('es-VE')} ${stockUnit}`}
      </span>

      <div className={typeof rank === 'number' ? 'mt-6' : 'mt-0'} />

      <span className="line-clamp-2 pr-12 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {p.name}
        {variant && (
          <span className="ml-1 text-[11px] font-medium text-brand-600 dark:text-brand-400">
            · {variant.name}
          </span>
        )}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {variant
          ? `${variant.base_quantity} ${p.unit || 'u'} base`
          : `SKU | ${p.sku || catName(p.category_id)}`}
      </span>

      <div className="mt-auto space-y-0.5 pt-2">
        <div className={`flex items-baseline gap-1.5 ${
          familyMode
            ? 'text-sky-700 dark:text-sky-400'
            : 'text-emerald-700 dark:text-emerald-400'
        }`}>
          <span className="text-lg font-bold leading-tight">
            {formatMoney(usdValue, 'USD')}
          </span>
          {fractional && (
            <span className="text-[10px] font-normal uppercase tracking-wider text-slate-500 dark:text-slate-400">
              /{p.unit}
            </span>
          )}
          {familyMode && (
            <span className="text-[10px] font-normal uppercase tracking-wider text-sky-500">
              costo
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1 text-sm font-semibold leading-tight text-slate-700 dark:text-slate-300">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            COP
          </span>
          <span className="tabular-nums">
            {priceCop.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex items-baseline gap-1 text-sm font-semibold leading-tight text-slate-700 dark:text-slate-300">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Bs.
          </span>
          <span className="tabular-nums">
            {priceVes.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </button>
  );
}

function AwardIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

function CategoryChip({ label, count, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition ${
        active
          ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
          : disabled
          ? 'cursor-not-allowed border border-slate-100 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-600'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
        active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
      }`}>
        {count}
      </span>
    </button>
  );
}

function IconButton({ children, onClick, title, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`relative flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 ${
        danger ? 'hover:border-red-300 hover:text-red-600 dark:hover:border-red-500/40 dark:hover:text-red-400' : ''
      }`}
    >
      {children}
    </button>
  );
}

// =========================================================================
// QtyInput — input controlado con draft local para que borrar el contenido
// NO elimine el producto del carrito. El producto solo se quita con el botón
// papelera. Hacer blur con valor inválido revierte al qty actual.
// =========================================================================
function QtyInput({ value, onCommit, step, className, ariaLabel }) {
  const [draft, setDraft] = useState(String(value));

  // Sincronizar draft cuando el qty cambia desde fuera (botones +/−).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const trimmed = String(draft).trim();
    if (trimmed === '') {
      setDraft(String(value)); // revertir si quedó vacío
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      setDraft(String(value)); // revertir si es inválido o <= 0
      return;
    }
    onCommit(n);
  }

  return (
    <input
      type="number"
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setDraft(String(value));
          e.currentTarget.blur();
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      className={className}
      min="0"
      aria-label={ariaLabel}
    />
  );
}

// =========================================================================
// CartPanel
// =========================================================================
function CartPanel({
  cart, draftSaleId, itemsLines, itemsUnits,
  customer, customers, showCustomerPicker,
  onCustomerToggle, onCustomerSelect, onNewCustomer,
  onPark, onShowParked, parkedCount, onClearAll,
  onChangeQty, onSetQty, onRemove,
  familyMode,
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex min-w-0 items-center gap-2">
          <ShoppingCart className="h-4 w-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            Venta {draftSaleId ? `#${draftSaleId}` : 'nueva'}
          </h2>
          <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
            {itemsLines} items | {itemsUnits} u
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNewCustomer}
            title="Crear nuevo cliente"
            aria-label="Crear nuevo cliente"
            className="flex h-8 items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 text-xs font-medium text-brand-700 transition hover:border-brand-300 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/15"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nuevo cliente</span>
          </button>
          <CustomerPill
            customer={customer}
            customers={customers}
            open={showCustomerPicker}
            onToggle={onCustomerToggle}
            onSelect={onCustomerSelect}
            onNew={onNewCustomer}
          />
          <div className="flex items-center gap-1 border-l border-slate-200 pl-2 dark:border-slate-700">
            <IconButton onClick={onPark} title="Poner venta en espera" disabled={cart.length === 0}>
              <Pause className="h-4 w-4" />
            </IconButton>
            <IconButton onClick={onShowParked} title={`Ventas en espera (${parkedCount})`} disabled={parkedCount === 0}>
              <ListChecks className="h-4 w-4" />
              {parkedCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {parkedCount}
                </span>
              )}
            </IconButton>
            <IconButton onClick={onClearAll} title="Vaciar carrito" disabled={cart.length === 0} danger>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <ShoppingCart className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">El carrito está vacío</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Toca un producto o búscalo arriba para agregar.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-center font-medium">Cant.</th>
                <th className="px-3 py-2 text-right font-medium">Precio</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cart.map((it) => {
                const key = `${it.product.id}|${it.variant?.id || ''}`;
                const lineFractional = !it.variant && isFractionalUnit(it.product.unit);
                const lineStep = it.variant ? 1 : qtyStepFor(it.product.unit);
                const unitUsd = familyMode
                  ? (it.variant
                      ? Number(it.product.cost_avg || 0) * Number(it.variant.base_quantity || 1)
                      : Number(it.product.cost_avg || 0))
                  : (it.variant
                      ? Number(it.variant.price_usd || 0)
                      : Number(it.product.price_usd || 0));
                return (
                  <tr key={key}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
                        {it.product.name}
                        {it.variant && (
                          <span className="ml-1 text-xs font-normal text-brand-600 dark:text-brand-400">
                            · {it.variant.name}
                          </span>
                        )}
                      </div>
                      {it.variant ? (
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {it.variant.base_quantity} {it.product.unit || 'u'} base · resta {Number(it.variant.base_quantity) * it.qty}
                        </div>
                      ) : it.product.sku && (
                        <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {it.product.sku}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => onChangeQty(key, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:hover:bg-slate-800"
                          aria-label="Restar">
                          <Minus className="h-3 w-3" />
                        </button>
                        <QtyInput
                          value={it.qty}
                          onCommit={(n) => onSetQty(key, n)}
                          step={lineStep}
                          ariaLabel={`Cantidad de ${it.product.name}`}
                          className={`h-7 ${lineFractional ? 'w-16' : 'w-12'} rounded-md border border-slate-200 bg-white text-center text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`}
                        />
                        <button onClick={() => onChangeQty(key, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:hover:bg-slate-800"
                          aria-label="Sumar">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      {lineFractional && (
                        <p className="mt-0.5 text-center text-[10px] text-slate-400 dark:text-slate-500">
                          {it.product.unit}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">
                      {formatMoney(unitUsd)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(unitUsd * it.qty)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button onClick={() => onRemove(key)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CustomerPill({ customer, customers, open, onToggle, onSelect, onNew }) {
  const initials = customer
    ? customer.name.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
    : null;
  const [filter, setFilter] = useState('');
  const filtered = customers.filter((c) =>
    !filter || c.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {customer ? (
          <>
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">
              {initials}
            </span>
            <span className="max-w-[110px] truncate">{customer.name}</span>
          </>
        ) : (
          <>
            <UserIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Cliente genérico</span>
          </>
        )}
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <input
            autoFocus
            type="text"
            placeholder="Buscar cliente..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input mb-2 h-8 text-xs"
          />
          <div className="max-h-60 overflow-y-auto">
            <button
              onClick={() => onSelect('')}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${
                !customer ? 'bg-slate-100 dark:bg-slate-800' : ''
              }`}
            >
              <UserIcon className="h-3.5 w-3.5 text-slate-400" />
              Cliente genérico
            </button>
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  customer?.id === c.id ? 'bg-slate-100 dark:bg-slate-800' : ''
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-400">
                  {c.name.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase()}
                </span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-slate-400">Sin resultados</p>
            )}
          </div>

          {onNew && (
            <button
              onClick={onNew}
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-brand-300 px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo cliente
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// ResumenPanel
// =========================================================================
function ResumenPanel({ computed, discountPct, taxPct, note, onOpenDiscount, onOpenNote }) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Resumen
      </p>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-slate-600 dark:text-slate-400">
            Subtotal ({computed.itemsUnits} u)
          </span>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {formatMoney(computed.subtotalUsd)}
          </span>
        </div>

        {discountPct > 0 && (
          <div className="flex items-baseline justify-between text-red-600 dark:text-red-400">
            <span>Descuento | {discountPct}%</span>
            <span className="font-medium">-{formatMoney(computed.discountAmount)}</span>
          </div>
        )}

        {taxPct > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-slate-600 dark:text-slate-400">IVA | {taxPct}%</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {formatMoney(computed.taxAmount)}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          Total a cobrar
        </p>
        <p className="mt-1 text-3xl font-bold leading-tight text-emerald-700 dark:text-emerald-400">
          {formatMoney(computed.totalUsd)}
        </p>
        <div className="mt-2 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2 text-emerald-700 dark:text-emerald-400">
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
              COP
            </span>
            <span className="text-lg font-bold tabular-nums">
              {Number(computed.cop).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-emerald-700 dark:text-emerald-400">
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
              Bs.
            </span>
            <span className="text-lg font-bold tabular-nums">
              {Number(computed.ves).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={onOpenDiscount}
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <Percent className="h-4 w-4" />
        Aplicar descuento / IVA
      </button>
      <button
        onClick={onOpenNote}
        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <FileText className="h-4 w-4" />
        {note ? 'Editar nota' : 'Agregar nota'}
      </button>
      {note && (
        <p className="line-clamp-3 rounded-md bg-slate-50 p-2 text-xs italic text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          "{note}"
        </p>
      )}
    </div>
  );
}

// =========================================================================
// PagoPanel
// =========================================================================
function PagoPanel({
  paymentMethod, onPaymentMethod,
  paidCurrency, onPaidCurrency,
  paidAmount, onPaidAmount,
  onSetExactAmount, quickAmounts, onAddQuickAmount,
  changeBreakdown, changeOptions, selectedChangeKey, onSelectChangeKey,
  isSuspicious,
  error, submitting, cartCount, totalUsd, totalInPayCurrency, onCheckout,
  familyMode, canFamily,
}) {
  // ===== Modo familia: solo total + botón "Registrar consumo" =====
  if (familyMode) {
    return (
      <div className="flex min-h-0 flex-col justify-between gap-3 rounded-xl border-2 border-sky-300 bg-sky-50/50 p-4 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
            <Lock className="h-3.5 w-3.5" />
            Consumo familiar
          </div>
          <p className="mt-1 text-xs text-sky-600/80 dark:text-sky-400/80">
            Sin cobro · descuento de stock al precio costo
          </p>

          <div className="mt-4 rounded-lg border border-sky-200 bg-white p-3 dark:border-sky-500/30 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Costo total
            </p>
            <p className="mt-1 font-mono text-3xl font-bold text-sky-700 dark:text-sky-400">
              {formatMoney(totalUsd)}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              {cartCount} item{cartCount === 1 ? '' : 's'} en el carrito
            </p>
          </div>

          {!canFamily && (
            <div className="mt-3 flex items-start gap-1.5 rounded-md bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>Solo admin o supervisor pueden registrar consumo familiar.</span>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <button
          onClick={onCheckout}
          disabled={cartCount === 0 || submitting || !canFamily}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-sky-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
        >
          <CheckCircle2 className="h-5 w-5" />
          {submitting ? 'Registrando...' : 'Registrar consumo'}
        </button>
      </div>
    );
  }

  // ===== Modo normal: pago completo =====
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Método de pago
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {PAYMENT_METHODS.map((m) => {
            const Ico = m.icon;
            const active = paymentMethod === m.value;
            return (
              <button
                key={m.value}
                onClick={() => onPaymentMethod(m.value)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Ico className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {paymentMethod !== 'credito' && !isExactMethod(paymentMethod) && (
        <>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Moneda recibida
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {CURRENCIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => onPaidCurrency(c.value)}
                  className={`rounded-lg border p-2 text-xs font-semibold transition ${
                    paidCurrency === c.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Recibido ({paidCurrency})
              </p>
              <button
                onClick={onSetExactAmount}
                className="text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                Monto exacto
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              value={paidAmount}
              onChange={(e) => onPaidAmount(e.target.value)}
              className={`input mt-1.5 text-right font-mono text-xl ${
                isSuspicious ? 'border-amber-400 ring-2 ring-amber-200 dark:ring-amber-500/30' : ''
              }`}
              placeholder="0.00"
            />
            <div className="mt-1.5 flex gap-1">
              {quickAmounts.map((a) => (
                <button
                  key={a}
                  onClick={() => onAddQuickAmount(a)}
                  className="flex-1 rounded-md border border-slate-200 bg-white py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  +{a.toLocaleString('es-VE')}
                </button>
              ))}
            </div>
          </div>

          <button
            disabled
            title="Próximamente"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500"
          >
            <Lock className="h-3 w-3" />
            Dividir pago | Próximamente
          </button>

          <ChangeBreakdownPanel
            breakdown={changeBreakdown}
            paidCurrency={paidCurrency}
            options={changeOptions}
            selectedKey={selectedChangeKey}
            onSelect={onSelectChangeKey}
          />

          {isSuspicious && (
            <div className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>El monto recibido es {SUSPICIOUS_PAYMENT_MULTIPLIER}x el total. Verifica que no hayas tecleado un cero de más.</span>
            </div>
          )}
        </>
      )}

      {isExactMethod(paymentMethod) && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Pago exacto en Bs.
          </div>
          <p className="mt-1 font-mono text-3xl font-bold text-emerald-700 dark:text-emerald-400">
            {Number(totalInPayCurrency).toLocaleString('es-VE', { maximumFractionDigits: 2 })}
            <span className="ml-1.5 text-lg">Bs.</span>
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
            ≈ {formatMoney(totalUsd)}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            Se cobra el total exacto en bolívares desde el dispositivo. Sin vuelto.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-auto pt-1">
        <button
          onClick={onCheckout}
          disabled={cartCount === 0 || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
        >
          <CheckCircle2 className="h-5 w-5" />
          {submitting ? 'Procesando...' : `Cobrar ${formatMoney(totalUsd)}`}
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// ChangeBreakdownPanel
// =========================================================================
function ChangeBreakdownPanel({ breakdown, paidCurrency, options, selectedKey, onSelect }) {
  if (!breakdown) return null;

  if (breakdown.type === 'missing') {
    return (
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Falta cobrar
        </div>
        <div className="mt-1 font-mono text-2xl font-bold text-amber-700 dark:text-amber-400">
          {formatAmount(breakdown.missingInPaidCurrency, paidCurrency)} {paidCurrency}
        </div>
      </div>
    );
  }

  if (breakdown.type === 'exact') {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          Monto exacto
        </span>
      </div>
    );
  }

  // Modo fallback (sin tasa COP) — sin alternativas posibles
  if (breakdown.mode === 'fallback') {
    return (
      <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          <Wallet className="h-3.5 w-3.5" />
          Vuelto
        </div>
        <div className="mt-1 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400">
          {formatAmount(breakdown.fallbackAmount, breakdown.fallbackCurrency)}{' '}
          {breakdown.fallbackCurrency}
        </div>
        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400">
          No hay tasa COP disponible. Devolución en moneda original.
        </p>
      </div>
    );
  }

  // Modo split o cop_only — con alternativas
  const opts = options || [];
  const selected = opts.find((o) => o.key === selectedKey) || opts[0];
  if (!selected) return null;

  const others = opts.filter((o) => o.key !== selected.key);
  const rawUsd = Number(breakdown.rawUsd) || 0;

  return (
    <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
      <div className="flex items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
        <span className="flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" />
          Vuelto
        </span>
        <span className="text-[10px] font-normal opacity-70">
          ${rawUsd.toFixed(2)} · redondeo abajo
        </span>
      </div>

      {/* Opción seleccionada — destacada */}
      <div className="mt-2">
        <ChangeOptionLine option={selected} primary />
        {selected.loss > 0 && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
            ⓘ pierdes ${selected.loss.toFixed(2)} por redondeo
          </p>
        )}
      </div>

      {/* Alternativas */}
      {others.length > 0 && (
        <div className="mt-3 border-t border-emerald-200 pt-2 dark:border-emerald-500/20">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            ¿Otra forma de devolver?
          </p>
          <div className="space-y-1">
            {others.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSelect && onSelect(opt.key)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-emerald-500/10"
              >
                <ChangeOptionLine option={opt} />
                <span className="flex flex-shrink-0 flex-col items-end">
                  {opt.label && (
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {opt.label}
                    </span>
                  )}
                  {opt.loss > 0 && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      −${opt.loss.toFixed(2)}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renderiza una opción del vuelto inline:
 *   "$9 USD + 2.600 COP", "38.500 COP", "$9 USD".
 * Cuando es la opción primaria usa colores grandes; cuando es alternativa, más sutil.
 */
function ChangeOptionLine({ option, primary = false }) {
  const numCls = primary
    ? 'text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400'
    : 'text-base font-bold font-mono text-slate-800 dark:text-slate-200';
  const unitCls = primary
    ? 'text-base font-medium text-emerald-700/80 dark:text-emerald-400/80'
    : 'text-xs font-medium text-slate-500 dark:text-slate-400';
  const sepCls = primary
    ? 'text-base font-light text-emerald-700/60'
    : 'text-sm font-light text-slate-400';

  const hasUsd = (option.usdPart || 0) > 0;
  const hasCop = (option.copPart || 0) > 0;

  if (!hasUsd && !hasCop) {
    return (
      <span className="text-sm font-medium text-slate-500 opacity-70">
        (sin vuelto)
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {hasUsd && (
        <span>
          <span className={numCls}>${option.usdPart}</span>
          <span className={`ml-1 ${unitCls}`}>USD</span>
        </span>
      )}
      {hasUsd && hasCop && <span className={sepCls}>+</span>}
      {hasCop && (
        <span>
          <span className={numCls}>
            {Number(option.copPart).toLocaleString('es-CO')}
          </span>
          <span className={`ml-1 ${unitCls}`}>COP</span>
        </span>
      )}
    </span>
  );
}

function formatAmount(amount, currency) {
  const abs = Math.abs(amount);
  if (currency === 'COP') return abs.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  if (currency === 'VES') return abs.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  return abs.toFixed(2);
}

// =========================================================================
// Modales
// =========================================================================
function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DiscountModal({ discountPct, taxPct, onSave, onClose }) {
  const [d, setD] = useState(discountPct);
  const [t, setT] = useState(taxPct);
  return (
    <ModalShell title="Descuento e IVA" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label text-xs">Descuento (%)</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {DISCOUNT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setD(p)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  d === p
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {p}%
              </button>
            ))}
            <button
              onClick={() => setD(0)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                d === 0
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Sin desc.
            </button>
          </div>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={d}
            onChange={(e) => setD(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="input"
            placeholder="0"
          />
        </div>

        <div>
          <label className="label text-xs">IVA (%)</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[0, 8, 16].map((p) => (
              <button
                key={p}
                onClick={() => setT(p)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  t === p
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {p === 0 ? 'Sin IVA' : `${p}%`}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={t}
            onChange={(e) => setT(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="input"
            placeholder="0"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          <button onClick={() => onSave(d, t)} className="btn-primary flex-1 justify-center">Aplicar</button>
        </div>
      </div>
    </ModalShell>
  );
}

function NoteModal({ initialNote, onSave, onClose }) {
  const [text, setText] = useState(initialNote || '');
  return (
    <ModalShell title="Nota de la venta" onClose={onClose}>
      <textarea
        autoFocus
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="input"
        placeholder="Detalles, referencia interna, etc."
      />
      <p className="mt-1 text-[10px] text-slate-400">
        La nota se guarda con la venta y aparece en /ventas.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
        <button onClick={() => onSave(text.trim())} className="btn-primary flex-1 justify-center">Guardar</button>
      </div>
    </ModalShell>
  );
}

function ParkedSalesModal({ parkedSales, onRecall, onDelete, onClose }) {
  return (
    <ModalShell title={`Ventas en espera (${parkedSales.length})`} onClose={onClose}>
      {parkedSales.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No hay ventas en espera.</p>
      ) : (
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {parkedSales.map((p) => {
            const itemsCount = p.items.reduce((acc, it) => acc + it.qty, 0);
            const totalUsd = p.items.reduce(
              (acc, it) => acc + Number(it.priceUsd || 0) * it.qty, 0
            );
            const dt = new Date(p.timestamp);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.customerName || 'Cliente genérico'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {dt.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{' '}
                    | {p.items.length} items | {itemsCount} u | {formatMoney(totalUsd)}
                  </p>
                </div>
                <button onClick={() => onRecall(p.id)} className="btn-primary px-3 py-1.5 text-xs">
                  Recuperar
                </button>
                <button
                  onClick={() => onDelete(p.id)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex justify-end">
        <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cerrar</button>
      </div>
    </ModalShell>
  );
}

function SuccessModal({ success, onClose }) {
  const { breakdown, total, paidAmount, paidCurrency, family } = success;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 text-center">
        <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full ${
          family
            ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400'
            : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
        }`}>
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {family ? 'Consumo familiar registrado' : 'Venta registrada'}
        </h3>
        {family && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Stock descontado · No afecta reportes financieros
          </p>
        )}

        <div className={`mt-4 ${family ? '' : 'grid grid-cols-2 gap-2'} rounded-lg bg-slate-50 p-3 text-left dark:bg-slate-800`}>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {family ? 'Costo total' : 'Total'}
            </p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{formatMoney(total)}</p>
          </div>
          {!family && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Recibido</p>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {paidCurrency === 'COP'
                  ? Number(paidAmount).toLocaleString('es-CO', { maximumFractionDigits: 0 })
                  : paidCurrency === 'VES'
                    ? Number(paidAmount).toLocaleString('es-VE', { maximumFractionDigits: 2 })
                    : Number(paidAmount).toFixed(2)}{' '}
                {paidCurrency}
              </p>
            </div>
          )}
        </div>

        {breakdown?.type === 'change' && (
          <div className="mt-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Devolver al cliente
            </p>
            <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono text-emerald-700 dark:text-emerald-400">
              {breakdown.mode === 'fallback' ? (
                <span className="text-3xl font-bold">
                  {formatAmount(breakdown.fallbackAmount, breakdown.fallbackCurrency)}{' '}
                  <span className="text-lg">{breakdown.fallbackCurrency}</span>
                </span>
              ) : (
                <>
                  {(breakdown.usdPart || 0) > 0 && (
                    <span className="text-3xl font-bold">${breakdown.usdPart}</span>
                  )}
                  {(breakdown.usdPart || 0) > 0 && (breakdown.copPart || 0) > 0 && (
                    <span className="text-xl opacity-50">+</span>
                  )}
                  {(breakdown.copPart || 0) > 0 && (
                    <span className="text-3xl font-bold">
                      {Number(breakdown.copPart).toLocaleString('es-CO', { maximumFractionDigits: 0 })}{' '}
                      <span className="text-lg">COP</span>
                    </span>
                  )}
                  {(breakdown.usdPart || 0) === 0 && (breakdown.copPart || 0) === 0 && (
                    <span className="text-sm font-medium opacity-70">Vuelto menor a la unidad mínima</span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {breakdown?.type === 'exact' && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Pago exacto, sin vuelto.</p>
        )}

        <button onClick={onClose} className="btn-primary mt-5 w-full justify-center">Continuar</button>
      </div>
    </div>
  );
}