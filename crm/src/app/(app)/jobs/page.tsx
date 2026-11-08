"use client";
import * as React from "react";
import { format, subDays, addDays, startOfDay, endOfDay } from "date-fns";
import { Wrench, Plus, Download, ClipboardList, Printer, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { PageHeader, Toolbar, Button, Select, Input, Dialog, Loading, Stat } from "@/components/ui";
import { money, pct, jobNo, fullName } from "@/lib/utils";
import { LogJobDialog } from "@/components/money/log-job";
import { JobsTable, type JobRow } from "@/components/money/jobs-table";
import { PrintPortal } from "@/components/money/charts";
import { JOB_PRESETS, PAYMENT_METHODS, SERVICE_CATEGORY_LABEL, presetRange, rangeLabel, downloadCsv, ymd } from "@/components/money/period";

export default function JobsPage() {
  const [preset, setPreset] = React.useState<string>("today");
  const [custom, setCustom] = React.useState({ from: ymd(subDays(new Date(), 7)), to: ymd(new Date()) });
  const [service, setService] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [result, setResult] = React.useState("");
  const [method, setMethod] = React.useState("");
  const [account, setAccount] = React.useState("");
  const [q, setQ] = React.useState("");
  const [logOpen, setLogOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);

  const range = React.useMemo(() => presetRange(preset, custom), [preset, custom]);
  const services = trpc.settings.services.useQuery();
  const companies = trpc.companies.options.useQuery();
  const list = trpc.jobs.list.useQuery({
    from: range.from.toISOString(), to: range.to.toISOString(), service_id: service || undefined, category: category || undefined,
    result: (result || undefined) as any, payment_method: (method || undefined) as any, company_id: account || undefined, q: q.trim() || undefined, limit: 5000,
  });
  const rows = (list.data?.rows ?? []) as JobRow[];

  function exportCsv() {
    downloadCsv(`jobs-${ymd(range.from)}-to-${ymd(range.to)}.csv`, [
      ["Job", "Performed at", "Account", "Customer", "Phone", "Vehicle", "VIN", "Plate", "Service", "Category", "Result", "Price", "Cert fee", "Total", "Payment", "Paid", "Invoice", "Technician"],
      ...rows.map((r) => [
        jobNo(r.number), format(new Date(r.performed_at), "yyyy-MM-dd HH:mm"), r.company?.name ?? "Retail", r.contact ? fullName(r.contact) : "", r.contact?.phone ?? "",
        [r.vehicle?.year, r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(" "), r.vehicle?.vin ?? "", r.vehicle?.plate ?? "",
        r.service?.name ?? r.description ?? "", r.service?.category ?? "", r.result, Number(r.price).toFixed(2), Number(r.cert_fee).toFixed(2),
        (Number(r.price) + Number(r.cert_fee)).toFixed(2), r.payment_method, r.paid ? "yes" : "no", r.invoice ? `INV-${r.invoice.number}` : "", r.technician?.full_name ?? "",
      ]),
    ]);
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Wrench className="h-4 w-4" />} title="Smog Jobs" count={list.data?.totals.count}
        actions={<>
          <Button icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setCloseOpen(true)}>Daily close</Button>
          <Button icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLogOpen(true)}>Log job</Button>
        </>} />
      <Toolbar>
        <div className="inline-flex rounded border border-border p-0.5">
          {JOB_PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)} className={`h-7 rounded px-2.5 text-sm ${preset === p.id ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg"}`}>{p.label}</button>
          ))}
        </div>
        {preset === "custom" && <>
          <Input type="date" className="w-36" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <span className="text-faint">to</span>
          <Input type="date" className="w-36" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </>}
        <span className="text-xs text-faint">{rangeLabel(range)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-40"><Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" /><Input className="pl-7" placeholder="Job # or note" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="w-32" value={category} onChange={(e) => { setCategory(e.target.value); setService(""); }}>
            <option value="">All categories</option>
            {Object.entries(SERVICE_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select className="w-40" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">All services</option>
            {((services.data ?? []) as any[]).filter((s) => !category || s.category === category).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select className="w-28" value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">Any result</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="na">N/A</option>
          </Select>
          <Select className="w-32" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Any payment</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}
          </Select>
          <Select className="w-44" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All customers</option><option value="retail">Retail only</option><option value="partner">All partners</option>
            {((companies.data ?? []) as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <JobsTable rows={rows} totals={list.data?.totals} loading={list.isLoading} />
      </div>
      <LogJobDialog open={logOpen} onClose={() => setLogOpen(false)} />
      {closeOpen && <DailyClose onClose={() => setCloseOpen(false)} />}
    </div>
  );
}

function DailyClose({ onClose }: { onClose: () => void }) {
  const [day, setDay] = React.useState(new Date());
  const q = trpc.jobs.dailyClose.useQuery({ from: startOfDay(day).toISOString(), to: endOfDay(day).toISOString() });
  const d = q.data;
  const report = d && <CloseReport d={d} day={day} />;
  return (
    <Dialog open onClose={onClose} width={760} title="Daily close"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" icon={<Printer className="h-3.5 w-3.5" />} disabled={!d} onClick={() => window.print()}>Print</Button>
      </>}>
      <div className="mb-3 flex items-center gap-2">
        <Button size="xs" variant="outline" onClick={() => setDay(subDays(day, 1))} aria-label="Previous day"><ChevronLeft className="h-3.5 w-3.5" /></Button>
        <Input type="date" className="w-40" value={ymd(day)} onChange={(e) => e.target.value && setDay(new Date(e.target.value + "T12:00:00"))} />
        <Button size="xs" variant="outline" onClick={() => setDay(addDays(day, 1))} aria-label="Next day"><ChevronRight className="h-3.5 w-3.5" /></Button>
        <Button size="xs" variant="ghost" onClick={() => setDay(new Date())}>Today</Button>
      </div>
      {q.isLoading ? <Loading /> : report}
      {d && <PrintPortal>{report}</PrintPortal>}
    </Dialog>
  );
}

type Close = RouterOutputs["jobs"]["dailyClose"];
function CloseReport({ d, day }: { d: Close; day: Date }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-base font-semibold">Newport Smog &amp; Auto Registration · Daily close</div>
        <div className="text-sm text-muted">{format(day, "EEEE, MMMM d, yyyy")} · printed {format(new Date(), "MMM d, h:mm a")}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Cars" value={d.cars} sub={`${d.pass} pass · ${d.fail} fail · ${d.na} n/a`} />
        <Stat label="Pass rate" value={d.pass + d.fail ? pct(d.pass_rate, 0) : "—"} />
        <Stat label="Gross sales" value={money(d.total)} sub={`Retail ${money(d.retail)} · Partner ${money(d.partner)}`} />
        <Stat label="Certificates issued" value={d.certs} sub={`${money(d.cert_cost)} owed to BAR`} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tally by payment method</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1">Method</th><th className="text-right">Tickets</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {PAYMENT_METHODS.map((m) => (
                <tr key={m} className="border-t border-border"><td className="py-1 capitalize">{m === "invoice" ? "On account (invoice)" : m}</td><td className="text-right tabular-nums">{d.byMethod[m].count}</td><td className="text-right tabular-nums">{money(d.byMethod[m].amount)}</td></tr>
              ))}
              <tr className="border-t border-border-strong font-semibold"><td className="py-1">Total</td><td className="text-right tabular-nums">{d.cars}</td><td className="text-right tabular-nums">{money(d.total)}</td></tr>
              <tr className="text-muted"><td className="py-1">Collected today (cash + card + check + zelle)</td><td /><td className="text-right tabular-nums">{money(d.collected)}</td></tr>
              {d.unpaid > 0 && <tr className="text-danger"><td className="py-1">Unpaid tickets (not on invoice)</td><td /><td className="text-right tabular-nums">{money(d.unpaid)}</td></tr>}
            </tbody>
          </table>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded border border-border p-2"><div className="text-xs text-muted">DMV registrations</div><div className="font-semibold">{d.registrations}</div></div>
            <div className="rounded border border-border p-2"><div className="text-xs text-muted">VIN verifications</div><div className="font-semibold">{d.vin}</div></div>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">By service</div>
          <table className="w-full text-sm">
            <tbody>
              {d.byService.map((s) => <tr key={s.name} className="border-t border-border"><td className="py-1">{s.name}</td><td className="text-right tabular-nums">{s.count}</td><td className="text-right tabular-nums">{money(s.amount)}</td></tr>)}
              {!d.byService.length && <tr><td className="py-2 text-faint">No jobs logged.</td></tr>}
            </tbody>
          </table>
          <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">By technician</div>
          <table className="w-full text-sm">
            <tbody>{d.byTech.map((s) => <tr key={s.name} className="border-t border-border"><td className="py-1">{s.name}</td><td className="text-right tabular-nums">{s.count} cars</td><td className="text-right tabular-nums">{money(s.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tickets</div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1">Job</th><th>Time</th><th>Customer</th><th>Service</th><th>Result</th><th>Pay</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {(d.jobs as any[]).map((j) => (
              <tr key={j.id} className="border-t border-border">
                <td className="py-0.5">{jobNo(j.number)}</td><td>{format(new Date(j.performed_at), "h:mm a")}</td>
                <td>{j.company?.name ?? (j.contact ? fullName(j.contact) : "Retail")}</td><td>{j.service?.name ?? j.description}</td>
                <td className="uppercase">{j.result}</td><td className="capitalize">{j.payment_method}{!j.paid && j.payment_method !== "invoice" ? " (unpaid)" : ""}</td>
                <td className="text-right tabular-nums">{money(Number(j.price) + Number(j.cert_fee))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-8 pt-6 text-xs text-muted">
        <div className="border-t border-border-strong pt-1">Cash counted by</div><div className="border-t border-border-strong pt-1">Verified by</div>
      </div>
    </div>
  );
}
