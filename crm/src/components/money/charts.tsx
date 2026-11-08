"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";

/* One accent hue, neutral axes, readable in both themes (all colors come from CSS tokens). */
export const ACCENT = "rgb(var(--accent))";
const AXIS = "rgb(var(--faint))";
const GRID = "rgb(var(--border))";
const tick = { fill: AXIS, fontSize: 11 };

function Tip({ active, payload, label, fmt, labelFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs shadow-pop">
      <div className="mb-0.5 text-muted">{labelFmt ? labelFmt(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-1.5 font-medium text-fg">
          <span className="h-2 w-2 rounded-sm" style={{ background: ACCENT, opacity: p.payload?.__muted ? 0.35 : 1 }} />
          {p.name}: {fmt ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

export function TrendArea({ data, x, y, name, fmt, xFmt, height = 220 }: { data: any[]; x: string; y: string; name: string; fmt?: (v: number) => string; xFmt?: (v: any) => string; height?: number }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xFmt} minTickGap={24} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={52} tickFormatter={fmt} />
          <Tooltip content={<Tip fmt={fmt} labelFmt={xFmt} />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey={y} name={name} stroke={ACCENT} strokeWidth={2} fill={`url(#g${id})`} activeDot={{ r: 4, stroke: "rgb(var(--bg))", strokeWidth: 2, fill: ACCENT }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, x, y, name, fmt, xFmt, height = 220, highlightLast }: { data: any[]; x: string; y: string; name: string; fmt?: (v: number) => string; xFmt?: (v: any) => string; height?: number; highlightLast?: boolean }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={tick} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xFmt} minTickGap={8} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={52} tickFormatter={fmt} allowDecimals={false} />
          <Tooltip content={<Tip fmt={fmt} labelFmt={xFmt} />} cursor={{ fill: "rgb(var(--hover))" }} />
          <Bar dataKey={y} name={name} radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((_, i) => <Cell key={i} fill={ACCENT} fillOpacity={highlightLast && i !== data.length - 1 ? 0.55 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut in one hue (opacity steps), always with a labelled legend so identity is never color-alone. */
export function Donut({ data, fmt, height = 180 }: { data: { name: string; value: number }[]; fmt: (v: number) => string; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const op = (i: number) => Math.max(0.2, 1 - i * 0.2);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div style={{ width: height, height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke="rgb(var(--bg))" strokeWidth={2} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={ACCENT} fillOpacity={op(i)} />)}
            </Pie>
            <Tooltip content={<Tip fmt={fmt} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs text-faint">Total</div><div className="text-sm font-semibold">{fmt(total)}</div>
        </div>
      </div>
      <div className="min-w-[160px] flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ACCENT, opacity: op(i) }} />
            <span className="flex-1 truncate text-muted">{d.name}</span>
            <span className="font-medium tabular-nums">{fmt(d.value)}</span>
            <span className="w-12 text-right text-xs tabular-nums text-faint">{total ? `${Math.round((d.value / total) * 100)}%` : "–"}</span>
          </div>
        ))}
        {!data.length && <div className="text-sm text-faint">No data in this period.</div>}
      </div>
    </div>
  );
}

/** Horizontal bar list in plain HTML (funnels, rankings). */
export function BarList({ rows, fmt, sub }: { rows: { key: string; label: React.ReactNode; value: number; sub?: React.ReactNode }[]; fmt: (v: number) => string; sub?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} title={`${typeof r.label === "string" ? r.label : r.key}: ${fmt(r.value)}`}>
          <div className="mb-0.5 flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{fmt(r.value)}{sub && r.sub != null && <span className="ml-1.5 text-xs font-normal text-faint">{r.sub}</span>}</span>
          </div>
          <div className="h-1.5 rounded-full bg-subtle">
            <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: ACCENT }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** KPI tile with a delta vs. the prior period. `invert` = lower is better. */
export function Kpi({ label, value, d, sub, invert, icon, className }: { label: string; value: React.ReactNode; d?: number | null; sub?: React.ReactNode; invert?: boolean; icon?: React.ReactNode; className?: string }) {
  const good = d == null ? null : invert ? d < 0 : d > 0;
  return (
    <div className={cn("rounded-md border border-border bg-bg p-3.5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">{icon}{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs">
        {d != null && Number.isFinite(d) && (
          <span className={cn("font-medium", good ? "text-success" : d === 0 ? "text-faint" : "text-danger")}>{d > 0 ? "▲" : d < 0 ? "▼" : ""} {Math.abs(d * 100).toFixed(1)}%</span>
        )}
        {sub && <span className="truncate text-faint">{sub}</span>}
      </div>
    </div>
  );
}

/** Renders children into a body-level `.print-root` that is hidden on screen and is the only thing printed. Mount one at a time. */
export function PrintPortal({ children }: { children: React.ReactNode }) {
  const [m, setM] = React.useState(false);
  React.useEffect(() => setM(true), []);
  if (!m) return null;
  return createPortal(
    <div className="print-root">
      <style>{`.print-root { display: none; }
      @media print {
        @page { margin: 12mm; }
        html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
        body > *:not(.print-root) { display: none !important; }
        .print-root { display: block !important; --bg: 255 255 255; --panel: 255 255 255; --subtle: 244 244 244; --border: 210 210 210; --border-strong: 180 180 180; --fg: 17 17 17; --muted: 70 70 70; --faint: 110 110 110; color: rgb(17 17 17); background: #fff; font-size: 12px; }
        .print-root table { width: 100%; border-collapse: collapse; }
        .print-root th, .print-root td { border-bottom: 1px solid rgb(220 220 220); padding: 4px 6px; text-align: left; }
      }`}</style>
      {children}
    </div>,
    document.body,
  );
}
