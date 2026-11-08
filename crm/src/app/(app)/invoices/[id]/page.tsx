"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Receipt, Send, DollarSign, Ban, Printer, Link2, Trash2, Plus, ArrowLeft, Check, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, Button, Card, Input, Textarea, StatusBadge, Loading, Empty, IconButton, Field, confirmAction, Badge } from "@/components/ui";
import { money, invNo, fullName, jobNo, relTime } from "@/lib/utils";
import { useInvoiceActions, type InvoiceRow } from "@/components/money/invoices";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = trpc.team.me.useQuery();
  const admin = me.data ? me.data.role !== "rep" : false;
  const q = trpc.invoices.get.useQuery({ id });
  const a = useInvoiceActions();
  const update = trpc.invoices.update.useMutation({ onSuccess: () => toast.success("Saved") });
  const addItem = trpc.invoices.addItem.useMutation();
  const updateItem = trpc.invoices.updateItem.useMutation();
  const removeItem = trpc.invoices.removeItem.useMutation();
  const delPayment = trpc.invoices.deletePayment.useMutation({ onSuccess: () => toast.success("Payment removed") });
  const [line, setLine] = React.useState({ description: "", qty: "1", unit_price: "" });
  const [memo, setMemo] = React.useState<string | null>(null);

  if (q.isLoading) return <Loading />;
  const inv = q.data as any;
  if (!inv) return <Empty title="Invoice not found" action={<Button onClick={() => router.push("/invoices")}>Back to invoices</Button>} />;
  const row = inv as InvoiceRow;
  const draft = inv.status === "draft";
  const billTo = inv.company?.name ?? (inv.contact ? fullName(inv.contact) : "—");
  const email = inv.company?.email ?? inv.contact?.email;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Receipt className="h-4 w-4" />} title={<span className="flex items-center gap-2"><Link href="/invoices" className="text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /></Link>{invNo(inv.number)} · {billTo}</span>}
        actions={<>
          <StatusBadge status={inv.status} />
          <Button icon={<Link2 className="h-3.5 w-3.5" />} onClick={() => a.copy(row)}>Copy pay link</Button>
          <Button icon={<Printer className="h-3.5 w-3.5" />} onClick={() => a.print(row)}>Download / print</Button>
          {inv.status !== "void" && inv.balance > 0.005 && <Button icon={<DollarSign className="h-3.5 w-3.5" />} onClick={() => a.pay(row)}>Record payment</Button>}
          {draft && <Button icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => a.markSent(row)}>Mark sent</Button>}
          {admin && inv.status !== "void" && <Button variant="ghost" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => a.void(row)}>Void</Button>}
          {admin && draft && <Button variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={async () => { const r = await a.remove(row); if (r) router.push("/invoices"); }}>Delete</Button>}
          {inv.status !== "void" && inv.status !== "paid" && <Button variant="primary" loading={a.sending === inv.id} icon={<Send className="h-3.5 w-3.5" />} onClick={() => a.send(row)}>{inv.sent_at ? "Resend" : "Send invoice"}</Button>}
        </>} />
      <div className="flex-1 overflow-auto bg-panel p-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <div className="grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-4">
                <div><div className="text-xs text-muted">Bill to</div>
                  <div className="font-medium">{inv.company ? <Link className="hover:underline" href={`/accounts/${inv.company.id}`}>{billTo}</Link> : inv.contact ? <Link className="hover:underline" href={`/contacts/${inv.contact.id}`}>{billTo}</Link> : billTo}</div>
                  <div className={email ? "text-muted" : "text-danger"}>{email ?? "No billing email"}</div></div>
                <div><div className="text-xs text-muted">Period</div><div>{inv.period_start ? `${inv.period_start} → ${inv.period_end ?? ""}` : "—"}</div></div>
                <div>
                  <div className="text-xs text-muted">Issued</div>
                  {draft ? <Input type="date" defaultValue={inv.issue_date} onBlur={(e) => e.target.value !== inv.issue_date && update.mutate({ id, issue_date: e.target.value })} /> : <div>{inv.issue_date}</div>}
                </div>
                <div>
                  <div className="text-xs text-muted">Due</div>
                  {inv.status !== "void" && inv.status !== "paid" ? <Input type="date" defaultValue={inv.due_date ?? ""} onBlur={(e) => e.target.value !== (inv.due_date ?? "") && update.mutate({ id, due_date: e.target.value || null })} /> : <div>{inv.due_date ?? "—"}</div>}
                </div>
              </div>
            </Card>
            <Card title={`Line items (${inv.items.length})`} action={draft ? <Badge tone="blue">Draft: editable</Badge> : <span className="text-xs text-faint">Locked after sending. Void and re-issue to change.</span>}>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted"><th className="px-4 py-2">Description</th><th className="w-20 text-right">Qty</th><th className="w-28 text-right">Unit</th><th className="w-28 px-4 text-right">Amount</th>{draft && <th className="w-10" />}</tr></thead>
                <tbody>
                  {inv.items.map((it: any) => (
                    <tr key={it.id} className="border-b border-border">
                      <td className="px-4 py-1.5">
                        {draft ? <Input defaultValue={it.description} onBlur={(e) => e.target.value.trim() && e.target.value !== it.description && updateItem.mutate({ id: it.id, description: e.target.value.trim() })} /> : it.description}
                        {it.job && <span className="ml-1 text-xs text-faint">{jobNo(it.job.number)}</span>}
                      </td>
                      <td className="text-right">{draft ? <Input className="text-right" type="number" min="0" step="1" defaultValue={Number(it.qty)} onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(it.qty) && updateItem.mutate({ id: it.id, qty: Number(e.target.value) })} /> : Number(it.qty)}</td>
                      <td className="text-right tabular-nums">{draft ? <Input className="text-right" type="number" step="0.01" defaultValue={Number(it.unit_price)} onBlur={(e) => Number(e.target.value) !== Number(it.unit_price) && updateItem.mutate({ id: it.id, unit_price: Number(e.target.value) || 0 })} /> : money(it.unit_price)}</td>
                      <td className="px-4 text-right font-medium tabular-nums">{money(it.amount)}</td>
                      {draft && <td><IconButton label="Remove line" onClick={() => { if (!it.job || confirmAction("Remove this job from the invoice? It goes back to unbilled.")) removeItem.mutate({ id: it.id }); }}><X className="h-3.5 w-3.5" /></IconButton></td>}
                    </tr>
                  ))}
                  {draft && (
                    <tr className="border-b border-border bg-subtle/50">
                      <td className="px-4 py-1.5"><Input placeholder="New line description" value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} /></td>
                      <td><Input className="text-right" type="number" min="1" value={line.qty} onChange={(e) => setLine({ ...line, qty: e.target.value })} /></td>
                      <td><Input className="text-right" type="number" step="0.01" placeholder="0.00" value={line.unit_price} onChange={(e) => setLine({ ...line, unit_price: e.target.value })} /></td>
                      <td className="px-4 text-right tabular-nums text-muted">{money((Number(line.qty) || 0) * (Number(line.unit_price) || 0))}</td>
                      <td><IconButton label="Add line" disabled={!line.description.trim() || !(Number(line.qty) > 0)} onClick={() => addItem.mutate({ invoice_id: id, description: line.description.trim(), qty: Number(line.qty), unit_price: Number(line.unit_price) || 0 }, { onSuccess: () => setLine({ description: "", qty: "1", unit_price: "" }) })}><Plus className="h-4 w-4" /></IconButton></td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr><td className="px-4 py-2 text-right text-muted" colSpan={3}>Total</td><td className="px-4 text-right text-base font-semibold tabular-nums">{money(inv.total)}</td>{draft && <td />}</tr>
                  <tr><td className="px-4 py-1 text-right text-muted" colSpan={3}>Paid</td><td className="px-4 text-right tabular-nums">{money(inv.amount_paid)}</td>{draft && <td />}</tr>
                  <tr><td className="px-4 py-1 pb-3 text-right font-medium" colSpan={3}>Balance due</td><td className="px-4 pb-3 text-right font-semibold tabular-nums">{money(inv.balance)}</td>{draft && <td />}</tr>
                </tfoot>
              </table>
            </Card>
            <Card title="Memo">
              <div className="space-y-2 p-4">
                <Textarea rows={2} value={memo ?? inv.memo ?? ""} onChange={(e) => setMemo(e.target.value)} placeholder="Shown to the customer" />
                {memo !== null && memo !== (inv.memo ?? "") && <Button size="xs" variant="primary" icon={<Check className="h-3 w-3" />} loading={update.isPending} onClick={() => update.mutate({ id, memo: memo.trim() || null }, { onSuccess: () => setMemo(null) })}>Save memo</Button>}
              </div>
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="Payment">
              <div className="space-y-2 p-4 text-sm">
                <Field label="Customer pay page"><div className="flex gap-1"><Input readOnly value={inv.public_url} onFocus={(e) => e.target.select()} /><IconButton label="Copy" onClick={() => a.copy(row)}><Link2 className="h-3.5 w-3.5" /></IconButton></div></Field>
                <div className="text-xs text-muted">Mercury invoice: {inv.mercury_invoice_id ? <span className="text-fg">{inv.mercury_invoice_id}</span> : "not created yet (created on send when Mercury is connected)"}</div>
                {inv.pay_url && <a className="block truncate text-xs text-accent hover:underline" href={inv.pay_url} target="_blank" rel="noreferrer">{inv.pay_url}</a>}
              </div>
            </Card>
            <Card title="Timeline">
              <div className="space-y-3 p-4 text-sm">
                <TimelineItem title="Created" at={inv.created_at} />
                {inv.sent_at && <TimelineItem title={`Sent to ${email ?? "customer"}`} at={inv.sent_at} />}
                {(inv.payments as any[]).map((p) => (
                  <div key={p.id} className="group flex gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-success" />
                    <div className="flex-1">
                      <div className="font-medium">Payment {money(p.amount)} <span className="font-normal text-muted">· {String(p.method).replace("_", " ")} · {p.source}</span></div>
                      <div className="text-xs text-faint">{format(new Date(p.received_at), "MMM d, yyyy h:mm a")}{p.note ? ` · ${p.note}` : ""}</div>
                    </div>
                    {admin && <IconButton label="Remove payment" className="opacity-0 group-hover:opacity-100" onClick={() => { if (confirmAction(`Remove this ${money(p.amount)} payment? Its unpaid commission is removed too.`)) delPayment.mutate({ id: p.id }); }}><Trash2 className="h-3.5 w-3.5" /></IconButton>}
                  </div>
                ))}
                {(inv.activity as any[]).filter((x) => /void/i.test(x.subject ?? "")).map((x) => <TimelineItem key={x.id} title={x.subject} at={x.created_at} />)}
                {inv.paid_at && <TimelineItem title="Paid in full" at={inv.paid_at} />}
              </div>
            </Card>
          </div>
        </div>
      </div>
      {a.dialogs}
    </div>
  );
}

function TimelineItem({ title, at }: { title: string; at: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-border-strong" />
      <div><div className="font-medium">{title}</div><div className="text-xs text-faint">{format(new Date(at), "MMM d, yyyy h:mm a")} · {relTime(at)}</div></div>
    </div>
  );
}
