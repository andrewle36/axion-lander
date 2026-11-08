import "server-only";
import { db } from "@/lib/supabase/admin";
import * as mercury from "@/lib/integrations/mercury";
import { sendEmail } from "@/lib/integrations/resend";
import { logActivity } from "./comms";
import { env, integrationStatus } from "@/lib/env";
import { money, invNo } from "@/lib/utils";
import { addDays, format, startOfMonth, endOfMonth, subMonths } from "date-fns";

/** Build a month-end invoice per monthly-billed partner from their unbilled jobs in the period. */
export async function generateMonthlyInvoices(monthDate = subMonths(new Date(), 1), opts: { send?: boolean; companyId?: string } = {}) {
  const sb = db();
  const start = startOfMonth(monthDate), end = endOfMonth(monthDate);
  let q = sb.from("companies").select("*").eq("billing_method", "monthly_invoice").in("status", ["active", "onboarding"]);
  if (opts.companyId) q = q.eq("id", opts.companyId);
  const { data: companies } = await q;
  const created: string[] = [];
  for (const co of companies ?? []) {
    const { data: jobs } = await sb.from("jobs").select("*, vehicle:vehicles(year,make,model,vin), service:services(name)")
      .eq("company_id", co.id).is("invoice_id", null).gte("performed_at", start.toISOString()).lte("performed_at", end.toISOString()).order("performed_at");
    if (!jobs?.length) continue;
    const items = jobs.map((j: any) => ({
      job_id: j.id,
      description: `${format(new Date(j.performed_at), "MM/dd")} ${j.service?.name ?? j.description ?? "Smog check"} ${[j.vehicle?.year, j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(" ")}${j.vehicle?.vin ? ` VIN …${String(j.vehicle.vin).slice(-6)}` : ""} (J-${j.number})`,
      qty: 1, unit_price: Number(j.price) + Number(j.cert_fee), amount: Number(j.price) + Number(j.cert_fee),
    }));
    const total = items.reduce((s, i) => s + i.amount, 0);
    const { data: inv, error } = await sb.from("invoices").insert({
      company_id: co.id, period_start: format(start, "yyyy-MM-dd"), period_end: format(end, "yyyy-MM-dd"),
      issue_date: format(new Date(), "yyyy-MM-dd"), due_date: format(addDays(new Date(), co.payment_terms_days ?? 15), "yyyy-MM-dd"),
      subtotal: total, total, status: "draft", memo: `Smog services ${format(start, "MMMM yyyy")}`,
    }).select().single();
    if (error) throw new Error(error.message);
    await sb.from("invoice_items").insert(items.map((i) => ({ ...i, invoice_id: inv.id })));
    await sb.from("jobs").update({ invoice_id: inv.id }).in("id", jobs.map((j: any) => j.id));
    created.push(inv.id);
    if (opts.send) { try { await sendInvoice(inv.id); } catch (e) { console.error("sendInvoice", e); } }
  }
  return created;
}

export async function sendInvoice(invoiceId: string) {
  const sb = db();
  const { data: inv } = await sb.from("invoices").select("*, company:companies(*), contact:contacts(*), items:invoice_items(*)").eq("id", invoiceId).single();
  if (!inv) throw new Error("Invoice not found");
  const billTo = inv.company?.email ?? inv.contact?.email;
  const billName = inv.company?.name ?? [inv.contact?.first_name, inv.contact?.last_name].join(" ");
  if (!billTo) throw new Error("Add a billing email to this account before sending.");
  let payUrl = inv.pay_url as string | null;
  let mercuryId = inv.mercury_invoice_id as string | null;
  if (integrationStatus().mercury && !mercuryId) {
    let customerId = inv.company?.mercury_customer_id as string | null;
    if (!customerId) {
      customerId = await mercury.createCustomer(billName, billTo);
      if (inv.company) await sb.from("companies").update({ mercury_customer_id: customerId }).eq("id", inv.company.id);
    }
    const m = await mercury.createInvoice({
      customerId, invoiceDate: inv.issue_date, dueDate: inv.due_date ?? inv.issue_date, number: invNo(inv.number),
      lineItems: inv.items.map((i: any) => ({ name: i.description, unitPrice: Number(i.unit_price), quantity: Number(i.qty) })),
      memo: inv.memo ?? undefined, send: true,
    });
    mercuryId = m.id; payUrl = m.payUrl;
  }
  const hostedUrl = `${env.appUrl}/pay/${inv.id}`;
  const rows = inv.items.map((i: any) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${i.description}</td><td style="text-align:right;border-bottom:1px solid #eee">${money(i.amount)}</td></tr>`).join("");
  await sendEmail({
    to: billTo,
    subject: `Newport Smog invoice ${invNo(inv.number)}: ${money(inv.total)} due ${inv.due_date}`,
    html: `<div style="font-family:Inter,Arial;max-width:560px;color:#222"><h2 style="margin:0 0 4px">Newport Smog &amp; Auto Registration</h2>
      <p style="color:#666;margin:0 0 16px">Invoice ${invNo(inv.number)} for ${billName} · ${inv.memo ?? ""}</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse">${rows}<tr><td style="padding-top:10px"><b>Total</b></td><td style="text-align:right;padding-top:10px"><b>${money(inv.total)}</b></td></tr></table>
      <p style="margin:20px 0"><a href="${payUrl ?? hostedUrl}" style="background:#1961ed;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Pay invoice</a></p>
      <p style="color:#888;font-size:12px">Due ${inv.due_date}. Questions? Call (714) 436-1700.</p></div>`,
  });
  await sb.from("invoices").update({ status: "sent", sent_at: new Date().toISOString(), mercury_invoice_id: mercuryId, pay_url: payUrl }).eq("id", inv.id);
  await logActivity({ type: "payment", company_id: inv.company_id, contact_id: inv.contact_id, subject: `Invoice ${invNo(inv.number)} sent`, body: `${money(inv.total)} due ${inv.due_date}` });
}

/** Record a payment, update invoice and accrue rep commission. */
export async function recordPayment(p: { invoice_id?: string | null; company_id?: string | null; contact_id?: string | null; amount: number; method: string; source?: "manual" | "mercury" | "job"; mercury_txn_id?: string | null; note?: string | null; received_at?: string }) {
  const sb = db();
  const { data: pay, error } = await sb.from("payments").insert({ ...p, source: p.source ?? "manual" }).select().single();
  if (error) throw new Error(error.message);
  let companyId = p.company_id ?? null;
  if (p.invoice_id) {
    const { data: inv } = await sb.from("invoices").select("*").eq("id", p.invoice_id).single();
    if (inv) {
      companyId = companyId ?? inv.company_id;
      const paid = Number(inv.amount_paid) + p.amount;
      await sb.from("invoices").update({ amount_paid: paid, status: paid >= Number(inv.total) - 0.005 ? "paid" : "partial", paid_at: paid >= Number(inv.total) - 0.005 ? new Date().toISOString() : null }).eq("id", inv.id);
      await sb.from("jobs").update({ paid: true }).eq("invoice_id", inv.id);
    }
  }
  await accrueCommission(pay.id, companyId, p.contact_id ?? null, p.amount);
  await logActivity({ type: "payment", company_id: companyId, contact_id: p.contact_id, subject: `Payment received ${money(p.amount)}`, body: `${p.method}${p.note ? ` · ${p.note}` : ""}` });
  return pay;
}

export async function accrueCommission(paymentId: string, companyId: string | null, contactId: string | null, amount: number) {
  const sb = db();
  if (!companyId) return;
  const { data: co } = await sb.from("companies").select("owner_id, created_at").eq("id", companyId).single();
  const { data: deal } = await sb.from("deals").select("id, owner_id, closed_at").eq("company_id", companyId).eq("stage", "won").order("closed_at", { ascending: true }).limit(1).maybeSingle();
  const repId = deal?.owner_id ?? co?.owner_id;
  if (!repId) return;
  const { data: rep } = await sb.from("profiles").select("commission_rate, commission_months, role").eq("id", repId).single();
  if (!rep || Number(rep.commission_rate) <= 0) return;
  const startAt = new Date(deal?.closed_at ?? co!.created_at);
  const months = (Date.now() - startAt.getTime()) / (30.44 * 864e5);
  if (months > rep.commission_months) return;
  const rate = Number(rep.commission_rate);
  await sb.from("commissions").insert({ rep_id: repId, payment_id: paymentId, company_id: companyId, deal_id: deal?.id ?? null, base_amount: amount, rate, amount: Math.round(amount * rate * 100) / 100 });
}

/** Pull Mercury transactions, auto-categorize, match deposits to open invoices, refresh AR status. */
export async function syncMercury(days = 90) {
  const sb = db();
  const start = format(addDays(new Date(), -days), "yyyy-MM-dd");
  const accts = await mercury.accounts();
  const { data: rules } = await sb.from("settings").select("value").eq("key", "category_rules").maybeSingle();
  const ruleList: { match: string; category: string }[] = (rules?.value as any) ?? DEFAULT_RULES;
  let imported = 0, matched = 0;
  for (const a of accts) {
    const txns = await mercury.transactions(a.id, start);
    for (const t of txns) {
      if (t.status === "failed" || t.status === "cancelled") continue;
      const text = `${t.counterpartyName ?? ""} ${t.bankDescription ?? ""} ${t.note ?? ""}`.toLowerCase();
      const rule = ruleList.find((r) => text.includes(r.match.toLowerCase()));
      const category = rule?.category ?? (t.amount > 0 ? "revenue" : "uncategorized");
      const { data: existing } = await sb.from("transactions").select("id, category").eq("mercury_id", t.id).maybeSingle();
      if (existing) continue;
      await sb.from("transactions").insert({ mercury_id: t.id, account_name: a.name, posted_at: t.postedAt ?? t.createdAt, amount: t.amount, counterparty: t.counterpartyName, description: t.bankDescription ?? t.note, category, status: t.status });
      imported++;
      if (t.amount > 0) {
        const { data: open } = await sb.from("invoices").select("id, total, amount_paid, company_id, company:companies(name)").in("status", ["sent", "overdue", "partial"]);
        const hit = (open ?? []).find((i: any) => Math.abs(Number(i.total) - Number(i.amount_paid) - t.amount) < 0.01 &&
          (!t.counterpartyName || (i.company?.name ?? "").toLowerCase().split(" ")[0] && text.includes((i.company?.name ?? "").toLowerCase().split(" ")[0])));
        if (hit) { await recordPayment({ invoice_id: hit.id, company_id: hit.company_id, amount: t.amount, method: "ach", source: "mercury", mercury_txn_id: t.id, note: t.counterpartyName }); matched++; }
      }
    }
  }
  const { data: arOpen } = await sb.from("invoices").select("id, total, amount_paid, company_id, mercury_invoice_id").not("mercury_invoice_id", "is", null).in("status", ["sent", "overdue", "partial"]);
  for (const inv of arOpen ?? []) {
    try {
      const m = await mercury.getInvoice(inv.mercury_invoice_id!);
      if (String(m.status ?? "").toLowerCase() === "paid") {
        await recordPayment({ invoice_id: inv.id, company_id: inv.company_id, amount: Number(inv.total) - Number(inv.amount_paid), method: "mercury_invoice", source: "mercury" });
        matched++;
      }
    } catch { /* ignore single invoice errors */ }
  }
  await sb.from("settings").upsert({ key: "mercury_last_sync", value: { at: new Date().toISOString(), imported, matched, balances: accts.map((a) => ({ name: a.name, available: a.availableBalance, current: a.currentBalance })) } });
  return { imported, matched, accounts: accts.length };
}

export const DEFAULT_RULES = [
  { match: "gusto", category: "payroll" }, { match: "adp", category: "payroll" }, { match: "payroll", category: "payroll" },
  { match: "rent", category: "rent" }, { match: "property", category: "rent" },
  { match: "edison", category: "utilities" }, { match: "socalgas", category: "utilities" }, { match: "spectrum", category: "utilities" }, { match: "at&t", category: "utilities" },
  { match: "bureau of automotive", category: "cogs" }, { match: "bar ", category: "cogs" }, { match: "certificate", category: "cogs" }, { match: "dmv", category: "cogs" },
  { match: "google ads", category: "marketing" }, { match: "facebook", category: "marketing" }, { match: "meta", category: "marketing" }, { match: "yelp", category: "marketing" },
  { match: "openrouter", category: "software" }, { match: "vercel", category: "software" }, { match: "supabase", category: "software" }, { match: "telnyx", category: "software" }, { match: "resend", category: "software" }, { match: "calendly", category: "software" }, { match: "pandadoc", category: "software" },
  { match: "insurance", category: "insurance" }, { match: "irs", category: "taxes" }, { match: "franchise tax", category: "taxes" }, { match: "interest", category: "interest" },
  { match: "costco", category: "supplies" }, { match: "home depot", category: "supplies" }, { match: "transfer", category: "transfer" },
];

export async function markOverdue() {
  const sb = db();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data } = await sb.from("invoices").select("id, company_id").in("status", ["sent", "partial"]).lt("due_date", today);
  const { fireTrigger } = await import("./automations");
  for (const inv of data ?? []) {
    await sb.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
    const { data: c } = await sb.from("contacts").select("id").eq("company_id", inv.company_id).limit(1).maybeSingle();
    if (c) await fireTrigger("invoice_overdue", c.id, { invoice_id: inv.id });
  }
  return data?.length ?? 0;
}
