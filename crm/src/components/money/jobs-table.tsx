"use client";
import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Table, Th, Td, StatusBadge, Badge, IconButton, Checkbox, Empty, Loading, confirmAction, Avatar } from "@/components/ui";
import { fullName, money, jobNo, invNo, cn } from "@/lib/utils";
import { LogJobDialog, type EditableJob } from "./log-job";

export type JobRow = EditableJob & {
  number: number; service?: { name: string; category: string } | null; company?: { id: string; name: string } | null;
  technician?: { full_name: string | null; color: string } | null; invoice?: { id: string; number: number; status: string } | null;
};
export type JobTotals = { count: number; price: number; cert_fee: number; total: number; pass: number; fail: number; unpaid: number };

export function JobsTable({ rows, totals, loading, compact, selectable = true }: { rows: JobRow[]; totals?: JobTotals; loading?: boolean; compact?: boolean; selectable?: boolean }) {
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [edit, setEdit] = React.useState<JobRow | null>(null);
  const del = trpc.jobs.delete.useMutation({ onSuccess: (_d, v) => { toast.success(`Deleted ${v.ids.length} job${v.ids.length === 1 ? "" : "s"}`); setSel(new Set()); } });
  const markPaid = trpc.jobs.update.useMutation();
  React.useEffect(() => { setSel((s) => new Set(Array.from(s).filter((id) => rows.some((r) => r.id === id)))); }, [rows]);

  if (loading) return <Loading />;
  if (!rows.length) return <Empty title="No jobs" body="Nothing matches these filters. Log a job to get started." />;
  const all = rows.length > 0 && sel.size === rows.length;
  const veh = (r: JobRow) => [r.vehicle?.year, r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(" ") || r.vehicle?.plate || r.vehicle?.vin || "";

  return (
    <>
      {selectable && sel.size > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-accent-soft px-4 py-1.5 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <span className="text-muted">· {money(rows.filter((r) => sel.has(r.id)).reduce((s, r) => s + Number(r.price) + Number(r.cert_fee), 0))}</span>
          <button className="ml-auto text-danger hover:underline" onClick={() => { if (confirmAction(`Delete ${sel.size} job(s)? Mirrored payments and unpaid commissions are removed too.`)) del.mutate({ ids: Array.from(sel) }); }}>Delete</button>
          <button className="text-muted hover:text-fg" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <Table className="flex-1">
        <thead>
          <tr>
            {selectable && <Th className="w-8"><Checkbox checked={all} onChange={(v) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set())} /></Th>}
            <Th>Job</Th><Th>Date</Th><Th>Customer</Th>{!compact && <Th>Vehicle</Th>}<Th>Service</Th><Th>Result</Th>
            <Th className="text-right">Price</Th><Th className="text-right">Cert</Th><Th className="text-right">Total</Th><Th>Payment</Th>{!compact && <Th>Tech</Th>}<Th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn("group hover:bg-hover/60", sel.has(r.id) && "bg-accent-soft/50")}>
              {selectable && <Td><Checkbox checked={sel.has(r.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} /></Td>}
              <Td className="font-medium tabular-nums">{jobNo(r.number)}</Td>
              <Td className="tabular-nums text-muted">{format(new Date(r.performed_at), "MMM d, h:mm a")}</Td>
              <Td className="max-w-[220px] truncate">
                {r.company ? <Link href={`/accounts/${r.company.id}`} className="hover:underline">{r.company.name}</Link> : <Badge>Retail</Badge>}
                {r.contact && r.contact_id && <Link href={`/contacts/${r.contact_id}`} className="ml-1.5 text-muted hover:underline">{fullName(r.contact)}</Link>}
              </Td>
              {!compact && <Td className="max-w-[200px] truncate text-muted">{veh(r)}</Td>}
              <Td className="max-w-[200px] truncate">{r.service?.name ?? r.description ?? "—"}</Td>
              <Td><StatusBadge status={r.result} /></Td>
              <Td className="text-right tabular-nums">{money(r.price)}</Td>
              <Td className="text-right tabular-nums text-muted">{Number(r.cert_fee) ? money(r.cert_fee) : "—"}</Td>
              <Td className="text-right font-medium tabular-nums">{money(Number(r.price) + Number(r.cert_fee))}</Td>
              <Td>
                <span className="capitalize">{r.payment_method}</span>
                {r.invoice ? <Link href={`/invoices/${r.invoice.id}`} className="ml-1.5 text-xs text-accent hover:underline">{invNo(r.invoice.number)}</Link>
                  : r.payment_method === "invoice" ? <Badge className="ml-1.5" tone="blue">unbilled</Badge>
                  : !r.paid && <button className="ml-1.5" title="Click to mark paid" onClick={() => { if (confirmAction(`Mark ${jobNo(r.number)} paid by ${r.payment_method}?`)) markPaid.mutate({ id: r.id, paid: true }); }}><Badge tone="amber">unpaid</Badge></button>}
              </Td>
              {!compact && <Td>{r.technician ? <span className="flex items-center gap-1.5"><Avatar name={r.technician.full_name} color={r.technician.color} size={18} />{r.technician.full_name}</span> : <span className="text-faint">—</span>}</Td>}
              <Td>
                <div className="flex justify-end opacity-0 group-hover:opacity-100">
                  <IconButton label="Edit job" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                  <IconButton label="Delete job" onClick={() => { if (confirmAction(`Delete ${jobNo(r.number)}?`)) del.mutate({ ids: [r.id] }); }}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="sticky bottom-0 bg-subtle font-medium">
              {selectable && <Td />}
              <Td>{totals.count} jobs</Td>
              <td colSpan={compact ? 2 : 3} className="h-9 whitespace-nowrap border-b border-r border-border px-3 text-muted">{totals.pass} pass · {totals.fail} fail{totals.pass + totals.fail ? ` · ${Math.round((totals.pass / (totals.pass + totals.fail)) * 100)}% pass rate` : ""}</td>
              <Td />
              <Td />
              <Td className="text-right tabular-nums">{money(totals.price)}</Td>
              <Td className="text-right tabular-nums">{money(totals.cert_fee)}</Td>
              <Td className="text-right tabular-nums">{money(totals.total)}</Td>
              <Td className="text-muted">{totals.unpaid ? `${money(totals.unpaid)} unpaid` : ""}</Td>
              {!compact && <Td />}
              <Td />
            </tr>
          </tfoot>
        )}
      </Table>
      <LogJobDialog open={!!edit} onClose={() => setEdit(null)} job={edit} />
    </>
  );
}
