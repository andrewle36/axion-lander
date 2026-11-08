import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, must, isAdmin } from "@/server/trpc";
import { logActivity } from "@/server/services/comms";
import { fireTrigger } from "@/server/services/automations";
import { fetchAll, syncJobPayment, recalcInvoice } from "@/server/services/billing";
import { money, jobNo, toE164 } from "@/lib/utils";

const RESULT = z.enum(["pass", "fail", "na"]);
const METHOD = z.enum(["cash", "card", "check", "zelle", "invoice"]);
const VCAT = z.enum(["passenger", "van", "exotic", "sprinter", "old", "old_luxury"]);
export const CERT_FEE = 8.25;

const JOB_SELECT = "*, service:services(id,code,name,category,cost), contact:contacts(id,first_name,last_name,phone), company:companies(id,name,billing_method), vehicle:vehicles(id,year,make,model,vin,plate,category), technician:profiles!jobs_technician_id_fkey(id,full_name,color), invoice:invoices!jobs_invoice_fk(id,number,status)";

const filters = z.object({
  from: z.string().optional(), to: z.string().optional(), service_id: z.string().uuid().optional(), category: z.string().optional(),
  result: RESULT.optional(), payment_method: METHOD.optional(), company_id: z.string().optional(), // uuid | "retail" | "partner"
  contact_id: z.string().uuid().optional(), vehicle_id: z.string().uuid().optional(), q: z.string().optional(), paid: z.boolean().optional(),
});
type Filters = z.infer<typeof filters>;

function applyFilters(q: any, f: Filters) {
  if (f.from) q = q.gte("performed_at", f.from);
  if (f.to) q = q.lte("performed_at", f.to);
  if (f.service_id) q = q.eq("service_id", f.service_id);
  if (f.result) q = q.eq("result", f.result);
  if (f.payment_method) q = q.eq("payment_method", f.payment_method);
  if (f.company_id === "retail") q = q.is("company_id", null);
  else if (f.company_id === "partner") q = q.not("company_id", "is", null);
  else if (f.company_id) q = q.eq("company_id", f.company_id);
  if (f.contact_id) q = q.eq("contact_id", f.contact_id);
  if (f.vehicle_id) q = q.eq("vehicle_id", f.vehicle_id);
  if (f.paid !== undefined) q = q.eq("paid", f.paid);
  if (f.q && /^j?-?\d+$/i.test(f.q.trim())) q = q.eq("number", Number(f.q.replace(/\D/g, "")));
  else if (f.q) q = q.ilike("description", `%${f.q.replace(/[%,()]/g, " ")}%`);
  return q;
}

export const jobTotal = (j: { price: number | string; cert_fee: number | string }) => Number(j.price) + Number(j.cert_fee);
const isCertJob = (j: any) => j.result === "pass" && (["smog", "retest"].includes(j.service?.category) || Number(j.cert_fee) > 0);

const jobFields = z.object({
  service_id: z.string().uuid().nullable().optional(), description: z.string().nullable().optional(),
  price: z.number().min(0), cert_fee: z.number().min(0), result: RESULT, payment_method: METHOD, paid: z.boolean(),
  technician_id: z.string().uuid().nullable().optional(), performed_at: z.string().optional(),
  company_id: z.string().uuid().nullable().optional(), contact_id: z.string().uuid().nullable().optional(), vehicle_id: z.string().uuid().nullable().optional(),
});

function addYears(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString().slice(0, 10);
}

export const jobsRouter = router({
  list: protectedProcedure.input(filters.extend({ limit: z.number().max(5000).default(1000) })).query(async ({ ctx, input }) => {
    const rows = await fetchAll<any>((a, b) => applyFilters(ctx.db.from("jobs").select(JOB_SELECT), input).order("performed_at", { ascending: false }).range(a, Math.min(b, input.limit - 1)), 1000, input.limit);
    const filtered = input.category ? rows.filter((r) => (r.service?.category ?? "other") === input.category) : rows;
    const totals = filtered.reduce((t, j) => {
      t.count++; t.price += Number(j.price); t.cert_fee += Number(j.cert_fee); t.total += jobTotal(j);
      if (j.result === "pass") t.pass++; if (j.result === "fail") t.fail++; if (!j.paid) t.unpaid += jobTotal(j);
      return t;
    }, { count: 0, price: 0, cert_fee: 0, total: 0, pass: 0, fail: 0, unpaid: 0 });
    return { rows: filtered, totals };
  }),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) =>
    must(await ctx.db.from("jobs").select(JOB_SELECT).eq("id", input.id).single())),

  /** Lightweight customer search for the point-of-sale dialog (all staff can find any customer at the counter). */
  contactSearch: protectedProcedure.input(z.object({ q: z.string(), company_id: z.string().uuid().nullable().optional() })).query(async ({ ctx, input }) => {
    let q = ctx.db.from("contacts").select("id, first_name, last_name, phone, email, company_id").limit(12);
    const s = input.q.trim().replace(/[%,()]/g, " ");
    if (s) {
      const digits = s.replace(/\D/g, "");
      const parts = [`first_name.ilike.%${s}%`, `last_name.ilike.%${s}%`, `email.ilike.%${s}%`];
      if (digits.length >= 3) parts.push(`phone.ilike.%${digits}%`);
      const [a, b] = s.split(/\s+/);
      if (a && b) parts.push(`and(first_name.ilike.%${a}%,last_name.ilike.%${b}%)`);
      q = q.or(parts.join(","));
    } else if (input.company_id) q = q.eq("company_id", input.company_id);
    else q = q.order("updated_at", { ascending: false });
    return must(await q) as any[];
  }),

  vehicles: protectedProcedure.input(z.object({ contact_id: z.string().uuid().nullable().optional(), company_id: z.string().uuid().nullable().optional() })).query(async ({ ctx, input }) => {
    if (!input.contact_id && !input.company_id) return [];
    let q = ctx.db.from("vehicles").select("*").order("created_at", { ascending: false }).limit(200);
    if (input.contact_id && input.company_id) q = q.or(`contact_id.eq.${input.contact_id},company_id.eq.${input.company_id}`);
    else if (input.contact_id) q = q.eq("contact_id", input.contact_id);
    else q = q.eq("company_id", input.company_id!);
    return must(await q) as any[];
  }),

  technicians: protectedProcedure.query(async ({ ctx }) => must(await ctx.db.from("profiles").select("id, full_name, color, role").eq("active", true).order("full_name")) as any[]),

  create: protectedProcedure.input(jobFields.extend({
    new_contact: z.object({ first_name: z.string().min(1), last_name: z.string().optional(), phone: z.string().optional(), email: z.string().optional() }).optional(),
    new_vehicle: z.object({ year: z.number().int().nullable().optional(), make: z.string().optional(), model: z.string().optional(), vin: z.string().optional(), plate: z.string().optional(), category: VCAT.default("passenger") }).optional(),
    local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).mutation(async ({ ctx, input }) => {
    const { new_contact, new_vehicle, local_date, ...job } = input;
    let contactId = job.contact_id ?? null;
    const companyId = job.company_id ?? null;
    if (!contactId && new_contact) {
      const phone = toE164(new_contact.phone);
      let existing: any = null;
      if (phone) existing = (await ctx.db.from("contacts").select("id").eq("phone", phone).limit(1).maybeSingle()).data;
      if (existing) contactId = existing.id;
      else {
        const c = must(await ctx.db.from("contacts").insert({
          first_name: new_contact.first_name.trim(), last_name: new_contact.last_name?.trim() ?? "", phone, email: new_contact.email?.trim() || null,
          company_id: companyId, kind: companyId ? "partner_contact" : "driver", source: "walk_in", status: "customer", owner_id: ctx.profile.id,
        }).select("id").single());
        contactId = c.id;
        await logActivity({ type: "system", contact_id: contactId, company_id: companyId, user_id: ctx.profile.id, subject: "Customer created at the counter" });
      }
    }
    let vehicleId = job.vehicle_id ?? null;
    if (!vehicleId && new_vehicle && (new_vehicle.make || new_vehicle.model || new_vehicle.vin || new_vehicle.plate || new_vehicle.year)) {
      const v = must(await ctx.db.from("vehicles").insert({
        contact_id: companyId ? null : contactId, company_id: companyId, year: new_vehicle.year ?? null, make: new_vehicle.make || null, model: new_vehicle.model || null,
        vin: new_vehicle.vin ? new_vehicle.vin.toUpperCase().trim() : null, plate: new_vehicle.plate ? new_vehicle.plate.toUpperCase().trim() : null, category: new_vehicle.category,
      }).select("id").single());
      vehicleId = v.id;
    }
    const svc = job.service_id ? (await ctx.db.from("services").select("name, category").eq("id", job.service_id).maybeSingle()).data : null;
    const performed = job.performed_at ?? new Date().toISOString();
    const row = must(await ctx.db.from("jobs").insert({
      ...job, performed_at: performed, contact_id: contactId, company_id: companyId, vehicle_id: vehicleId,
      cert_fee: job.result === "fail" ? 0 : job.cert_fee, paid: job.payment_method === "invoice" ? false : job.paid,
      description: job.description || svc?.name || null, technician_id: job.technician_id ?? ctx.profile.id,
    }).select().single());

    const day = local_date ?? performed.slice(0, 10);
    if (vehicleId && svc && ["smog", "retest"].includes(svc.category)) {
      const patch: Record<string, unknown> = { last_smog_at: day };
      if (row.result === "pass") patch.next_due_at = addYears(day, 2);
      await ctx.db.from("vehicles").update(patch).eq("id", vehicleId);
    }
    if (contactId) await ctx.db.from("contacts").update({ status: "customer" }).eq("id", contactId).neq("status", "customer");
    await logActivity({
      type: "job", contact_id: contactId, company_id: companyId, user_id: ctx.profile.id,
      subject: `${jobNo(row.number)} ${svc?.name ?? row.description ?? "Job"}: ${row.result.toUpperCase()}`,
      body: `${money(jobTotal(row))} · ${row.payment_method}${row.paid ? "" : " (unpaid)"}`, meta: { job_id: row.id },
    });
    await syncJobPayment(row.id);
    if (contactId) await fireTrigger("job_completed", contactId, { job_id: row.id, result: row.result, service: svc?.name, company_id: companyId });
    return row;
  }),

  update: protectedProcedure.input(jobFields.partial().extend({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    const before = must(await ctx.db.from("jobs").select("*, invoice:invoices!jobs_invoice_fk(id,status)").eq("id", id).single());
    if (before.invoice && before.invoice.status !== "draft" && before.invoice.status !== "void" &&
      (patch.price !== undefined || patch.cert_fee !== undefined || patch.company_id !== undefined))
      throw new TRPCError({ code: "BAD_REQUEST", message: "This job is on a sent invoice. Void the invoice first, or edit the invoice line." });
    if (patch.result === "fail") patch.cert_fee = 0;
    const after = must(await ctx.db.from("jobs").update(patch).eq("id", id).select().single());
    // keep a draft invoice line in sync with the job
    if (before.invoice?.status === "draft" && (patch.price !== undefined || patch.cert_fee !== undefined)) {
      const amt = jobTotal(after);
      await ctx.db.from("invoice_items").update({ unit_price: amt, amount: amt, qty: 1 }).eq("job_id", id).eq("invoice_id", before.invoice.id);
      await recalcInvoice(before.invoice.id);
    }
    await syncJobPayment(id);
    return after;
  }),

  delete: protectedProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1) })).mutation(async ({ ctx, input }) => {
    const rows = must(await ctx.db.from("jobs").select("id, invoice_id, technician_id, invoice:invoices!jobs_invoice_fk(status)").in("id", input.ids)) as any[];
    if (!isAdmin(ctx.profile) && rows.some((r) => r.technician_id !== ctx.profile.id)) throw new TRPCError({ code: "FORBIDDEN", message: "Reps can only delete jobs they logged." });
    if (rows.some((r) => r.invoice && !["draft", "void"].includes(r.invoice.status))) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more jobs are on a sent invoice. Void the invoice first." });
    const invoiceIds = Array.from(new Set(rows.map((r) => r.invoice_id).filter(Boolean)));
    must(await ctx.db.from("jobs").update({ paid: false, payment_method: "invoice" }).in("id", input.ids)); // drops mirrored payments below
    for (const id of input.ids) await syncJobPayment(id);
    if (invoiceIds.length) must(await ctx.db.from("invoice_items").delete().in("job_id", input.ids));
    must(await ctx.db.from("jobs").delete().in("id", input.ids));
    for (const inv of invoiceIds) await recalcInvoice(inv as string);
    return { ok: true };
  }),

  /** End-of-day closing report. `from`/`to` are the local day bounds from the browser. */
  dailyClose: protectedProcedure.input(z.object({ from: z.string(), to: z.string() })).query(async ({ ctx, input }) => {
    const jobs = await fetchAll<any>((a, b) => ctx.db.from("jobs").select(JOB_SELECT).gte("performed_at", input.from).lte("performed_at", input.to).order("performed_at").range(a, b));
    const methods = ["cash", "card", "check", "zelle", "invoice"] as const;
    const byMethod = Object.fromEntries(methods.map((m) => [m, { count: 0, amount: 0 }])) as Record<(typeof methods)[number], { count: number; amount: number }>;
    const byService: Record<string, { name: string; count: number; amount: number }> = {};
    const byTech: Record<string, { name: string; count: number; amount: number }> = {};
    let pass = 0, fail = 0, na = 0, total = 0, certs = 0, registrations = 0, vin = 0, unpaid = 0, retail = 0, partner = 0;
    for (const j of jobs) {
      const amt = jobTotal(j); total += amt;
      byMethod[j.payment_method as (typeof methods)[number]].count++; byMethod[j.payment_method as (typeof methods)[number]].amount += amt;
      if (j.result === "pass") pass++; else if (j.result === "fail") fail++; else na++;
      if (isCertJob(j)) certs++;
      if (j.service?.category === "dmv") registrations++;
      if (j.service?.category === "vin") vin++;
      if (!j.paid && j.payment_method !== "invoice") unpaid += amt;
      if (j.company_id) partner += amt; else retail += amt;
      const sk = j.service?.name ?? j.description ?? "Other";
      byService[sk] ??= { name: sk, count: 0, amount: 0 }; byService[sk].count++; byService[sk].amount += amt;
      const tk = j.technician?.full_name ?? "Unassigned";
      byTech[tk] ??= { name: tk, count: 0, amount: 0 }; byTech[tk].count++; byTech[tk].amount += amt;
    }
    const collected = byMethod.cash.amount + byMethod.card.amount + byMethod.check.amount + byMethod.zelle.amount - unpaid;
    return {
      jobs, cars: jobs.length, pass, fail, na, total, certs, cert_cost: certs * CERT_FEE, registrations, vin, unpaid, collected, retail, partner,
      pass_rate: pass + fail ? pass / (pass + fail) : 0, byMethod, byService: Object.values(byService).sort((a, b) => b.amount - a.amount),
      byTech: Object.values(byTech).sort((a, b) => b.count - a.count),
    };
  }),
});
