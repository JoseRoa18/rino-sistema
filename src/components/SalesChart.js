'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function SalesChart({ data }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const series = (data || []).map((row) => ({
    day: new Date(row.day).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }),
    total: Number(row.total_usd || 0),
  }));

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
        Aún no hay ventas para mostrar.
      </div>
    );
  }

  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#64748b';
  const lineColor = isDark ? '#38bdf8' : '#0284c7';
  const fillColor = isDark ? '#0ea5e9' : '#0284c7';
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f1f5f9' : '#0f172a';

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis stroke={axisColor} fontSize={12} tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: 8,
            color: tooltipText,
            fontSize: 12,
          }}
          formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Ventas']}
          labelStyle={{ color: tooltipText, fontWeight: 500 }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={lineColor}
          strokeWidth={2.5}
          fill="url(#salesGradient)"
          dot={false}
          activeDot={{ r: 5, stroke: lineColor, strokeWidth: 2, fill: tooltipBg }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
