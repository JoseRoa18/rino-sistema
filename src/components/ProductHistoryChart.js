'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

/**
 * Gráfico de evolución de precio de venta y costo unitario por producto.
 *
 * Recibe dos series:
 *   - salePoints:  [{ created_at, unit_price_usd }]  — desde sale_items
 *   - purchasePoints: [{ created_at, unit_cost_usd }] — desde purchase_items
 *
 * Las une por día y las grafica como dos líneas paralelas.
 */
export default function ProductHistoryChart({ salePoints = [], purchasePoints = [] }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Agrupar por día. Para cada día tomamos el último precio/costo registrado.
  const series = useMemo(() => {
    const byDay = new Map();

    function ensure(dayKey) {
      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, { dayKey, price: null, cost: null });
      }
      return byDay.get(dayKey);
    }

    for (const row of salePoints) {
      const d = new Date(row.created_at);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const slot = ensure(key);
      slot.price = Number(row.unit_price_usd) || 0;
    }

    for (const row of purchasePoints) {
      const d = new Date(row.created_at);
      const key = d.toISOString().slice(0, 10);
      const slot = ensure(key);
      slot.cost = Number(row.unit_cost_usd) || 0;
    }

    return Array.from(byDay.values())
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .map((row) => ({
        ...row,
        label: new Date(row.dayKey + 'T12:00:00').toLocaleDateString('es-VE', {
          day: '2-digit',
          month: '2-digit',
        }),
      }));
  }, [salePoints, purchasePoints]);

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
        Aún no hay historial de precios o costos para este producto.
      </div>
    );
  }

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const priceColor = isDark ? '#34d399' : '#059669'; // verde — precio venta
  const costColor = isDark ? '#fb923c' : '#ea580c';  // naranja — costo
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f1f5f9' : '#0f172a';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          stroke={axisColor}
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke={axisColor}
          fontSize={12}
          tickFormatter={(v) => `$${v}`}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: 8,
            color: tooltipText,
            fontSize: 12,
          }}
          formatter={(v, name) => [
            v == null ? '—' : `$${Number(v).toFixed(2)}`,
            name,
          ]}
          labelStyle={{ color: tooltipText, fontWeight: 500 }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Line
          type="monotone"
          dataKey="price"
          name="Precio venta"
          stroke={priceColor}
          strokeWidth={2.5}
          dot={{ r: 3, fill: priceColor, stroke: priceColor }}
          activeDot={{ r: 5 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="cost"
          name="Costo unitario"
          stroke={costColor}
          strokeWidth={2.5}
          strokeDasharray="5 4"
          dot={{ r: 3, fill: costColor, stroke: costColor }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
