import { z } from "zod";
import { router, protectedProcedure, must, isAdmin } from "@/server/trpc";
import { companyOverview } from "@/server/services/ai";
import { logActivity } from "@/server/services/comms";

const KIND = z.enum(["dealer", "rental", "repair", "exotic", "fleet", "storage", "other"]);
const STATUS = z.enum(["prospect", "onboarding", "active", "paused", "churned"]);
const BILLING = z.enum(["monthly_invoice", "per_job", "card_on_file", "zelle", "check", "cash"]);
const fields = z.object({
  name: z.string().min(1).optional(), kind: KIND.optional(), phone: z.string().nullable().optional(), email: z.string().nullable().optional(),
  website: z.string().nullable().optional(), address: z.string().nullable().optional(), contact_name: z.string().nullable().optional(),
  smog_price: z.number().nullable().optional(), old_car_price: z.number().nullable().optional(), vin_price: z.number().nullable().optional(),
  billing_method: BILLING.optional(), payment_terms_days: z.number().int().optional(), status: STATUS.optional(),
  owner_id: z.string().uuid().nullable().optional(), tags: z.array(z.string()).optional(), notes: z.string().nullable().optional(),
});

export const companiesRouter = router({
  list: protectedProcedure.input(z.object({ q: z.string().optional(), status: STATUS.optional(), kind: KIND.optional(), billing: BILLING.optional(), sort: z.string().default("name"), dir: z.enum(["asc", "desc"]).default("asc") }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("companies").select("*, owner:profiles!companies_owner_id_fkey(id,full_name,color)");
      if (input.q) q = q.or(`name.ilike.%${input.q.replace(/[%,()]/g, " ")}%,contact_name.ilike.%${input.q.replace(/[%,()]/g, " ")}%`);
      if (input.status) q = q.eq("status", input.status);
      if (input.kind) q = q.eq("kind", input.kind);
      if (input.billing) q = q.eq("billing_method", input.billing);
      const rows = must(await q.order(input.sort, { ascending: input.dir === "asc" })) as any[];
      // 30-day volume per account
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const jobs = must(await ctx.db.from("jobs").select("company_id, price, cert_fee").not("company_id", "is", null).gte("performed_at", since)) as any[];
      const vol: Record<string, { cars: number; rev: number }> = {};
      for (const j of jobs) { vol[j.company_id] ??= { cars: 0, rev: 0 }; vol[j.company_id].cars++; vol[j.company_id].rev += Number(j.price) + Number(j.cert_fee); }
      const open = must(await ctx.db.from("invoices").select("company_id, total, amount_paid").in("status", ["sent", "partial", "overdue"])) as any[];
      const ar: Record<string, number> = {};
      for (const i of open) ar[i.company_id] = (ar[i.company_id] ?? 0) + Number(i.total) - Number(i.amount_paid);
      return rows.map((r) => ({ ...r, cars_30d: vol[r.id]?.cars ?? 0, revenue_30d: vol[r.id]?.rev ?? 0, open_ar: ar[r.id] ?? 0 }));
    }),
  options: protectedProcedure.query(async ({ ctx }) => must(await ctx.db.from("companies").select("id, name, smog_price, old_car_price, vin_price, billing_method").order("name"))),
  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const co = must(await ctx.db.from("companies").select("*, owner:profiles!companies_owner_id_fkey(id,full_name,color)").eq("id", input.id).single());
    const [contacts, deals, invoices, contracts, jobs, vehicles] = await Promise.all([
      ctx.db.from("contacts").select("*").eq("company_id", input.id).order("created_at"),
      ctx.db.from("deals").select("*, owner:profiles!deals_owner_id_fkey(full_name)").eq("company_id", input.id).order("created_at", { ascending: false }),
      ctx.db.from("invoices").select("*").eq("company_id", input.id).order("issue_date", { ascending: false }),
      ctx.db.from("contracts").select("*").eq("company_id", input.id).order("created_at", { ascending: false }),
      ctx.db.from("jobs").select("*, service:services(name), vehicle:vehicles(year,make,model,vin)").eq("company_id", input.id).order("performed_at", { ascending: false }).limit(200),
      ctx.db.from("vehicles").select("*").eq("company_id", input.id).order("created_at", { ascending: false }),
    ]);
    const j = jobs.data ?? [];
    const since30 = Date.now() - 30 * 864e5;
    return {
      ...co, contacts: contacts.data ?? [], deals: deals.data ?? [], invoices: invoices.data ?? [], contracts: contracts.data ?? [], jobs: j, vehicles: vehicles.data ?? [],
      stats: {
        lifetime_revenue: j.reduce((s: number, x: any) => s + Number(x.price) + Number(x.cert_fee), 0),
        cars_30d: j.filter((x: any) => new Date(x.performed_at).getTime() > since30).length,
        pass_rate: j.length ? j.filter((x: any) => x.result === "pass").length / Math.max(1, j.filter((x: any) => x.result !== "na").length) : 0,
        open_ar: (invoices.data ?? []).filter((i: any) => ["sent", "partial", "overdue"].includes(i.status)).reduce((s: number, i: any) => s + Number(i.total) - Number(i.amount_paid), 0),
      },
    };
  }),
  create: protectedProcedure.input(fields.extend({ name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const co = must(await ctx.db.from("companies").insert({ ...input, owner_id: input.owner_id ?? ctx.profile.id }).select().single());
    await logActivity({ type: "system", company_id: co.id, user_id: ctx.profile.id, subject: "Account created" });
    return co;
  }),
  update: protectedProcedure.input(fields.extend({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    const before = must(await ctx.db.from("companies").select("status").eq("id", id).single());
    const after = must(await ctx.db.from("companies").update(patch).eq("id", id).select().single());
    if (patch.status && patch.status !== before.status) await logActivity({ type: "stage_change", company_id: id, user_id: ctx.profile.id, subject: `Account status: ${before.status} → ${patch.status}` });
    return after;
  }),
  delete: protectedProcedure.input(z.object({ ids: z.array(z.string().uuid()) })).mutation(async ({ ctx, input }) => {
    if (!isAdmin(ctx.profile)) throw new Error("Only admins can delete accounts");
    must(await ctx.db.from("companies").delete().in("id", input.ids)); return { ok: true };
  }),
  aiOverview: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input }) => companyOverview(input.id)),
});
