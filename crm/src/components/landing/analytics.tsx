"use client";
import * as React from "react";
import { format, parseISO } from "date-fns";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Eye, Send, Percent, PhoneCall, MousePointerClick, Users } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Card, Loading, Select, Stat, Table, Td, Th, Badge } from "@/components/ui";
import { pct } from "@/lib/utils";
import { seriesColor } from "./types";

const UNATTRIBUTED = "#8a8a85";

export function AnalyticsTab({ pageId }: { pageId: string }) {
  const [days, setDays] = React.useState(30);
  const q = trpc.landing.stats.useQuery({ pageId, days });
  const d = q.data;
  const series = React.useMemo(() => {
    if (!d) return [];
    return d.variants
      .map((v, i) => ({ ...v, color: v.id === "none" ? UNATTRIBUTED : seriesColor(i) }))
      .filter((v) => v.id !== "none" || d.days.some((x) => x.by.none!.views || x.by.none!.submits));
  }, [d]);
  const rows = React.useMemo(() => (d?.days ?? []).map((x) => {
    const r: Record<string, number | string> = { date: x.date, label: format(parseISO(x.date), "MMM d") };
    for (const v of series) { r[`views_${v.id}`] = x.by[v.id]?.views ?? 0; r[`submits_${v.id}`] = x.by[v.id]?.submits ?? 0; }
    return r;
  }), [d, series]);

  if (q.isLoading || !d) return <Loading />;
  const chart = (metric: "views" | "submits", title: string) => (
    <Card title={title}>
      <div className="h-64 px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgb(var(--faint))" }} tickLine={false} axisLine={{ stroke: "rgb(var(--border))" }} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "rgb(var(--faint))" }} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ background: "rgb(var(--bg))", border: "1px solid rgb(var(--border))", borderRadius: 6, fontSize: 12, color: "rgb(var(--fg))" }}
              labelStyle={{ color: "rgb(var(--muted))" }} cursor={{ stroke: "rgb(var(--border-strong))" }} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "rgb(var(--muted))" }} iconType="plainline" />}
            {series.map((v) => (
              <Line key={v.id} type="monotone" dataKey={`${metric}_${v.id}`} name={v.name} stroke={v.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "rgb(var(--bg))" }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="text-sm font-semibold">Performance</div>
        <Select className="ml-auto w-36" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
          <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Views" icon={<Eye className="h-3.5 w-3.5" />} value={d.totals.views.toLocaleString()} sub="unique per visitor per day" />
        <Stat label="Visitors" icon={<Users className="h-3.5 w-3.5" />} value={d.totals.visitors.toLocaleString()} />
        <Stat label="Form submits" icon={<Send className="h-3.5 w-3.5" />} value={d.totals.submits.toLocaleString()} />
        <Stat label="Conversion" icon={<Percent className="h-3.5 w-3.5" />} value={pct(d.totals.conversion)} />
        <Stat label="Call clicks" icon={<PhoneCall className="h-3.5 w-3.5" />} value={d.totals.call_clicks.toLocaleString()} />
        <Stat label="CTA clicks" icon={<MousePointerClick className="h-3.5 w-3.5" />} value={d.totals.cta_clicks.toLocaleString()} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {chart("views", "Daily views by variant")}
        {chart("submits", "Daily form submits by variant")}
      </div>
      <Card title="By variant" className="mt-4">
        <Table>
          <thead><tr><Th>Variant</Th><Th className="text-right">Views</Th><Th className="text-right">Submits</Th><Th className="text-right">Conversion</Th><Th className="text-right">Uplift vs control</Th><Th className="text-right">Confidence</Th></tr></thead>
          <tbody>
            {series.map((v) => {
              const p = d.perVariant.find((x) => x.id === v.id)!;
              return (
                <tr key={v.id}>
                  <Td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: v.color }} />{v.name}{v.is_control && <Badge tone="blue" className="ml-1.5">control</Badge>}</Td>
                  <Td className="text-right tabular-nums">{p.views.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">{p.submits.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">{p.views ? pct(p.conversion) : "–"}</Td>
                  <Td className="text-right tabular-nums">{p.uplift == null ? "–" : `${p.uplift > 0 ? "+" : ""}${(p.uplift * 100).toFixed(1)}%`}</Td>
                  <Td className="text-right tabular-nums">{p.confidence == null ? "–" : `${p.confidence.toFixed(0)}%`}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
