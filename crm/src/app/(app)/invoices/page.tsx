"use client";
import * as React from "react";
import { Receipt, Plus, CalendarRange, RefreshCw, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, Toolbar, Button, Input, Tabs } from "@/components/ui";
import { money, invNo } from "@/lib/utils";
import { Kpi } from "@/components/money/charts";
import { InvoicesTable, GenerateInvoicesDialog, NewInvoiceDialog, billName, type InvoiceRow } from "@/components/money/invoices";
import { downloadCsv } from "@/components/money/period";

const TABS = [
  { id: "", label: "All" }, { id: "open", label: "Open" }, { id: "draft", label: "Draft" }, { id: "sent", label: "Sent" },
  { id: "partial", label: "Partial" }, { id: "overdue", label: "Overdue" }, { id: "paid", label: "Paid" }, { id: "void", label: "Void" },
];

export default function InvoicesPage() {
  const me = trpc.team.me.useQuery();
  const admin = me.data ? me.data.role !== "rep" : false;
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [gen, setGen] = React.useState(false);
  const [create, setCreate] = React.useState(false);
  const list = trpc.invoices.list.useQuery({ status: (status || undefined) as any, q: q.trim() || undefined });
  const sync = trpc.invoices.syncMercury.useMutation({ onSuccess: (r) => toast.success(`Mercury synced: ${r.imported} new transactions, ${r.matched} payments matched, ${r.overdue} marked overdue`) });
  const rows = (list.data?.rows ?? []) as InvoiceRow[];
  const s = list.data?.summary;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Receipt className="h-4 w-4" />} title="Invoices" count={rows.length}
        actions={<>
          <Button icon={<RefreshCw className="h-3.5 w-3.5" />} loading={sync.isPending} onClick={() => sync.mutate()}>Sync Mercury</Button>
          <Button icon={<Download className="h-3.5 w-3.5" />} disabled={!rows.length} onClick={() => downloadCsv("invoices.csv", [
            ["Invoice", "Bill to", "Period start", "Period end", "Issued", "Due", "Status", "Total", "Paid", "Balance", "Sent"],
            ...rows.map((r) => [invNo(r.number), billName(r), r.period_start ?? "", r.period_end ?? "", r.issue_date, r.due_date ?? "", r.status, Number(r.total).toFixed(2), Number(r.amount_paid).toFixed(2), (Number(r.total) - Number(r.amount_paid)).toFixed(2), r.sent_at ?? ""]),
          ])}>Export</Button>
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreate(true)}>New invoice</Button>
          {admin && <Button variant="primary" icon={<CalendarRange className="h-3.5 w-3.5" />} onClick={() => setGen(true)}>Generate month-end invoices</Button>}
        </>} />
      {s && (
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border p-4 md:grid-cols-4">
          <Kpi label="Open receivables" value={money(s.open)} sub={`${s.count_open} invoices`} />
          <Kpi label="Overdue" value={money(s.overdue)} sub={`${s.count_overdue} invoices`} />
          <Kpi label="Drafts to send" value={money(s.draft)} sub={`${s.count_draft} drafts`} />
          <Kpi label="Collected (all time)" value={money(s.paid)} />
        </div>
      )}
      <Tabs tabs={TABS} value={status} onChange={setStatus} />
      <Toolbar>
        <div className="relative w-64"><Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" /><Input className="pl-7" placeholder="Search INV-#, account, memo" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <InvoicesTable rows={rows} loading={list.isLoading} admin={admin} />
      </div>
      <GenerateInvoicesDialog open={gen} onClose={() => setGen(false)} />
      <NewInvoiceDialog open={create} onClose={() => setCreate(false)} />
    </div>
  );
}
