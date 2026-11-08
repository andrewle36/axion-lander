"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, subMonths, differenceInCalendarDays } from "date-fns";
import { Send, DollarSign, Ban, Printer, Link2, MoreHorizontal, Trash2, Plus, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Table, Th, Td, StatusBadge, Empty, Loading, Menu, MenuItem, IconButton, Dialog, Button, Field, Input, Select, Textarea, Switch, Checkbox, confirmAction } from "@/components/ui";
import { money, invNo, fullName, cn } from "@/lib/utils";
import { tzOffset, ymd } from "./period";

export type InvoiceRow = {
  id: string; number: number; status: string; total: number | string; amount_paid: number | string; issue_date: string; due_date: string | null;
  period_start: string | null; period_end: string | null; sent_at: string | null; pay_url: string | null; memo: string | null;
  company?: { id: string; name: string; email?: string | null } | null; contact?: { id: string; first_name: string; last_name: string; email?: string | null } | null;
};

export const billName = (r: Pick<InvoiceRow, "company" | "contact">) => r.company?.name ?? (r.contact ? fullName(r.contact) : "—");
export const payLink = (id: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/pay/${id}`;
export function copyPayLink(id: string) {
  void navigator.clipboard.writeText(payLink(id)).then(() => toast.success("Pay link copied"), () => toast.error("Couldn't copy. Link: " + payLink(id)));
}

/** Row-level invoice actions shared by the table and the detail page. */
export function useInvoiceActions() {
  const [paying, setPaying] = React.useState<InvoiceRow | null>(null);
  const send = trpc.invoices.send.useMutation({ onSuccess: () => toast.success("Invoice sent") });
  const markSent = trpc.invoices.markSent.useMutation({ onSuccess: () => toast.success("Marked as sent") });
  const voidM = trpc.invoices.void.useMutation({ onSuccess: () => toast.success("Invoice voided") });
  const del = trpc.invoices.delete.useMutation({ onSuccess: () => toast.success("Draft deleted") });
  const dialogs = <RecordPaymentDialog invoice={paying} onClose={() => setPaying(null)} />;
  return {
    dialogs, sending: send.isPending ? send.variables?.id : null,
    send: (r: InvoiceRow) => { if (confirmAction(`Send ${invNo(r.number)} (${money(r.total)}) to ${r.company?.email ?? r.contact?.email ?? "the billing email"}?`)) send.mutate({ id: r.id }); },
    markSent: (r: InvoiceRow) => markSent.mutate({ id: r.id }),
    pay: (r: InvoiceRow) => setPaying(r),
    void: (r: InvoiceRow) => { if (confirmAction(`Void ${invNo(r.number)}? Its jobs are released so they can be billed again.${Number(r.amount_paid) > 0 ? " Payments already recorded stay on file." : ""}`)) voidM.mutate({ id: r.id }); },
    remove: (r: InvoiceRow) => { if (confirmAction(`Delete draft ${invNo(r.number)}?`)) return del.mutateAsync({ id: r.id }); },
    print: (r: InvoiceRow) => window.open(`/pay/${r.id}?print=1`, "_blank"),
    copy: (r: InvoiceRow) => copyPayLink(r.id),
  };
}

export function InvoicesTable({ rows, loading, admin }: { rows: InvoiceRow[]; loading?: boolean; admin?: boolean }) {
  const router = useRouter();
  const a = useInvoiceActions();
  if (loading) return <Loading />;
  if (!rows.length) return <Empty title="No invoices" body="Generate month-end invoices for partner accounts or create one manually." />;
  const today = new Date();
  return (
    <>
      <Table className="flex-1">
        <thead>
          <tr>
            <Th>Invoice</Th><Th>Bill to</Th><Th>Period</Th><Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Balance</Th>
            <Th>Status</Th><Th>Issued</Th><Th>Due</Th><Th>Sent</Th><Th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bal = Number(r.total) - Number(r.amount_paid);
            const late = r.due_date && ["sent", "partial", "overdue"].includes(r.status) ? differenceInCalendarDays(today, new Date(r.due_date + "T12:00:00")) : 0;
            return (
              <tr key={r.id} className="cursor-pointer hover:bg-hover/60" onClick={() => router.push(`/invoices/${r.id}`)}>
                <Td className="font-medium tabular-nums">{invNo(r.number)}</Td>
                <Td className="max-w-[240px] truncate">{billName(r)}</Td>
                <Td className="text-muted">{r.period_start ? `${format(new Date(r.period_start + "T12:00:00"), "MMM d")} – ${r.period_end ? format(new Date(r.period_end + "T12:00:00"), "MMM d, yyyy") : ""}` : "—"}</Td>
                <Td className="text-right tabular-nums">{money(r.total)}</Td>
                <Td className="text-right tabular-nums text-muted">{money(r.amount_paid)}</Td>
                <Td className={cn("text-right font-medium tabular-nums", bal > 0.005 && r.status !== "void" ? "" : "text-faint")}>{r.status === "void" ? "—" : money(bal)}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="tabular-nums text-muted">{format(new Date(r.issue_date + "T12:00:00"), "MMM d")}</Td>
                <Td className={cn("tabular-nums", late > 0 ? "text-danger" : "text-muted")}>{r.due_date ? format(new Date(r.due_date + "T12:00:00"), "MMM d") : "—"}{late > 0 && <span className="ml-1 text-xs">({late}d late)</span>}</Td>
                <Td className="text-muted">{r.sent_at ? format(new Date(r.sent_at), "MMM d") : "—"}</Td>
                <Td onClick={() => undefined}>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Menu align="right" width={190} trigger={<IconButton label="Invoice actions"><MoreHorizontal className="h-4 w-4" /></IconButton>}>
                      {(close) => <>
                        {r.status !== "void" && r.status !== "paid" && <MenuItem icon={<Send className="h-3.5 w-3.5" />} onClick={() => { close(); a.send(r); }}>{r.sent_at ? "Resend" : "Send"}</MenuItem>}
                        {r.status === "draft" && <MenuItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => { close(); a.markSent(r); }}>Mark sent (no email)</MenuItem>}
                        {r.status !== "void" && bal > 0.005 && <MenuItem icon={<DollarSign className="h-3.5 w-3.5" />} onClick={() => { close(); a.pay(r); }}>Record payment</MenuItem>}
                        <MenuItem icon={<Printer className="h-3.5 w-3.5" />} onClick={() => { close(); a.print(r); }}>Download / print</MenuItem>
                        <MenuItem icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => { close(); a.copy(r); }}>Copy pay link</MenuItem>
                        {admin && r.status !== "void" && <MenuItem danger icon={<Ban className="h-3.5 w-3.5" />} onClick={() => { close(); a.void(r); }}>Mark void</MenuItem>}
                        {admin && r.status === "draft" && <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { close(); void a.remove(r); }}>Delete draft</MenuItem>}
                      </>}
                    </Menu>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {a.dialogs}
    </>
  );
}

export function RecordPaymentDialog({ invoice, onClose }: { invoice: InvoiceRow | null; onClose: () => void }) {
  const bal = invoice ? Math.round((Number(invoice.total) - Number(invoice.amount_paid)) * 100) / 100 : 0;
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("ach");
  const [date, setDate] = React.useState(ymd(new Date()));
  const [note, setNote] = React.useState("");
  React.useEffect(() => { if (invoice) { setAmount(bal.toFixed(2)); setMethod("ach"); setDate(ymd(new Date())); setNote(""); } }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = trpc.invoices.recordPayment.useMutation({ onSuccess: () => { toast.success("Payment recorded"); onClose(); } });
  return (
    <Dialog open={!!invoice} onClose={onClose} width={420} title={invoice ? `Record payment · ${invNo(invoice.number)}` : ""}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={m.isPending} disabled={!(Number(amount) > 0)} onClick={() => {
          const at = new Date(date + "T12:00:00"); const now = new Date();
          m.mutate({ invoice_id: invoice!.id, amount: Number(amount), method, received_at: (ymd(at) === ymd(now) ? now : at).toISOString(), note: note.trim() || null });
        }}>Record {money(Number(amount) || 0)}</Button></>}>
      {invoice && (
        <div className="space-y-3">
          <div className="text-sm text-muted">{billName(invoice)} · balance <span className="font-medium text-fg">{money(bal)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {["ach", "check", "zelle", "card", "cash", "wire", "mercury_invoice", "other"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}
              </Select>
            </Field>
            <Field label="Date received"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Check #, reference…" /></Field>
          </div>
          {Number(amount) > bal + 0.005 && <div className="text-xs text-warning">Amount is more than the balance due.</div>}
        </div>
      )}
    </Dialog>
  );
}

export function GenerateInvoicesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [month, setMonth] = React.useState(format(subMonths(new Date(), 1), "yyyy-MM"));
  const [send, setSend] = React.useState(false);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const preview = trpc.invoices.previewMonthEnd.useQuery({ month, tzOffset: tzOffset() }, { enabled: open });
  React.useEffect(() => { setSel(new Set((preview.data?.accounts ?? []).map((a) => a.id))); }, [preview.data]);
  const gen = trpc.invoices.generateMonthEnd.useMutation({ onSuccess: (r) => { toast.success(`Created ${r.created} invoice${r.created === 1 ? "" : "s"}${send ? " and sent them" : " as drafts"}`); onClose(); } });
  const accts = preview.data?.accounts ?? [];
  const total = accts.filter((a) => sel.has(a.id)).reduce((s, a) => s + a.total, 0);
  return (
    <Dialog open={open} onClose={onClose} width={620} title="Generate month-end invoices"
      footer={<>
        <label className="mr-auto flex items-center gap-2 self-center text-sm text-muted"><Switch checked={send} onChange={setSend} />Send immediately (Mercury + email)</label>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={gen.isPending} disabled={!sel.size} onClick={() => gen.mutate({ month, tzOffset: tzOffset(), company_ids: Array.from(sel), send })}>
          Create {sel.size} invoice{sel.size === 1 ? "" : "s"} · {money(total)}
        </Button>
      </>}>
      <div className="space-y-3">
        <div className="flex items-end gap-3">
          <Field label="Billing month"><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" /></Field>
          <div className="pb-1.5 text-xs text-faint">Active/onboarding accounts billed monthly, with unbilled jobs in the month.</div>
        </div>
        {preview.isLoading ? <Loading /> : !accts.length ? <Empty title="Nothing to bill" body="No monthly-billed account has unbilled jobs in this month." /> : (
          <div className="rounded border border-border">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-8 px-3 py-1.5"><Checkbox checked={sel.size === accts.length} onChange={(v) => setSel(v ? new Set(accts.map((a) => a.id)) : new Set())} /></th>
                <th>Account</th><th>Billing email</th><th className="text-right">Cars</th><th className="px-3 text-right">Unbilled</th></tr></thead>
              <tbody>
                {accts.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5"><Checkbox checked={sel.has(a.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(a.id) : n.delete(a.id); return n; })} /></td>
                    <td className="font-medium">{a.name}</td>
                    <td className={a.email ? "text-muted" : "text-danger"}>{a.email ?? "missing (can't send)"}</td>
                    <td className="text-right tabular-nums">{a.cars}</td>
                    <td className="px-3 text-right tabular-nums">{money(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}

type Line = { description: string; qty: string; unit_price: string };
export function NewInvoiceDialog({ open, onClose, companyId, contactId }: { open: boolean; onClose: () => void; companyId?: string; contactId?: string }) {
  const router = useRouter();
  const companies = trpc.companies.options.useQuery(undefined, { enabled: open });
  const [mode, setMode] = React.useState<"company" | "contact">(contactId && !companyId ? "contact" : "company");
  const [co, setCo] = React.useState(companyId ?? "");
  const [contact, setContact] = React.useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = React.useState("");
  const search = trpc.jobs.contactSearch.useQuery({ q }, { enabled: open && mode === "contact" && !contact && q.length > 1 });
  const presetContact = trpc.contacts.get.useQuery({ id: contactId! }, { enabled: open && !!contactId });
  React.useEffect(() => { const c = presetContact.data as any; if (c && !contact) setContact({ id: c.id, name: fullName(c) }); }, [presetContact.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const [due, setDue] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([{ description: "", qty: "1", unit_price: "" }]);
  const [jobIds, setJobIds] = React.useState<Set<string>>(new Set());
  const unbilled = trpc.invoices.unbilledJobs.useQuery({ company_id: mode === "company" ? co || null : null, contact_id: mode === "contact" ? contact?.id ?? null : null }, { enabled: open });
  const create = trpc.invoices.create.useMutation({ onSuccess: (inv) => { toast.success(`Created ${invNo(inv.number)}`); onClose(); router.push(`/invoices/${inv.id}`); } });
  const jobs = (unbilled.data ?? []) as any[];
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0) + jobs.filter((j) => jobIds.has(j.id)).reduce((s, j) => s + Number(j.price) + Number(j.cert_fee), 0);
  const valid = lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
  return (
    <Dialog open={open} onClose={onClose} width={680} title="New invoice"
      footer={<>
        <div className="mr-auto self-center text-sm text-muted">Total <span className="font-semibold text-fg">{money(total)}</span></div>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={create.isPending} disabled={(mode === "company" ? !co : !contact) || (!valid.length && !jobIds.size)}
          onClick={() => create.mutate({
            company_id: mode === "company" ? co : null, contact_id: mode === "contact" ? contact!.id : null, due_date: due || null, memo: memo.trim() || null,
            items: valid.map((l) => ({ description: l.description.trim(), qty: Number(l.qty), unit_price: Number(l.unit_price) || 0 })), job_ids: Array.from(jobIds),
          })}>Create draft</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded border border-border p-0.5">
            {(["company", "contact"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setJobIds(new Set()); }} className={cn("h-7 rounded px-3 text-sm", mode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{m === "company" ? "Partner account" : "Retail contact"}</button>
            ))}
          </div>
          {mode === "company" ? (
            <Field label="Account" className="min-w-[240px] flex-1">
              <Select value={co} onChange={(e) => { setCo(e.target.value); setJobIds(new Set()); }}>
                <option value="">Select account…</option>
                {((companies.data ?? []) as any[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          ) : contact ? (
            <div className="flex h-8 min-w-[240px] flex-1 items-center gap-2 rounded border border-border bg-subtle px-2.5 text-sm">
              {contact.name}<button className="ml-auto text-faint hover:text-fg" onClick={() => setContact(null)} aria-label="Clear"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="relative min-w-[240px] flex-1">
              <Input placeholder="Search contact name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
              {q.length > 1 && (
                <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-bg p-1 shadow-pop">
                  {((search.data ?? []) as any[]).map((c) => <button key={c.id} className="flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-hover" onClick={() => { setContact({ id: c.id, name: fullName(c) }); setQ(""); }}>{fullName(c)} <span className="ml-2 text-faint">{c.phone}</span></button>)}
                  {search.data && !search.data.length && <div className="px-2 py-1.5 text-xs text-faint">No matches</div>}
                </div>
              )}
            </div>
          )}
          <Field label="Due date" hint="Blank = account terms"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-40" /></Field>
        </div>
        {jobs.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted"><span>Unbilled jobs ({jobs.length})</span>
              <button className="text-accent hover:underline" onClick={() => setJobIds(jobIds.size === jobs.length ? new Set() : new Set(jobs.map((j) => j.id)))}>{jobIds.size === jobs.length ? "Clear" : "Select all"}</button></div>
            <div className="max-h-40 overflow-auto rounded border border-border">
              {jobs.map((j) => (
                <label key={j.id} className="flex h-8 items-center gap-2 border-b border-border px-2 text-sm last:border-0">
                  <Checkbox checked={jobIds.has(j.id)} onChange={(v) => setJobIds((s) => { const n = new Set(s); v ? n.add(j.id) : n.delete(j.id); return n; })} />
                  <span className="tabular-nums text-muted">J-{j.number}</span><span className="text-muted">{format(new Date(j.performed_at), "MMM d")}</span>
                  <span className="flex-1 truncate">{j.description}</span><span className="tabular-nums">{money(Number(j.price) + Number(j.cert_fee))}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Line items</div>
          <div className="space-y-1.5">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-1.5">
                <Input className="flex-1" placeholder="Description" value={l.description} onChange={(e) => setLines(lines.map((x, k) => k === i ? { ...x, description: e.target.value } : x))} />
                <Input className="w-16" type="number" min="0" step="1" value={l.qty} onChange={(e) => setLines(lines.map((x, k) => k === i ? { ...x, qty: e.target.value } : x))} />
                <Input className="w-24" type="number" step="0.01" placeholder="Price" value={l.unit_price} onChange={(e) => setLines(lines.map((x, k) => k === i ? { ...x, unit_price: e.target.value } : x))} />
                <div className="w-20 self-center text-right text-sm tabular-nums">{money((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</div>
                <IconButton label="Remove line" onClick={() => setLines(lines.filter((_, k) => k !== i))}><X className="h-3.5 w-3.5" /></IconButton>
              </div>
            ))}
            <Button size="xs" variant="ghost" icon={<Plus className="h-3 w-3" />} onClick={() => setLines([...lines, { description: "", qty: "1", unit_price: "" }])}>Add line</Button>
          </div>
        </div>
        <Field label="Memo"><Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Shown on the invoice" /></Field>
      </div>
    </Dialog>
  );
}
