"use client";
import * as React from "react";
import { format } from "date-fns";
import { LineChart, RefreshCw, Download, Plus, Sparkles, Search, Trash2, Wand2, Landmark, Save, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { PageHeader, Toolbar, Button, Card, Select, Input, Tabs, Loading, Empty, Table, Th, Td, Dialog, Field, Markdown, IconButton, confirmAction, Badge } from "@/components/ui";
import { money, compactMoney, pct, cn, relTime } from "@/lib/utils";
import { Kpi, TrendArea, Bars, Donut, BarList } from "@/components/money/charts";
import { FINANCE_PRESETS, presetRange, previousRange, rangeLabel, toISO, ymd, delta, downloadCsv, tzOffset, SERVICE_CATEGORY_LABEL, TXN_CATEGORY_LABEL } from "@/components/money/period";

type Pnl = RouterOutputs["finance"]["pnl"]["current"];
const CATS = Object.keys(TXN_CATEGORY_LABEL);
const OPEX = ["payroll", "rent", "utilities", "marketing", "software", "commission", "supplies", "insurance", "fees", "other_opex", "uncategorized"];

export default function FinancePage() {
  const me = trpc.team.me.useQuery();
  const [preset, setPreset] = React.useState("mtd");
  const [custom, setCustom] = React.useState({ from: ymd(new Date(new Date().getFullYear(), 0, 1)), to: ymd(new Date()) });
  const [tab, setTab] = React.useState("overview");
  const range = React.useMemo(() => presetRange(preset, custom), [preset, custom]);
  const prev = React.useMemo(() => previousRange(preset, range), [preset, range]);
  const admin = me.data ? me.data.role !== "rep" : null;
  const pnl = trpc.finance.pnl.useQuery({ ...toISO(range), compareFrom: prev.from.toISOString(), compareTo: prev.to.toISOString() }, { enabled: !!admin });
  const sync = trpc.finance.sync.useMutation({ onSuccess: (r) => toast.success(`Mercury: ${r.imported} new transactions, ${r.matched} invoice payments matched`) });

  if (admin === false) return <Empty icon={<ShieldAlert className="h-6 w-6" />} title="Owner/admin only" body="Finance is limited to the owner and admins." />;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<LineChart className="h-4 w-4" />} title="Finance"
        actions={<>
          <Button icon={<RefreshCw className="h-3.5 w-3.5" />} loading={sync.isPending} onClick={() => sync.mutate({ days: 90 })}>Sync Mercury</Button>
          <Button icon={<Download className="h-3.5 w-3.5" />} disabled={!pnl.data} onClick={() => pnl.data && exportPnl(pnl.data.current, pnl.data.previous)}>Export P&amp;L</Button>
        </>} />
      <Toolbar>
        <Select className="w-44" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {FINANCE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
        {preset === "custom" && <>
          <Input type="date" className="w-36" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <span className="text-faint">to</span>
          <Input type="date" className="w-36" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </>}
        <span className="text-xs text-muted">{rangeLabel(range)}</span>
        <span className="text-xs text-faint">vs {rangeLabel(prev)}</span>
      </Toolbar>
      <Tabs tabs={[{ id: "overview", label: "Overview & P&L" }, { id: "transactions", label: "Transactions" }, { id: "rules", label: "Auto-categorize rules" }]} value={tab} onChange={setTab} />
      <div className="flex-1 overflow-auto bg-panel">
        {tab === "overview" && (pnl.isLoading || !pnl.data ? <Loading /> : <Overview cur={pnl.data.current} prev={pnl.data.previous} range={toISO(range)} />)}
        {tab === "transactions" && <Transactions range={toISO(range)} />}
        {tab === "rules" && <Rules />}
      </div>
    </div>
  );
}

function pnlLines(c: Pnl) {
  const L: { label: string; v: (p: Pnl) => number; kind?: "head" | "total" | "sub" | "pct"; pctOf?: boolean }[] = [
    { label: "Gross revenue", v: (p) => p.revenue, kind: "head" },
    ...["smog", "retest", "dmv", "vin", "other"].map((k) => ({ label: `  ${SERVICE_CATEGORY_LABEL[k]}`, v: (p: Pnl) => (p.revenue_by_category as Record<string, number>)[k] ?? 0, kind: "sub" as const })),
    { label: "  Retail", v: (p) => p.retail, kind: "sub" }, { label: "  Partner accounts", v: (p) => p.partner, kind: "sub" },
    { label: "Cost of goods sold", v: (p) => -p.cogs.total, kind: "head" },
    { label: "  Smog certificates (pass-through)", v: (p) => -p.cogs.cert_fees, kind: "sub" },
    { label: "  Service cost (catalog)", v: (p) => -p.cogs.service_cost, kind: "sub" },
    { label: "  Other COGS (bank)", v: (p) => -p.cogs.bank, kind: "sub" },
    { label: "Gross profit", v: (p) => p.gross_profit, kind: "total" },
    { label: "Gross margin", v: (p) => p.gross_margin, kind: "pct" },
    { label: "Operating expenses", v: (p) => -p.opex_total, kind: "head" },
    ...OPEX.map((k) => ({ label: `  ${k === "commission" ? "Commissions (ledger)" : TXN_CATEGORY_LABEL[k]}`, v: (p: Pnl) => -((p.opex as Record<string, number>)[k] ?? 0), kind: "sub" as const })),
    { label: "EBITDA", v: (p) => p.ebitda, kind: "total" },
    { label: "EBITDA margin", v: (p) => p.ebitda_margin, kind: "pct" },
    { label: "  Interest", v: (p) => -p.below.interest, kind: "sub" }, { label: "  Taxes", v: (p) => -p.below.taxes, kind: "sub" }, { label: "  Depreciation", v: (p) => -p.below.depreciation, kind: "sub" },
    { label: "Net profit", v: (p) => p.net_profit, kind: "total" },
    { label: "Net margin", v: (p) => p.net_margin, kind: "pct" },
  ];
  return L.filter((l) => !(l.kind === "sub" && l.v(c) === 0 && !l.label.includes("Smog") && !l.label.includes("Retail") && !l.label.includes("Partner")));
}

function exportPnl(c: Pnl, p: Pnl) {
  const lines = pnlLines(c);
  downloadCsv(`pnl-${c.from.slice(0, 10)}-to-${c.to.slice(0, 10)}.csv`, [
    ["Line", `Current (${c.from.slice(0, 10)} to ${c.to.slice(0, 10)})`, "% of revenue", `Previous (${p.from.slice(0, 10)} to ${p.to.slice(0, 10)})`, "Change"],
    ...lines.map((l) => l.kind === "pct" ? [l.label.trim(), (l.v(c) * 100).toFixed(1) + "%", "", (l.v(p) * 100).toFixed(1) + "%", ((l.v(c) - l.v(p)) * 100).toFixed(1) + " pts"]
      : [l.label.trim(), l.v(c).toFixed(2), c.revenue ? ((l.v(c) / c.revenue) * 100).toFixed(1) + "%" : "", l.v(p).toFixed(2), (l.v(c) - l.v(p)).toFixed(2)]),
    [], ["Cash collected", c.cash_collected.toFixed(2), "", p.cash_collected.toFixed(2), ""], ["Cars", c.cars, "", p.cars, ""], ["Average ticket", c.avg_ticket.toFixed(2), "", p.avg_ticket.toFixed(2), ""],
  ]);
}

function Overview({ cur, prev, range }: { cur: Pnl; prev: Pnl; range: { from: string; to: string } }) {
  const ov = trpc.finance.overview.useQuery({ ...range, tzOffset: tzOffset() });
  const o = ov.data;
  const ltv = o ? o.revenuePerRetailCustomer12m * cur.gross_margin * 3 : null;
  const partnerMix = cur.revenue ? cur.partner / cur.revenue : 0;
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Gross revenue" value={money(cur.revenue, { cents: false })} d={delta(cur.revenue, prev.revenue)} sub={`prev ${compactMoney(prev.revenue)}`} />
        <Kpi label="Gross profit" value={money(cur.gross_profit, { cents: false })} d={delta(cur.gross_profit, prev.gross_profit)} sub={`${pct(cur.gross_margin)} margin`} />
        <Kpi label="EBITDA" value={money(cur.ebitda, { cents: false })} d={delta(cur.ebitda, prev.ebitda)} sub={`${pct(cur.ebitda_margin)} margin`} />
        <Kpi label="Net profit" value={money(cur.net_profit, { cents: false })} d={delta(cur.net_profit, prev.net_profit)} sub={`${pct(cur.net_margin)} margin`} />
        <Kpi label="Cash collected" value={money(cur.cash_collected, { cents: false })} d={delta(cur.cash_collected, prev.cash_collected)} sub={`${cur.revenue ? pct(cur.cash_collected / cur.revenue, 0) : "–"} of revenue`} />
        <Kpi label="Cars" value={cur.cars.toLocaleString()} d={delta(cur.cars, prev.cars)} sub={`${cur.cars_per_day.toFixed(1)}/operating day`} />
        <Kpi label="Average ticket" value={money(cur.avg_ticket)} d={delta(cur.avg_ticket, prev.avg_ticket)} />
        <Kpi label="Pass rate" value={cur.pass + cur.fail ? pct(cur.pass_rate) : "–"} d={delta(cur.pass_rate, prev.pass_rate)} sub={`${cur.certificates} certificates`} />
        <Kpi label="Retail / partner mix" value={`${pct(1 - partnerMix, 0)} / ${pct(partnerMix, 0)}`} sub={`${compactMoney(cur.retail)} retail · ${compactMoney(cur.partner)} partner`} />
        <Kpi label="CAC" value={o?.cac != null ? money(o.cac) : "–"} sub={o ? `${money(o.marketing, { cents: false })} marketing / ${o.newCustomers + o.newAccounts} new` : ""} invert />
        <Kpi label="LTV (est.)" value={ltv != null ? money(ltv, { cents: false }) : "–"} sub={o?.cac && ltv ? `LTV:CAC ${(ltv / o.cac).toFixed(1)}x` : "12-mo spend × GM × 3 visits"} />
        <Kpi label="Break-even cars/day" value={cur.break_even_cars_per_day != null ? cur.break_even_cars_per_day.toFixed(1) : "–"} sub={`${money(cur.contribution_per_car)} contribution/car`} />
      </div>
      {cur.uncategorized_count > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm"><Badge tone="amber">{cur.uncategorized_count}</Badge>
          uncategorized outflows ({money(cur.opex.uncategorized)}) are counted as opex. Categorize them in the Transactions tab for an accurate P&amp;L.</div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card title="Profit & loss" action={<span className="text-xs text-faint">accrual: jobs by date performed</span>}>
          <PnlTable cur={cur} prev={prev} />
        </Card>
        <div className="space-y-4">
          <Card title="Revenue by month (12 mo)">
            <div className="p-3">{o ? <Bars data={o.months} x="month" y="revenue" name="Revenue" fmt={(v) => compactMoney(v)} xFmt={(m) => format(new Date(m + "-15"), "MMM")} highlightLast /> : <Loading />}</div>
          </Card>
          <Card title="Revenue by service">
            <div className="p-4">{o ? <Donut data={o.byService.map((s) => ({ name: SERVICE_CATEGORY_LABEL[s.category] ?? s.category, value: s.revenue }))} fmt={(v) => money(v, { cents: false })} /> : <Loading />}</div>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Cars per day" className="lg:col-span-2">
          <div className="p-3">{o ? <TrendArea data={o.days} x="day" y="cars" name="Cars" xFmt={(d) => format(new Date(d + "T12:00:00"), "MMM d")} /> : <Loading />}</div>
        </Card>
        <Card title="AR aging" action={o && <span className="text-xs text-faint">{o.openInvoices} open invoices</span>}>
          <div className="p-4">{o ? <BarList fmt={(v) => money(v, { cents: false })} rows={[
            { key: "c", label: "Current", value: o.aging.current }, { key: "1", label: "1–30 days", value: o.aging.d1_30 }, { key: "31", label: "31–60 days", value: o.aging.d31_60 },
            { key: "61", label: "61–90 days", value: o.aging.d61_90 }, { key: "90", label: "90+ days", value: o.aging.d90 },
          ]} /> : <Loading />}
            {o && <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-medium"><span>Total open</span><span className="tabular-nums">{money(o.aging.total)}</span></div>}</div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Top partner accounts">
          <div className="p-4">{o ? (o.topAccounts.length ? <BarList sub fmt={(v) => money(v, { cents: false })} rows={o.topAccounts.map((a) => ({ key: a.id, label: a.name, value: a.revenue, sub: `${a.cars} cars` }))} /> : <div className="text-sm text-faint">No partner revenue in this period.</div>) : <Loading />}</div>
        </Card>
        <Balances />
        <CfoInsights range={range} />
      </div>
    </div>
  );
}

function PnlTable({ cur, prev }: { cur: Pnl; prev: Pnl }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-border text-xs text-muted"><th className="px-4 py-2 text-left font-medium">Line</th><th className="text-right font-medium">Current</th><th className="w-16 text-right font-medium">% rev</th><th className="text-right font-medium">Previous</th><th className="px-4 text-right font-medium">Change</th></tr></thead>
      <tbody>
        {pnlLines(cur).map((l) => {
          const c = l.v(cur), p = l.v(prev);
          if (l.kind === "pct") return (
            <tr key={l.label} className="text-xs text-muted"><td className="px-4 py-1">{l.label}</td><td className="text-right tabular-nums">{pct(c)}</td><td /><td className="text-right tabular-nums">{pct(p)}</td>
              <td className={cn("px-4 text-right tabular-nums", c - p >= 0 ? "text-success" : "text-danger")}>{((c - p) * 100).toFixed(1)} pts</td></tr>);
          const d = delta(c, p);
          const good = c - p >= 0; // expenses are negative, so "up" is always better
          return (
            <tr key={l.label} className={cn(l.kind === "total" && "border-t border-border-strong bg-subtle font-semibold", l.kind === "head" && "border-t border-border font-medium")}>
              <td className={cn("px-4 py-1.5", l.kind === "sub" && "pl-8 text-muted")}>{l.label.trim()}</td>
              <td className="text-right tabular-nums">{money(c)}</td>
              <td className="text-right text-xs tabular-nums text-faint">{cur.revenue ? pct(c / cur.revenue, 0) : ""}</td>
              <td className="text-right tabular-nums text-muted">{money(p)}</td>
              <td className={cn("px-4 text-right text-xs tabular-nums", d == null ? "text-faint" : good ? "text-success" : "text-danger")}>{d == null ? "–" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}%`}</td>
            </tr>
          );
        })}
        <tr className="border-t border-border text-muted"><td className="px-4 py-1.5">Cash collected (payments)</td><td className="text-right tabular-nums">{money(cur.cash_collected)}</td><td /><td className="text-right tabular-nums">{money(prev.cash_collected)}</td><td /></tr>
        <tr className="text-muted"><td className="px-4 py-1.5 pb-3">Owner draws (excluded)</td><td className="pb-3 text-right tabular-nums">{money(cur.owner_draw)}</td><td /><td className="pb-3 text-right tabular-nums">{money(prev.owner_draw)}</td><td /></tr>
      </tbody>
    </table>
  );
}

function Balances() {
  const s = trpc.finance.mercuryStatus.useQuery();
  const sync = trpc.finance.sync.useMutation({ onSuccess: (r) => toast.success(`Synced: ${r.imported} new, ${r.matched} matched`) });
  const b = s.data?.balances ?? [];
  return (
    <Card title={<span className="flex items-center gap-1.5"><Landmark className="h-4 w-4 text-muted" />Mercury balances</span>} action={<Button size="xs" loading={sync.isPending} icon={<RefreshCw className="h-3 w-3" />} onClick={() => sync.mutate({ days: 30 })}>Sync now</Button>}>
      <div className="space-y-2 p-4">
        {b.map((a) => (
          <div key={a.name} className="flex items-baseline justify-between text-sm"><span className="text-muted">{a.name}</span>
            <span className="text-right"><span className="font-semibold tabular-nums">{money(a.available)}</span>{a.current !== a.available && <span className="ml-1.5 text-xs text-faint">({money(a.current)} current)</span>}</span></div>
        ))}
        {b.length > 0 && <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold"><span>Total available</span><span className="tabular-nums">{money(b.reduce((t, a) => t + Number(a.available), 0))}</span></div>}
        {!b.length && <div className="text-sm text-faint">Not synced yet. Connect Mercury (MERCURY_API_TOKEN) and press Sync now.</div>}
        {s.data?.at && <div className="text-xs text-faint">Last sync {relTime(s.data.at)} · {s.data.imported} imported · {s.data.matched} matched</div>}
      </div>
    </Card>
  );
}

function CfoInsights({ range }: { range: { from: string; to: string } }) {
  const last = trpc.finance.lastInsights.useQuery();
  const run = trpc.finance.insights.useMutation();
  const data = run.data ?? last.data;
  return (
    <Card title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-accent" />AI CFO insights</span>}
      action={<Button size="xs" loading={run.isPending} icon={<RefreshCw className="h-3 w-3" />} onClick={() => run.mutate(range)}>{data ? "Refresh" : "Generate"}</Button>}>
      <div className="max-h-[360px] overflow-auto p-4">
        {run.isPending ? <Loading label="Analyzing the numbers…" /> : data ? <><Markdown text={data.text} /><div className="mt-2 text-xs text-faint">Generated {relTime(data.at)}</div></>
          : <div className="text-sm text-faint">Get five specific, numbered recommendations based on this period&apos;s P&amp;L, AR and unit economics.</div>}
      </div>
    </Card>
  );
}

/* ---------------- Transactions ---------------- */
function Transactions({ range }: { range: { from: string; to: string } }) {
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState("");
  const [dir, setDir] = React.useState("");
  const [all, setAll] = React.useState(false);
  const [add, setAdd] = React.useState(false);
  const [rule, setRule] = React.useState<{ id: string; match: string; category: string } | null>(null);
  const list = trpc.finance.transactions.useQuery({ q: q.trim() || undefined, category: cat || undefined, direction: (dir || undefined) as any, ...(all ? {} : range), limit: 1000 });
  const setCategory = trpc.finance.setCategory.useMutation();
  const del = trpc.finance.deleteTransaction.useMutation({ onSuccess: () => toast.success("Deleted") });
  const rows = list.data?.rows ?? [];
  const inSum = rows.filter((r) => Number(r.amount) > 0).reduce((s, r) => s + Number(r.amount), 0);
  const outSum = rows.filter((r) => Number(r.amount) < 0).reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="flex h-full flex-col bg-bg">
      <Toolbar>
        <div className="relative w-60"><Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" /><Input className="pl-7" placeholder="Search counterparty, description" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="w-40" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATS.map((c) => <option key={c} value={c}>{TXN_CATEGORY_LABEL[c]}</option>)}</Select>
        <Select className="w-28" value={dir} onChange={(e) => setDir(e.target.value)}><option value="">In &amp; out</option><option value="in">Money in</option><option value="out">Money out</option></Select>
        <label className="flex items-center gap-1.5 text-sm text-muted"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />All dates</label>
        <span className="text-xs text-faint">{rows.length} shown · in {money(inSum)} · out {money(outSum)}</span>
        <div className="ml-auto flex gap-2">
          <Button icon={<Download className="h-3.5 w-3.5" />} disabled={!rows.length} onClick={() => downloadCsv("transactions.csv", [["Date", "Account", "Counterparty", "Description", "Category", "Amount", "Source"], ...rows.map((r) => [format(new Date(r.posted_at), "yyyy-MM-dd"), r.account_name, r.counterparty, r.description, r.category, Number(r.amount).toFixed(2), r.mercury_id ? "mercury" : "manual"])])}>CSV</Button>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdd(true)}>Add expense</Button>
        </div>
      </Toolbar>
      {list.isLoading ? <Loading /> : !rows.length ? <Empty title="No transactions" body="Sync Mercury or add an expense manually." /> : (
        <Table className="flex-1">
          <thead><tr><Th>Date</Th><Th>Account</Th><Th>Counterparty</Th><Th>Description</Th><Th>Category</Th><Th className="text-right">Amount</Th><Th className="w-16" /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="group hover:bg-hover/60">
                <Td className="tabular-nums text-muted">{format(new Date(r.posted_at), "MMM d, yyyy")}</Td>
                <Td className="text-muted">{r.account_name}</Td>
                <Td className="max-w-[220px] truncate font-medium">{r.counterparty}</Td>
                <Td className="max-w-[300px] truncate text-muted">{r.description}</Td>
                <Td className="py-0.5">
                  <Select className={cn("w-36", r.category === "uncategorized" && "[&_select]:border-warning")} value={r.category} onChange={(e) => setCategory.mutate({ ids: [r.id], category: e.target.value as any })}>
                    {CATS.map((c) => <option key={c} value={c}>{TXN_CATEGORY_LABEL[c]}</option>)}
                  </Select>
                </Td>
                <Td className={cn("text-right font-medium tabular-nums", Number(r.amount) > 0 ? "text-success" : "")}>{money(r.amount)}</Td>
                <Td>
                  <div className="flex justify-end opacity-0 group-hover:opacity-100">
                    <IconButton label="Make a rule from this" onClick={() => setRule({ id: r.id, match: String(r.counterparty ?? r.description ?? "").toLowerCase().slice(0, 40), category: r.category === "uncategorized" ? "other_opex" : r.category })}><Wand2 className="h-3.5 w-3.5" /></IconButton>
                    {!r.mercury_id && <IconButton label="Delete" onClick={() => { if (confirmAction("Delete this manual transaction?")) del.mutate({ id: r.id }); }}><Trash2 className="h-3.5 w-3.5" /></IconButton>}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <AddExpenseDialog open={add} onClose={() => setAdd(false)} />
      <Dialog open={!!rule} onClose={() => setRule(null)} width={420} title="Create categorize rule"
        footer={<><Button variant="ghost" onClick={() => setRule(null)}>Cancel</Button>
          <Button variant="primary" loading={setCategory.isPending} disabled={!rule?.match.trim()} onClick={() => setCategory.mutate({ ids: [rule!.id], category: rule!.category as any, remember: rule!.match }, { onSuccess: () => { toast.success("Rule saved; future syncs use it"); setRule(null); } })}>Save rule</Button></>}>
        {rule && <div className="space-y-3">
          <Field label="When counterparty / description contains"><Input value={rule.match} onChange={(e) => setRule({ ...rule, match: e.target.value })} /></Field>
          <Field label="Categorize as"><Select value={rule.category} onChange={(e) => setRule({ ...rule, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{TXN_CATEGORY_LABEL[c]}</option>)}</Select></Field>
          <div className="text-xs text-faint">This transaction is updated now. Use the Rules tab → “Apply to uncategorized” to re-run on older ones.</div>
        </div>}
      </Dialog>
    </div>
  );
}

function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = React.useState({ date: ymd(new Date()), amount: "", counterparty: "", description: "", category: "supplies", income: false, account: "" });
  const m = trpc.finance.addTransaction.useMutation({ onSuccess: () => { toast.success("Transaction added"); onClose(); setF((x) => ({ ...x, amount: "", counterparty: "", description: "" })); } });
  return (
    <Dialog open={open} onClose={onClose} width={460} title="Add expense"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={m.isPending} disabled={!(Number(f.amount) > 0) || !f.counterparty.trim()} onClick={() => m.mutate({
          posted_at: new Date(f.date + "T12:00:00").toISOString(), amount: (f.income ? 1 : -1) * Math.abs(Number(f.amount)), counterparty: f.counterparty.trim(),
          description: f.description.trim() || null, category: f.category as any, account_name: f.account.trim() || null,
        })}>Add</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Amount"><Input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" autoFocus /></Field>
        <Field label="Paid to / from" className="col-span-2"><Input value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} placeholder="e.g. Costco" /></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{TXN_CATEGORY_LABEL[c]}</option>)}</Select></Field>
        <Field label="Account"><Input value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} placeholder="Manual / cash / card" /></Field>
        <Field label="Description" className="col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={f.income} onChange={(e) => setF({ ...f, income: e.target.checked })} />This is money in (refund / other income), not an expense</label>
      </div>
    </Dialog>
  );
}

/* ---------------- Rules ---------------- */
function Rules() {
  const q = trpc.settings.categoryRules.useQuery();
  const [rules, setRules] = React.useState<{ match: string; category: string }[] | null>(null);
  React.useEffect(() => { if (q.data && rules === null) setRules(q.data); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = trpc.settings.set.useMutation({ onSuccess: () => toast.success("Rules saved") });
  const apply = trpc.finance.applyRules.useMutation({ onSuccess: (r) => toast.success(`Recategorized ${r.updated} of ${r.scanned} transactions`) });
  if (!rules) return <Loading />;
  const dirty = JSON.stringify(rules) !== JSON.stringify(q.data);
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm text-muted">First match wins. Matching is case-insensitive against counterparty + description. Used on every Mercury sync.</div>
        <Button icon={<Wand2 className="h-3.5 w-3.5" />} loading={apply.isPending && !apply.variables?.all} disabled={dirty} onClick={() => apply.mutate({ all: false })}>Apply to uncategorized</Button>
        <Button variant="ghost" loading={apply.isPending && !!apply.variables?.all} disabled={dirty} onClick={() => { if (confirmAction("Re-apply rules to ALL transactions? Manual categories that match a rule will be overwritten.")) apply.mutate({ all: true }); }}>Re-apply to all</Button>
        <Button variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={save.isPending} disabled={!dirty} onClick={() => { const clean = rules.filter((r) => r.match.trim()).map((r) => ({ match: r.match.trim().toLowerCase(), category: r.category })); save.mutate({ key: "category_rules", value: clean }, { onSuccess: () => setRules(clean) }); }}>Save rules</Button>
      </div>
      <Card>
        <div className="divide-y divide-border">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-6 text-right text-xs tabular-nums text-faint">{i + 1}</span>
              <Input className="flex-1" value={r.match} placeholder="text to match" onChange={(e) => setRules(rules.map((x, k) => k === i ? { ...x, match: e.target.value } : x))} />
              <span className="text-xs text-faint">→</span>
              <Select className="w-44" value={r.category} onChange={(e) => setRules(rules.map((x, k) => k === i ? { ...x, category: e.target.value } : x))}>{CATS.map((c) => <option key={c} value={c}>{TXN_CATEGORY_LABEL[c]}</option>)}</Select>
              <IconButton label="Remove rule" onClick={() => setRules(rules.filter((_, k) => k !== i))}><X className="h-3.5 w-3.5" /></IconButton>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2"><Button size="xs" variant="ghost" icon={<Plus className="h-3 w-3" />} onClick={() => setRules([...rules, { match: "", category: "other_opex" }])}>Add rule</Button></div>
      </Card>
      {dirty && <div className="text-xs text-warning">Unsaved changes. Save before applying.</div>}
    </div>
  );
}
