import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, must, isAdmin } from "@/server/trpc";
import { fetchAll } from "@/server/services/billing";
import { logActivity } from "@/server/services/comms";
import { money } from "@/lib/utils";

const STATUS = z.enum(["earned", "approved", "paid", "void"]);
const SELECT = "*, rep:profiles!commissions_rep_id_fkey(id,full_name,color,email), company:companies(id,name), payment:payments(id,amount,method,received_at,invoice_id,source), deal:deals(id,number,name)";

export const commissionsRouter = router({
  list: protectedProcedure.input(z.object({ rep_id: z.string().uuid().optional(), status: STATUS.optional(), from: z.string().optional(), to: z.string().optional(), company_id: z.string().uuid().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      const rows = await fetchAll<any>((a, b) => {
        let q = ctx.db.from("commissions").select(SELECT).order("earned_at", { ascending: false });
        if (!isAdmin(ctx.profile)) q = q.eq("rep_id", ctx.profile.id);
        else if (input.rep_id) q = q.eq("rep_id", input.rep_id);
        if (input.status) q = q.eq("status", input.status);
        if (input.company_id) q = q.eq("company_id", input.company_id);
        if (input.from) q = q.gte("earned_at", input.from);
        if (input.to) q = q.lte("earned_at", input.to);
        return q.range(a, b);
      }, 1000, 20000);
      const totals = { base: 0, amount: 0, earned: 0, approved: 0, paid: 0 };
      for (const r of rows) {
        if (r.status === "void") continue;
        totals.base += Number(r.base_amount); totals.amount += Number(r.amount);
        totals[r.status as "earned" | "approved" | "paid"] += Number(r.amount);
      }
      return { rows, totals };
    }),

  /** Per-rep summary cards. `monthStart`/`yearStart` are local bounds from the browser. */
  summary: protectedProcedure.input(z.object({ monthStart: z.string(), yearStart: z.string() })).query(async ({ ctx, input }) => {
    const admin = isAdmin(ctx.profile);
    let reps = must(await ctx.db.from("profiles").select("id, full_name, color, role, active, commission_rate, commission_months, email").order("full_name")) as any[];
    if (!admin) reps = reps.filter((r) => r.id === ctx.profile.id);
    const ids = reps.map((r) => r.id);
    if (!ids.length) return [];
    const rows = await fetchAll<any>((a, b) => ctx.db.from("commissions").select("rep_id, amount, base_amount, status, earned_at, paid_at, company_id").in("rep_id", ids).neq("status", "void").range(a, b));
    const deals = must(await ctx.db.from("deals").select("owner_id, company_id").eq("stage", "won").in("owner_id", ids)) as any[];
    const ms = new Date(input.monthStart).getTime(), ys = new Date(input.yearStart).getTime();
    const out = reps.map((r) => {
      const mine = rows.filter((c) => c.rep_id === r.id);
      return {
        ...r,
        earned_month: mine.filter((c) => new Date(c.earned_at).getTime() >= ms).reduce((s, c) => s + Number(c.amount), 0),
        approved_unpaid: mine.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount), 0),
        earned_unapproved: mine.filter((c) => c.status === "earned").reduce((s, c) => s + Number(c.amount), 0),
        paid_ytd: mine.filter((c) => c.status === "paid" && c.paid_at && new Date(c.paid_at).getTime() >= ys).reduce((s, c) => s + Number(c.amount), 0),
        revenue_sourced: mine.reduce((s, c) => s + Number(c.base_amount), 0),
        revenue_sourced_ytd: mine.filter((c) => new Date(c.earned_at).getTime() >= ys).reduce((s, c) => s + Number(c.base_amount), 0),
        accounts_closed: new Set(deals.filter((d) => d.owner_id === r.id).map((d) => d.company_id)).size,
        accounts_paying: new Set(mine.map((c) => c.company_id).filter(Boolean)).size,
      };
    });
    // admins: only show people who actually participate (rate > 0 or have rows)
    return admin ? out.filter((r) => r.active && (Number(r.commission_rate) > 0 || r.revenue_sourced > 0 || r.role === "rep")) : out;
  }),

  approve: adminProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1) })).mutation(async ({ ctx, input }) => {
    const r = await ctx.db.from("commissions").update({ status: "approved" }).in("id", input.ids).eq("status", "earned").select("id");
    return { updated: must(r).length };
  }),

  /** Mark approved/earned commissions paid, and book the payout as a "commission" bank transaction per rep for cash flow. */
  markPaid: adminProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1), paid_at: z.string().optional(), method: z.string().default("payroll") })).mutation(async ({ ctx, input }) => {
    const rows = must(await ctx.db.from("commissions").select("id, rep_id, amount, status, rep:profiles!commissions_rep_id_fkey(full_name)").in("id", input.ids).in("status", ["earned", "approved"])) as any[];
    if (!rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to pay: select earned or approved rows." });
    const paidAt = input.paid_at ?? new Date().toISOString();
    must(await ctx.db.from("commissions").update({ status: "paid", paid_at: paidAt }).in("id", rows.map((r) => r.id)));
    const byRep: Record<string, { name: string; amount: number; n: number }> = {};
    for (const r of rows) { byRep[r.rep_id] ??= { name: r.rep?.full_name ?? "Rep", amount: 0, n: 0 }; byRep[r.rep_id]!.amount += Number(r.amount); byRep[r.rep_id]!.n++; }
    for (const [repId, v] of Object.entries(byRep)) {
      if (Math.abs(v.amount) < 0.005) continue;
      must(await ctx.db.from("transactions").insert({
        posted_at: paidAt, amount: -Math.round(v.amount * 100) / 100, counterparty: v.name, description: `Commission payout (${v.n} items, ${input.method})`,
        category: "commission", account_name: "Manual", status: "posted",
      }));
      await logActivity({ type: "system", user_id: ctx.profile.id, subject: `Commission paid to ${v.name}`, body: money(v.amount), meta: { rep_id: repId } });
    }
    return { paid: rows.length, total: rows.reduce((s, r) => s + Number(r.amount), 0) };
  }),

  void: adminProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1), note: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const r = await ctx.db.from("commissions").update({ status: "void", ...(input.note ? { note: input.note } : {}) }).in("id", input.ids).neq("status", "paid").select("id");
    return { updated: must(r).length };
  }),
  reopen: adminProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1) })).mutation(async ({ ctx, input }) => {
    const r = await ctx.db.from("commissions").update({ status: "earned" }).in("id", input.ids).in("status", ["void", "approved"]).select("id");
    return { updated: must(r).length };
  }),

  addAdjustment: adminProcedure.input(z.object({ rep_id: z.string().uuid(), amount: z.number().refine((n) => n !== 0, "Amount cannot be 0"), note: z.string().min(1), company_id: z.string().uuid().nullable().optional(), earned_at: z.string().optional(), base_amount: z.number().optional() }))
    .mutation(async ({ ctx, input }) => must(await ctx.db.from("commissions").insert({
      rep_id: input.rep_id, company_id: input.company_id ?? null, base_amount: input.base_amount ?? 0, rate: 0,
      amount: input.amount, note: `Adjustment: ${input.note}`, status: "approved", earned_at: input.earned_at ?? new Date().toISOString(),
    }).select().single())),

  /** Printable statement for one rep and one month (local bounds from the browser). */
  statement: protectedProcedure.input(z.object({ rep_id: z.string().uuid(), from: z.string(), to: z.string() })).query(async ({ ctx, input }) => {
    if (!isAdmin(ctx.profile) && input.rep_id !== ctx.profile.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own statement." });
    const rep = must(await ctx.db.from("profiles").select("id, full_name, email, commission_rate, commission_months").eq("id", input.rep_id).single()) as any;
    const rows = must(await ctx.db.from("commissions").select(SELECT).eq("rep_id", input.rep_id).gte("earned_at", input.from).lte("earned_at", input.to).order("earned_at")) as any[];
    const paidInPeriod = must(await ctx.db.from("commissions").select("amount").eq("rep_id", input.rep_id).eq("status", "paid").gte("paid_at", input.from).lte("paid_at", input.to)) as any[];
    const live = rows.filter((r) => r.status !== "void");
    const byAccount: Record<string, { name: string; base: number; amount: number; n: number }> = {};
    for (const r of live) {
      const k = r.company?.name ?? (r.note ? "Adjustments" : "Other");
      byAccount[k] ??= { name: k, base: 0, amount: 0, n: 0 }; byAccount[k].base += Number(r.base_amount); byAccount[k].amount += Number(r.amount); byAccount[k].n++;
    }
    return {
      rep, rows, byAccount: Object.values(byAccount).sort((a, b) => b.amount - a.amount),
      totals: {
        base: live.reduce((s, r) => s + Number(r.base_amount), 0), amount: live.reduce((s, r) => s + Number(r.amount), 0),
        paid: live.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0),
        unpaid: live.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.amount), 0),
        paid_in_period: paidInPeriod.reduce((s, r) => s + Number(r.amount), 0),
      },
    };
  }),
});
