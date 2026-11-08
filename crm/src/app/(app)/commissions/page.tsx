"use client";
import * as React from "react";
import Link from "next/link";
import { format, startOfMonth, startOfYear, endOfMonth } from "date-fns";
import { Percent, Plus, Download, FileText, Settings2, Printer, CheckCheck, Banknote, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, Toolbar, Button, Select, Input, Table, Th, Td, Checkbox, StatusBadge, Empty, Loading, Dialog, Field, Avatar, confirmAction } from "@/components/ui";
import { money, pct, cn } from "@/lib/utils";
import { PrintPortal } from "@/components/money/charts";
import { presetRange, downloadCsv, ymd } from "@/components/money/period";

const PERIODS = [{ id: "month", label: "This month" }, { id: "last_month", label: "Last month" }, { id: "ytd", label: "Year to date" }, { id: "all", label: "All time" }];

export default function CommissionsPage() {
  const me = trpc.team.me.useQuery();
  const admin = me.data ? me.data.role !== "rep" : false;
  const [rep, setRep] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [period, setPeriod] = React.useState("all");
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [adj, setAdj] = React.useState(false);
  const [statementFor, setStatementFor] = React.useState<string | null>(null);
  const [settingsFor, setSettingsFor] = React.useState<any | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);

  const range = period === "all" ? null : presetRange(period);
  const list = trpc.commissions.list.useQuery({ rep_id: rep || undefined, status: (status || undefined) as any, from: range?.from.toISOString(), to: range?.to.toISOString() });
  const summary = trpc.commissions.summary.useQuery({ monthStart: startOfMonth(new Date()).toISOString(), yearStart: startOfYear(new Date()).toISOString() });
  const approve = trpc.commissions.approve.useMutation({ onSuccess: (r) => { toast.success(`Approved ${r.updated}`); setSel(new Set()); } });
  const voidM = trpc.commissions.void.useMutation({ onSuccess: (r) => { toast.success(`Voided ${r.updated}`); setSel(new Set()); } });
  const reopen = trpc.commissions.reopen.useMutation({ onSuccess: (r) => { toast.success(`Reopened ${r.updated}`); setSel(new Set()); } });
  const rows = (list.data?.rows ?? []) as any[];
  const selRows = rows.filter((r) => sel.has(r.id));
  React.useEffect(() => setSel(new Set()), [rep, status, period]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Percent className="h-4 w-4" />} title="Commissions" count={rows.length}
        actions={<>
          <Button icon={<Download className="h-3.5 w-3.5" />} disabled={!rows.length} onClick={() => downloadCsv("commissions.csv", [
            ["Rep", "Account", "Payment date", "Payment amount", "Base", "Rate", "Commission", "Status", "Earned", "Paid", "Note"],
            ...rows.map((r) => [r.rep?.full_name, r.company?.name ?? "", r.payment?.received_at?.slice(0, 10) ?? "", r.payment ? Number(r.payment.amount).toFixed(2) : "", Number(r.base_amount).toFixed(2), (Number(r.rate) * 100).toFixed(2) + "%", Number(r.amount).toFixed(2), r.status, r.earned_at.slice(0, 10), r.paid_at?.slice(0, 10) ?? "", r.note ?? ""]),
          ])}>Export</Button>
          {!admin && me.data && <Button icon={<FileText className="h-3.5 w-3.5" />} onClick={() => setStatementFor(me.data!.id)}>My statement</Button>}
          {admin && <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setAdj(true)}>Manual adjustment</Button>}
        </>} />
      <div className="shrink-0 border-b border-border bg-panel p-4">
        {summary.isLoading ? <Loading /> : !(summary.data ?? []).length ? <div className="text-sm text-faint">No reps with commission plans yet. Set a rate on the Team page.</div> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(summary.data ?? []).map((r: any) => (
              <div key={r.id} className={cn("rounded-md border border-border bg-bg p-3", rep === r.id && "ring-2 ring-accent/30")}>
                <div className="flex items-center gap-2">
                  <Avatar name={r.full_name} color={r.color} size={24} />
                  <button className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline" onClick={() => admin && setRep(rep === r.id ? "" : r.id)}>{r.full_name}</button>
                  <span className="text-xs text-muted">{pct(Number(r.commission_rate), 1)} · {r.commission_months} mo</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted">Earned this month</div><div className="text-sm font-semibold tabular-nums">{money(r.earned_month)}</div></div>
                  <div><div className="text-muted">Approved unpaid</div><div className="text-sm font-semibold tabular-nums">{money(r.approved_unpaid)}</div></div>
                  <div><div className="text-muted">Paid YTD</div><div className="text-sm font-semibold tabular-nums">{money(r.paid_ytd)}</div></div>
                  <div><div className="text-muted">Accounts closed</div><div className="text-sm font-semibold tabular-nums">{r.accounts_closed}</div></div>
                  <div className="col-span-2"><div className="text-muted">Revenue sourced (lifetime · YTD)</div><div className="text-sm font-semibold tabular-nums">{money(r.revenue_sourced, { cents: false })} <span className="font-normal text-faint">· {money(r.revenue_sourced_ytd, { cents: false })}</span></div></div>
                </div>
                {r.earned_unapproved > 0 && <div className="mt-1 text-xs text-faint">{money(r.earned_unapproved)} earned awaiting approval</div>}
                <div className="mt-2 flex gap-1.5">
                  <Button size="xs" icon={<FileText className="h-3 w-3" />} onClick={() => setStatementFor(r.id)}>Statement</Button>
                  {admin && <Button size="xs" variant="ghost" icon={<Settings2 className="h-3 w-3" />} onClick={() => setSettingsFor(r)}>Plan</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Toolbar>
        {admin && (
          <Select className="w-44" value={rep} onChange={(e) => setRep(e.target.value)}>
            <option value="">All reps</option>
            {(summary.data ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </Select>
        )}
        <Select className="w-32" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>{["earned", "approved", "paid", "void"].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select className="w-36" value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
        {list.data && <span className="text-xs text-faint">Base {money(list.data.totals.base)} · commission {money(list.data.totals.amount)} · earned {money(list.data.totals.earned)} · approved {money(list.data.totals.approved)} · paid {money(list.data.totals.paid)}</span>}
      </Toolbar>
      {admin && sel.size > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-accent-soft px-4 py-1.5 text-sm">
          <span className="font-medium">{sel.size} selected · {money(selRows.reduce((s, r) => s + Number(r.amount), 0))}</span>
          <div className="ml-auto flex gap-1.5">
            <Button size="xs" icon={<CheckCheck className="h-3 w-3" />} loading={approve.isPending} onClick={() => approve.mutate({ ids: Array.from(sel) })}>Approve</Button>
            <Button size="xs" variant="primary" icon={<Banknote className="h-3 w-3" />} onClick={() => setPayOpen(true)}>Mark paid</Button>
            <Button size="xs" variant="ghost" icon={<RotateCcw className="h-3 w-3" />} onClick={() => reopen.mutate({ ids: Array.from(sel) })}>Reopen</Button>
            <Button size="xs" variant="ghost" icon={<Ban className="h-3 w-3" />} onClick={() => { if (confirmAction(`Void ${sel.size} commission row(s)? Paid rows are skipped.`)) voidM.mutate({ ids: Array.from(sel) }); }}>Void</Button>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {list.isLoading ? <Loading /> : !rows.length ? <Empty title="No commissions" body="Commissions accrue automatically when a rep's account pays." /> : (
          <Table className="flex-1">
            <thead><tr>
              {admin && <Th className="w-8"><Checkbox checked={sel.size === rows.length} onChange={(v) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set())} /></Th>}
              <Th>Rep</Th><Th>Account</Th><Th>Payment</Th><Th className="text-right">Base</Th><Th className="text-right">Rate</Th><Th className="text-right">Commission</Th><Th>Status</Th><Th>Earned</Th><Th>Paid</Th><Th>Note</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn("hover:bg-hover/60", sel.has(r.id) && "bg-accent-soft/50", r.status === "void" && "text-faint line-through decoration-faint/50")}>
                  {admin && <Td><Checkbox checked={sel.has(r.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} /></Td>}
                  <Td><span className="flex items-center gap-1.5"><Avatar name={r.rep?.full_name} color={r.rep?.color} size={18} />{r.rep?.full_name}</span></Td>
                  <Td className="max-w-[200px] truncate">{r.company ? <Link className="hover:underline" href={`/accounts/${r.company.id}`}>{r.company.name}</Link> : "—"}</Td>
                  <Td className="text-muted">{r.payment ? <>{money(r.payment.amount)} · {r.payment.method} · {format(new Date(r.payment.received_at), "MMM d")}{r.payment.invoice_id && <Link className="ml-1 text-accent hover:underline" href={`/invoices/${r.payment.invoice_id}`}>invoice</Link>}</> : "manual"}</Td>
                  <Td className="text-right tabular-nums">{money(r.base_amount)}</Td>
                  <Td className="text-right tabular-nums text-muted">{Number(r.rate) ? pct(Number(r.rate), 1) : "—"}</Td>
                  <Td className={cn("text-right font-medium tabular-nums", Number(r.amount) < 0 && "text-danger")}>{money(r.amount)}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="tabular-nums text-muted">{format(new Date(r.earned_at), "MMM d, yyyy")}</Td>
                  <Td className="tabular-nums text-muted">{r.paid_at ? format(new Date(r.paid_at), "MMM d, yyyy") : "—"}</Td>
                  <Td className="max-w-[220px] truncate text-muted">{r.note}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {admin && <AdjustmentDialog open={adj} onClose={() => setAdj(false)} reps={(summary.data ?? []) as any[]} />}
      {admin && <MarkPaidDialog open={payOpen} onClose={() => setPayOpen(false)} rows={selRows} onDone={() => setSel(new Set())} />}
      {statementFor && <StatementDialog repId={statementFor} reps={(summary.data ?? []) as any[]} admin={admin} onClose={() => setStatementFor(null)} />}
      {settingsFor && <PlanDialog rep={settingsFor} onClose={() => setSettingsFor(null)} />}
    </div>
  );
}

function MarkPaidDialog({ open, onClose, rows, onDone }: { open: boolean; onClose: () => void; rows: any[]; onDone: () => void }) {
  const [date, setDate] = React.useState(ymd(new Date()));
  const [method, setMethod] = React.useState("payroll");
  const m = trpc.commissions.markPaid.useMutation({ onSuccess: (r) => { toast.success(`Paid ${r.paid} rows · ${money(r.total)} booked as commission expense`); onDone(); onClose(); } });
  const payable = rows.filter((r) => r.status === "earned" || r.status === "approved");
  const byRep = payable.reduce<Record<string, { name: string; amount: number }>>((acc, r) => { acc[r.rep_id] ??= { name: r.rep?.full_name, amount: 0 }; acc[r.rep_id]!.amount += Number(r.amount); return acc; }, {});
  return (
    <Dialog open={open} onClose={onClose} width={440} title="Mark commissions paid"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!payable.length} loading={m.isPending} onClick={() => {
        const d = new Date(date + "T12:00:00"); m.mutate({ ids: payable.map((r) => r.id), paid_at: (date === ymd(new Date()) ? new Date() : d).toISOString(), method });
      }}>Pay {money(payable.reduce((s, r) => s + Number(r.amount), 0))}</Button></>}>
      <div className="space-y-3">
        <div className="text-sm text-muted">{payable.length} payable rows{rows.length !== payable.length ? ` (${rows.length - payable.length} paid/void skipped)` : ""}. One “commission” cash-out transaction is recorded per rep so cash flow shows the payout.</div>
        <div className="rounded border border-border">{Object.entries(byRep).map(([id, v]) => <div key={id} className="flex justify-between border-b border-border px-3 py-1.5 text-sm last:border-0"><span>{v.name}</span><span className="font-medium tabular-nums">{money(v.amount)}</span></div>)}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Paid via"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{["payroll", "ach", "check", "zelle", "cash"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </div>
      </div>
    </Dialog>
  );
}

function AdjustmentDialog({ open, onClose, reps }: { open: boolean; onClose: () => void; reps: any[] }) {
  const companies = trpc.companies.options.useQuery(undefined, { enabled: open });
  const [f, setF] = React.useState({ rep_id: "", amount: "", note: "", company_id: "", date: ymd(new Date()) });
  const m = trpc.commissions.addAdjustment.useMutation({ onSuccess: () => { toast.success("Adjustment added"); onClose(); setF({ rep_id: "", amount: "", note: "", company_id: "", date: ymd(new Date()) }); } });
  return (
    <Dialog open={open} onClose={onClose} width={440} title="Manual commission adjustment"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} disabled={!f.rep_id || !Number(f.amount) || !f.note.trim()} onClick={() => m.mutate({
        rep_id: f.rep_id, amount: Number(f.amount), note: f.note.trim(), company_id: f.company_id || null, earned_at: new Date(f.date + "T12:00:00").toISOString(),
      })}>Add adjustment</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rep" className="col-span-2"><Select value={f.rep_id} onChange={(e) => setF({ ...f, rep_id: e.target.value })}><option value="">Select rep…</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}</Select></Field>
        <Field label="Amount" hint="Negative to claw back"><Input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Account (optional)" className="col-span-2"><Select value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}><option value="">None</option>{((companies.data ?? []) as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Reason" className="col-span-2"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Signing bonus for Coast Toyota" /></Field>
      </div>
    </Dialog>
  );
}

function PlanDialog({ rep, onClose }: { rep: any; onClose: () => void }) {
  const [rate, setRate] = React.useState(String(Math.round(Number(rep.commission_rate) * 10000) / 100));
  const [months, setMonths] = React.useState(String(rep.commission_months));
  const m = trpc.team.update.useMutation({ onSuccess: () => { toast.success("Commission plan updated"); onClose(); } });
  return (
    <Dialog open onClose={onClose} width={380} title={`Commission plan · ${rep.full_name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ id: rep.id, commission_rate: Math.min(1, Math.max(0, Number(rate) / 100)), commission_months: Math.max(0, Math.round(Number(months))) })}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate (%)" hint="Of each payment from their accounts"><Input type="number" step="0.5" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <Field label="Months" hint="How long after close they earn"><Input type="number" min="0" max="120" value={months} onChange={(e) => setMonths(e.target.value)} /></Field>
      </div>
      <div className="mt-3 text-xs text-faint">Applies to future payments only. Existing ledger rows keep their rate.</div>
    </Dialog>
  );
}

function StatementDialog({ repId, reps, admin, onClose }: { repId: string; reps: any[]; admin: boolean; onClose: () => void }) {
  const [rep, setRep] = React.useState(repId);
  const [month, setMonth] = React.useState(format(new Date(), "yyyy-MM"));
  const start = new Date(month + "-01T00:00:00");
  const q = trpc.commissions.statement.useQuery({ rep_id: rep, from: startOfMonth(start).toISOString(), to: endOfMonth(start).toISOString() });
  const s = q.data;
  const body = s && (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div><div className="text-base font-semibold">Commission statement</div><div className="text-sm text-muted">Newport Smog &amp; Auto Registration</div></div>
        <div className="text-right text-sm"><div className="font-semibold">{s.rep.full_name}</div><div className="text-muted">{format(start, "MMMM yyyy")} · {pct(Number(s.rep.commission_rate), 1)} for {s.rep.commission_months} mo</div></div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-sm">
        {[["Revenue sourced", s.totals.base], ["Commission earned", s.totals.amount], ["Paid", s.totals.paid], ["Outstanding", s.totals.unpaid]].map(([l, v]) => (
          <div key={l as string} className="rounded border border-border p-2"><div className="text-xs text-muted">{l}</div><div className="font-semibold tabular-nums">{money(v as number)}</div></div>
        ))}
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">By account</div>
        <table className="w-full text-sm"><tbody>
          {s.byAccount.map((a) => <tr key={a.name} className="border-t border-border"><td className="py-1">{a.name}</td><td className="text-right tabular-nums text-muted">{a.n} payments</td><td className="text-right tabular-nums">{money(a.base)}</td><td className="text-right font-medium tabular-nums">{money(a.amount)}</td></tr>)}
          {!s.byAccount.length && <tr><td className="py-2 text-faint">No commission activity this month.</td></tr>}
        </tbody></table>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Detail</div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1">Date</th><th>Account</th><th>Source</th><th className="text-right">Base</th><th className="text-right">Rate</th><th className="text-right">Commission</th><th>Status</th></tr></thead>
          <tbody>{(s.rows as any[]).map((r) => (
            <tr key={r.id} className={cn("border-t border-border", r.status === "void" && "text-faint line-through")}>
              <td className="py-0.5">{format(new Date(r.earned_at), "MM/dd")}</td><td>{r.company?.name ?? "—"}</td>
              <td>{r.payment ? `${r.payment.method}${r.payment.invoice_id ? " (invoice)" : ""}` : r.note ?? "manual"}</td>
              <td className="text-right tabular-nums">{money(r.base_amount)}</td><td className="text-right tabular-nums">{Number(r.rate) ? pct(Number(r.rate), 1) : "—"}</td>
              <td className="text-right tabular-nums">{money(r.amount)}</td><td className="capitalize">{r.status}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="text-xs text-faint">Commission paid out during {format(start, "MMMM")}: {money(s.totals.paid_in_period)} · generated {format(new Date(), "MMM d, yyyy h:mm a")}</div>
    </div>
  );
  return (
    <Dialog open onClose={onClose} width={760} title="Commission statement"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={<Printer className="h-3.5 w-3.5" />} disabled={!s} onClick={() => window.print()}>Print</Button></>}>
      <div className="mb-3 flex gap-2">
        {admin && <Select className="w-48" value={rep} onChange={(e) => setRep(e.target.value)}>{reps.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}</Select>}
        <Input type="month" className="w-44" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {q.isLoading ? <Loading /> : body}
      {s && <PrintPortal>{body}</PrintPortal>}
    </Dialog>
  );
}

