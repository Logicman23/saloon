"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/utils";
import type { RevenuePoint } from "@/lib/types";

/**
 * Chart palette. Gold leads because it is the brand accent; the supporting
 * hues are chosen to stay distinguishable on an obsidian canvas and in
 * greyscale print.
 */
export const CHART_COLORS = {
  services: "#d4af37",
  retail: "#38bdf8",
  expenses: "#e11d48",
  profit: "#10b981",
  grid: "#262626",
  axis: "#6b6b6b",
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Hair: "#d4af37",
  Skin: "#e5c158",
  Makeup: "#c084fc",
  Nails: "#38bdf8",
  Spa: "#10b981",
  Retail: "#f97316",
};

const axisProps = {
  stroke: CHART_COLORS.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/** Shared dark tooltip so every chart reads identically. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-hairline-strong bg-charcoal/95 px-3 py-2 shadow-xl backdrop-blur">
      {label && <p className="mb-1.5 text-xs font-medium text-ink">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="capitalize text-muted">{entry.name}</span>
            <span className="tabular ml-auto font-medium text-ink">
              {formatMoney(entry.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------- Revenue vs. expenses */

export function RevenueTrendChart({ data, height = 280 }: { data: RevenuePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="fill-services" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.services} stopOpacity={0.45} />
            <stop offset="100%" stopColor={CHART_COLORS.services} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fill-retail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.retail} stopOpacity={0.4} />
            <stop offset="100%" stopColor={CHART_COLORS.retail} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} tickFormatter={(v: number) => formatMoneyCompact(v)} width={62} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: CHART_COLORS.grid }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#a0a0a0", paddingTop: 8 }}
        />

        <Area
          type="monotone"
          dataKey="services"
          name="Services"
          stroke={CHART_COLORS.services}
          strokeWidth={2}
          fill="url(#fill-services)"
          stackId="rev"
        />
        <Area
          type="monotone"
          dataKey="retail"
          name="Retail"
          stroke={CHART_COLORS.retail}
          strokeWidth={2}
          fill="url(#fill-retail)"
          stackId="rev"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------- Income vs. expenditure */

export function IncomeExpenseChart({ data, height = 300 }: { data: RevenuePoint[]; height?: number }) {
  const shaped = data.map((d) => ({
    ...d,
    income: d.services + d.retail,
    profit: d.services + d.retail - d.expenses,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} tickFormatter={(v: number) => formatMoneyCompact(v)} width={62} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#a0a0a0", paddingTop: 8 }}
        />

        <Bar dataKey="income" name="Income" fill={CHART_COLORS.services} radius={[4, 4, 0, 0]} maxBarSize={38} />
        <Bar dataKey="expenses" name="Expenses" fill={CHART_COLORS.expenses} radius={[4, 4, 0, 0]} maxBarSize={38} />
        <Line
          type="monotone"
          dataKey="profit"
          name="Net profit"
          stroke={CHART_COLORS.profit}
          strokeWidth={2.5}
          dot={{ r: 3, fill: CHART_COLORS.profit, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------- Category donut */

export function CategoryDonut({
  data,
  height = 260,
}: {
  data: Array<{ category: string; revenue: number }>;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="revenue"
            nameKey="category"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell
                key={entry.category}
                fill={CATEGORY_COLORS[entry.category] ?? CHART_COLORS.services}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Centre total */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] uppercase tracking-[0.16em] text-faint">Total</p>
        <p className="tabular text-lg font-semibold text-ink">{formatMoneyCompact(total)}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------ Horizontal bar (staff) */

export function HorizontalRevenueBars({
  data,
  height = 280,
}: {
  data: Array<{ name: string; services: number; retail: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatMoneyCompact(v)} />
        <YAxis type="category" dataKey="name" {...axisProps} width={92} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#a0a0a0", paddingTop: 8 }}
        />
        <Bar dataKey="services" name="Services" stackId="a" fill={CHART_COLORS.services} radius={[0, 0, 0, 0]} />
        <Bar dataKey="retail" name="Retail" stackId="a" fill={CHART_COLORS.retail} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
