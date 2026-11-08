import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/supabase/admin";
import { money, invNo, fullName } from "@/lib/utils";
import { PayActions } from "./pay-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice · Newport Smog & Auto Registration", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const d = (s: string | null | undefined) => (s ? new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

/** Public invoice view / pay page (middleware lists /pay/ as public). */
export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  if (!UUID.test(id)) notFound();
  const sb = db();
  const { data: inv } = await sb.from("invoices")
    .select("id, number, status, issue_date, due_date, period_start, period_end, subtotal, total, amount_paid, pay_url, memo, paid_at, company:companies(name,address,email,contact_name), contact:contacts(first_name,last_name,email), items:invoice_items(description, qty, unit_price, amount)")
    .eq("id", id).maybeSingle();
  if (!inv || inv.status === "draft") notFound();
  const { data: instr } = await sb.from("settings").select("value").eq("key", "payment_instructions").maybeSingle();
  const raw = instr?.value as unknown;
  const instructions = typeof raw === "string" ? raw : raw && typeof raw === "object" ? String((raw as any).text ?? (raw as any).instructions ?? Object.entries(raw as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join("\n")) : "";
  const company = inv.company as any, contact = inv.contact as any;
  const billTo = company?.name ?? (contact ? fullName(contact) : "Customer");
  const balance = Math.round((Number(inv.total) - Number(inv.amount_paid)) * 100) / 100;
  const items = ((inv.items as any[]) ?? []).sort((a, b) => String(a.description).localeCompare(String(b.description)));
  const isVoid = inv.status === "void";
  const paid = inv.status === "paid" || balance <= 0.005;

  return (
    <div className="min-h-screen bg-panel px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-bg p-8 shadow-card print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Newport Smog &amp; Auto Registration</div>
            <div className="text-sm text-muted">375 Bristol St Unit 80, Costa Mesa, CA · (714) 436-1700</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-tight">{invNo(inv.number)}</div>
            <div className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${isVoid ? "bg-subtle text-muted" : paid ? "bg-green-500/10 text-green-700 dark:text-green-400" : inv.status === "overdue" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
              {isVoid ? "VOID" : paid ? "PAID" : inv.status === "overdue" ? "OVERDUE" : "DUE"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div className="col-span-2"><div className="text-xs text-muted">Bill to</div><div className="font-medium">{billTo}</div>
            {company?.contact_name && <div className="text-muted">Attn: {company.contact_name}</div>}
            {company?.address && <div className="whitespace-pre-line text-muted">{company.address}</div>}</div>
          <div><div className="text-xs text-muted">Issued</div><div>{d(inv.issue_date)}</div></div>
          <div><div className="text-xs text-muted">Due</div><div>{d(inv.due_date)}</div></div>
          {inv.period_start && <div className="col-span-2"><div className="text-xs text-muted">Service period</div><div>{d(inv.period_start)} – {d(inv.period_end)}</div></div>}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted"><th className="py-2">Description</th><th className="w-14 text-right">Qty</th><th className="w-24 text-right">Unit</th><th className="w-24 text-right">Amount</th></tr></thead>
          <tbody>
            {items.map((i, k) => (
              <tr key={k} className="border-b border-border">
                <td className="py-1.5 pr-2">{i.description}</td><td className="text-right tabular-nums">{Number(i.qty)}</td>
                <td className="text-right tabular-nums">{money(i.unit_price)}</td><td className="text-right tabular-nums">{money(i.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="pt-3 text-right text-muted">Total</td><td className="pt-3 text-right font-semibold tabular-nums">{money(inv.total)}</td></tr>
            {Number(inv.amount_paid) > 0 && <tr><td colSpan={3} className="text-right text-muted">Paid</td><td className="text-right tabular-nums">−{money(inv.amount_paid)}</td></tr>}
            <tr><td colSpan={3} className="pt-1 text-right font-medium">Balance due</td><td className="pt-1 text-right text-base font-semibold tabular-nums">{isVoid ? money(0) : money(Math.max(0, balance))}</td></tr>
          </tfoot>
        </table>
        {inv.memo && <p className="mt-4 text-sm text-muted">{inv.memo}</p>}

        {!isVoid && !paid && (
          <div className="mt-8 space-y-4 print:mt-6">
            {inv.pay_url && (
              <a href={inv.pay_url} className="flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-accent-fg hover:bg-accent/90 print:hidden">
                Pay {money(balance)} with Mercury (ACH or card)
              </a>
            )}
            {(instructions || !inv.pay_url) && (
              <div className="rounded-md border border-border bg-subtle p-4 text-sm">
                <div className="mb-1 font-medium">{inv.pay_url ? "Other ways to pay" : "How to pay"}</div>
                <div className="whitespace-pre-line text-muted">{instructions || "Pay by check payable to Newport Smog & Auto Registration, or call (714) 436-1700 to pay by card."}</div>
                <div className="mt-2 text-xs text-faint">Please reference {invNo(inv.number)} with your payment.</div>
              </div>
            )}
          </div>
        )}
        {paid && !isVoid && <div className="mt-8 rounded-md border border-border bg-subtle p-4 text-center text-sm">Paid in full{inv.paid_at ? ` on ${new Date(inv.paid_at).toLocaleDateString("en-US")}` : ""}. Thank you!</div>}
        <PayActions autoPrint={print === "1"} />
      </div>
    </div>
  );
}
