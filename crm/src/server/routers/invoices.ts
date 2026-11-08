import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { addDays, format } from "date-fns";
import { router, protectedProcedure, adminProcedure, must } from "@/server/trpc";
import {
  generateMonthlyInvoices, sendInvoice, recordPayment, syncMercury, markOverdue, recalcInvoice, voidInvoice, monthBounds, removePayment,
} from "@/server/services/billing";
import { logActivity } from "@/server/services/comms";
import { env } from "@/lib/env";
import { invNo, money } from "@/lib/utils";

const STATUS = z.enum(["draft", "sent", "paid", "partial", "overdue", "void"]);
const LIST_SELECT = "*, company:companies(id,name,email), contact:contacts(id,first_name,last_name,email)";
const round = (n: number) => Math.round(n * 100) / 100;

async function assertDraft(db: any, invoiceId: string) {
  const inv = must(await db.from("invoices").select("status").eq("id", invoiceId).single()) as any;
  if (inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft invoices can be edited. Void it and re-issue instead." });
}

export const invoicesRouter = router({
  list: protectedProcedure.input(z.object({ status: z.union([STATUS, z.literal("open")]).optional(), company_id: z.string().uuid().optional(), contact_id: z.string().uuid().optional(), q: z.string().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("invoices").select(LIST_SELECT).order("number", { ascending: false }).limit(1000);
      if (input.status === "open") q = q.in("status", ["sent", "partial", "overdue"]);
      else if (input.status) q = q.eq("status", input.status);
      if (input.company_id) q = q.eq("company_id", input.company_id);
      if (input.contact_id) q = q.eq("contact_id", input.contact_id);
      if (input.q && /^(inv-?)?\d+$/i.test(input.q.trim())) q = q.eq("number", Number(input.q.replace(/\D/g, "")));
      let rows = must(await q) as any[];
      if (input.q && !/^(inv-?)?\d+$/i.test(input.q.trim())) {
        const s = input.q.toLowerCase();
        rows = rows.filter((r) => `${r.company?.name ?? ""} ${r.contact?.first_name ?? ""} ${r.contact?.last_name ?? ""} ${r.memo ?? ""}`.toLowerCase().includes(s));
      }
      const all = must(await ctx.db.from("invoices").select("status, total, amount_paid").neq("status", "void").limit(5000)) as any[];
      const summary = { open: 0, overdue: 0, draft: 0, paid: 0, count_open: 0, count_overdue: 0, count_draft: 0 };
      for (const i of all) {
        const bal = Number(i.total) - Number(i.amount_paid);
        if (["sent", "partial", "overdue"].includes(i.status)) { summary.open += bal; summary.count_open++; }
        if (i.status === "overdue") { summary.overdue += bal; summary.count_overdue++; }
        if (i.status === "draft") { summary.draft += Number(i.total); summary.count_draft++; }
        summary.paid += Number(i.amount_paid);
      }
      return { rows, summary };
    }),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const inv = must(await ctx.db.from("invoices").select("*, company:companies(*), contact:contacts(*), items:invoice_items(*, job:jobs(id,number,performed_at,result))").eq("id", input.id).single()) as any;
    const payments = must(await ctx.db.from("payments").select("*").eq("invoice_id", input.id).order("received_at")) as any[];
    const activity = inv.company_id || inv.contact_id
      ? must(await ctx.db.from("activities").select("id, type, subject, body, created_at").eq("type", "payment").ilike("subject", `%${invNo(inv.number)}%`).order("created_at")) as any[]
      : [];
    inv.items = (inv.items ?? []).sort((a: any, b: any) => String(a.description).localeCompare(String(b.description)));
    return { ...inv, payments, activity, public_url: `${env.appUrl}/pay/${inv.id}`, balance: round(Number(inv.total) - Number(inv.amount_paid)) };
  }),

  /** Which partner accounts would get a month-end invoice, with their unbilled job totals. */
  previewMonthEnd: protectedProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), tzOffset: z.number().default(0) })).query(async ({ ctx, input }) => {
    const { start, end } = monthBounds(input.month, input.tzOffset);
    const cos = must(await ctx.db.from("companies").select("id, name, email, status, payment_terms_days").eq("billing_method", "monthly_invoice").in("status", ["active", "onboarding"]).order("name")) as any[];
    if (!cos.length) return { accounts: [], start: start.toISOString(), end: end.toISOString() };
    const jobs = must(await ctx.db.from("jobs").select("company_id, price, cert_fee").in("company_id", cos.map((c) => c.id)).is("invoice_id", null)
      .gte("performed_at", start.toISOString()).lte("performed_at", end.toISOString()).limit(10000)) as any[];
    const agg: Record<string, { cars: number; total: number }> = {};
    for (const j of jobs) { agg[j.company_id] ??= { cars: 0, total: 0 }; agg[j.company_id].cars++; agg[j.company_id].total += Number(j.price) + Number(j.cert_fee); }
    const accounts = cos.filter((c) => agg[c.id]).map((c) => ({ id: c.id, name: c.name, email: c.email, cars: agg[c.id].cars, total: round(agg[c.id].total), terms: c.payment_terms_days }));
    return { accounts, start: start.toISOString(), end: end.toISOString() };
  }),

  generateMonthEnd: adminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), tzOffset: z.number().default(0), company_ids: z.array(z.string().uuid()).min(1), send: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const { start, end } = monthBounds(input.month, input.tzOffset);
      const created: string[] = [];
      for (const companyId of input.company_ids) created.push(...await generateMonthlyInvoices(start, { companyId, start, end, send: input.send }));
      return { created: created.length, ids: created };
    }),

  create: protectedProcedure.input(z.object({
    company_id: z.string().uuid().nullable().optional(), contact_id: z.string().uuid().nullable().optional(),
    issue_date: z.string().optional(), due_date: z.string().nullable().optional(), memo: z.string().nullable().optional(),
    period_start: z.string().nullable().optional(), period_end: z.string().nullable().optional(),
    items: z.array(z.object({ description: z.string().min(1), qty: z.number().positive(), unit_price: z.number() })).default([]),
    job_ids: z.array(z.string().uuid()).default([]),
  })).mutation(async ({ ctx, input }) => {
    if (!input.company_id && !input.contact_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick an account or a contact to bill." });
    let terms = 15;
    if (input.company_id) terms = (must(await ctx.db.from("companies").select("payment_terms_days").eq("id", input.company_id).single()) as any).payment_terms_days ?? 15;
    const issue = input.issue_date ?? format(new Date(), "yyyy-MM-dd");
    const inv = must(await ctx.db.from("invoices").insert({
      company_id: input.company_id ?? null, contact_id: input.contact_id ?? null, issue_date: issue,
      due_date: input.due_date ?? format(addDays(new Date(issue + "T12:00:00"), terms), "yyyy-MM-dd"),
      memo: input.memo ?? null, period_start: input.period_start ?? null, period_end: input.period_end ?? null, status: "draft",
    }).select().single()) as any;
    const lines = input.items.map((i) => ({ invoice_id: inv.id, description: i.description, qty: i.qty, unit_price: i.unit_price, amount: round(i.qty * i.unit_price) }));
    if (input.job_ids.length) {
      const jobs = must(await ctx.db.from("jobs").select("id, number, performed_at, price, cert_fee, description, invoice_id").in("id", input.job_ids).is("invoice_id", null)) as any[];
      for (const j of jobs) {
        const amt = Number(j.price) + Number(j.cert_fee);
        lines.push({ invoice_id: inv.id, job_id: j.id, description: `${format(new Date(j.performed_at), "MM/dd")} ${j.description ?? "Service"} (J-${j.number})`, qty: 1, unit_price: amt, amount: amt } as any);
      }
      if (jobs.length) must(await ctx.db.from("jobs").update({ invoice_id: inv.id }).in("id", jobs.map((j) => j.id)));
    }
    if (lines.length) must(await ctx.db.from("invoice_items").insert(lines));
    await recalcInvoice(inv.id);
    await logActivity({ type: "payment", company_id: inv.company_id, contact_id: inv.contact_id, user_id: ctx.profile.id, subject: `Invoice ${invNo(inv.number)} created` });
    return inv;
  }),

  update: protectedProcedure.input(z.object({ id: z.string().uuid(), memo: z.string().nullable().optional(), issue_date: z.string().optional(), due_date: z.string().nullable().optional(), period_start: z.string().nullable().optional(), period_end: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      return must(await ctx.db.from("invoices").update(patch).eq("id", id).select().single());
    }),

  addItem: protectedProcedure.input(z.object({ invoice_id: z.string().uuid(), description: z.string().min(1), qty: z.number().positive(), unit_price: z.number() })).mutation(async ({ ctx, input }) => {
    await assertDraft(ctx.db, input.invoice_id);
    must(await ctx.db.from("invoice_items").insert({ ...input, amount: round(input.qty * input.unit_price) }));
    return { total: await recalcInvoice(input.invoice_id) };
  }),
  updateItem: protectedProcedure.input(z.object({ id: z.string().uuid(), description: z.string().min(1).optional(), qty: z.number().positive().optional(), unit_price: z.number().optional() })).mutation(async ({ ctx, input }) => {
    const item = must(await ctx.db.from("invoice_items").select("*").eq("id", input.id).single()) as any;
    await assertDraft(ctx.db, item.invoice_id);
    const qty = input.qty ?? Number(item.qty), unit = input.unit_price ?? Number(item.unit_price);
    must(await ctx.db.from("invoice_items").update({ description: input.description ?? item.description, qty, unit_price: unit, amount: round(qty * unit) }).eq("id", input.id));
    return { total: await recalcInvoice(item.invoice_id) };
  }),
  removeItem: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const item = must(await ctx.db.from("invoice_items").select("*").eq("id", input.id).single()) as any;
    await assertDraft(ctx.db, item.invoice_id);
    if (item.job_id) await ctx.db.from("jobs").update({ invoice_id: null }).eq("id", item.job_id);
    must(await ctx.db.from("invoice_items").delete().eq("id", input.id));
    return { total: await recalcInvoice(item.invoice_id) };
  }),

  send: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const inv = must(await ctx.db.from("invoices").select("status, total").eq("id", input.id).single()) as any;
    if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice is void." });
    if (Number(inv.total) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one line item before sending." });
    await sendInvoice(input.id);
    return { ok: true };
  }),
  markSent: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", input.id).eq("status", "draft"));
    return { ok: true };
  }),

  recordPayment: protectedProcedure.input(z.object({ invoice_id: z.string().uuid(), amount: z.number().positive(), method: z.string().min(1), received_at: z.string().optional(), note: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const inv = must(await ctx.db.from("invoices").select("company_id, contact_id, status").eq("id", input.invoice_id).single()) as any;
      if (inv.status === "void") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice is void." });
      return recordPayment({ invoice_id: input.invoice_id, company_id: inv.company_id, contact_id: inv.contact_id, amount: input.amount, method: input.method, source: "manual", note: input.note ?? null, received_at: input.received_at });
    }),
  deletePayment: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const p = must(await ctx.db.from("payments").select("*").eq("id", input.id).single()) as any;
    await removePayment(p.id);
    if (p.invoice_id) {
      const inv = must(await ctx.db.from("invoices").select("*").eq("id", p.invoice_id).single()) as any;
      const paid = round(Math.max(0, Number(inv.amount_paid) - Number(p.amount)));
      await ctx.db.from("invoices").update({ amount_paid: paid, paid_at: null, status: inv.status === "void" ? "void" : paid > 0 ? "partial" : inv.sent_at ? "sent" : "draft" }).eq("id", inv.id);
      await logActivity({ type: "payment", company_id: inv.company_id, contact_id: inv.contact_id, user_id: ctx.profile.id, subject: `Payment removed from ${invNo(inv.number)}`, body: money(p.amount) });
    }
    return { ok: true };
  }),

  void: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => { await voidInvoice(input.id); return { ok: true }; }),
  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await assertDraft(ctx.db, input.id);
    await ctx.db.from("jobs").update({ invoice_id: null }).eq("invoice_id", input.id);
    must(await ctx.db.from("invoices").delete().eq("id", input.id));
    return { ok: true };
  }),

  syncMercury: protectedProcedure.mutation(async () => {
    const r = await syncMercury(90);
    const overdue = await markOverdue();
    return { ...r, overdue };
  }),
  markOverdue: protectedProcedure.mutation(async () => ({ overdue: await markOverdue() })),

  /** Unbilled jobs for an account, to pull into a manual invoice. */
  unbilledJobs: protectedProcedure.input(z.object({ company_id: z.string().uuid().nullable().optional(), contact_id: z.string().uuid().nullable().optional() })).query(async ({ ctx, input }) => {
    if (!input.company_id && !input.contact_id) return [];
    let q = ctx.db.from("jobs").select("id, number, performed_at, description, price, cert_fee, paid, payment_method").is("invoice_id", null).eq("paid", false).order("performed_at").limit(500);
    q = input.company_id ? q.eq("company_id", input.company_id) : q.eq("contact_id", input.contact_id!);
    return must(await q) as any[];
  }),
});
