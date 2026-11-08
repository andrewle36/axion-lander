import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, must } from "@/server/trpc";
import { fetchAll, syncMercury, markOverdue, DEFAULT_RULES } from "@/server/services/billing";
import { businessInsights } from "@/server/services/ai";

export const TXN_CATEGORIES = ["revenue", "cogs", "payroll", "rent", "utilities", "marketing", "software", "commission", "supplies", "insurance", "fees", "other_opex", "interest", "taxes", "depreciation", "owner_draw", "transfer", "uncategorized"] as const;
export const OPEX_CATEGORIES = ["payroll", "rent", "utilities", "marketing", "software", "commission", "supplies", "insurance", "fees", "other_opex", "uncategorized"] as const;
const FIXED_OPEX = ["payroll", "rent", "utilities", "software", "insurance", "other_opex"];
const CAT = z.enum(TXN_CATEGORIES);
const SERVICE_CATS = ["smog", "retest", "dmv", "vin", "other"] as const;
const DAY = 864e5;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Pnl = Awaited<ReturnType<typeof computePnl>>;

/**
 * P&L for [from, to]. Revenue = jobs (price + cert_fee) by performed_at. COGS = cert-fee pass-through on jobs + catalog service cost
 * + bank transactions categorized cogs. Commission expense comes from the commissions ledger (bank "commission" rows are cash flow only).
 */
export async function computePnl(sb: any, from: string, to: string, opts: { repId?: string } = {}) {
  let companyIds: string[] | null = null;
  if (opts.repId) companyIds = ((must(await sb.from("companies").select("id").eq("owner_id", opts.repId)) as any[]).map((c) => c.id));
  const jobs = await fetchAll<any>((a, b) => {
    let q = sb.from("jobs").select("id, performed_at, price, cert_fee, result, company_id, contact_id, service:services(category, cost)").gte("performed_at", from).lte("performed_at", to);
    if (companyIds) q = q.in("company_id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]);
    return q.order("performed_at").range(a, b);
  });
  const txns = opts.repId ? [] : await fetchAll<any>((a, b) => sb.from("transactions").select("amount, category, posted_at").gte("posted_at", from).lte("posted_at", to).range(a, b));
  const comms = await fetchAll<any>((a, b) => {
    let q = sb.from("commissions").select("amount, status, earned_at").neq("status", "void").gte("earned_at", from).lte("earned_at", to);
    if (opts.repId) q = q.eq("rep_id", opts.repId);
    return q.range(a, b);
  });
  const payments = await fetchAll<any>((a, b) => {
    let q = sb.from("payments").select("amount, source, received_at").gte("received_at", from).lte("received_at", to);
    if (companyIds) q = q.in("company_id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]);
    return q.range(a, b);
  });

  const revenueBy: Record<string, number> = Object.fromEntries(SERVICE_CATS.map((c) => [c, 0]));
  let revenue = 0, retail = 0, partner = 0, certFees = 0, serviceCost = 0, pass = 0, fail = 0, smogCars = 0, certCount = 0;
  const days = new Set<string>();
  const contacts = new Set<string>();
  for (const j of jobs) {
    const amt = Number(j.price) + Number(j.cert_fee);
    const cat = (j.service?.category ?? "other") as string;
    revenue += amt; revenueBy[cat] = (revenueBy[cat] ?? 0) + amt;
    if (j.company_id) partner += amt; else retail += amt;
    certFees += Number(j.cert_fee);
    if (j.result === "pass" && Number(j.cert_fee) > 0) certCount++;
    serviceCost += Number(j.service?.cost ?? 0);
    if (j.result === "pass") pass++; if (j.result === "fail") fail++;
    if (cat === "smog" || cat === "retest") smogCars++;
    days.add(String(j.performed_at).slice(0, 10));
    if (j.contact_id && !j.company_id) contacts.add(j.contact_id);
  }
  const spend: Record<string, number> = Object.fromEntries(TXN_CATEGORIES.map((c) => [c, 0]));
  let bankIn = 0, bankOut = 0, uncategorizedCount = 0;
  for (const t of txns) {
    const a = Number(t.amount);
    if (a > 0) bankIn += a; else bankOut += -a;
    spend[t.category] = (spend[t.category] ?? 0) - a; // outflows become positive expense; refunds reduce it
    if (t.category === "uncategorized" && a < 0) uncategorizedCount++;
  }
  const commissionExpense = comms.reduce((s, c) => s + Number(c.amount), 0);
  const cogsBank = Math.max(0, spend.cogs ?? 0);
  const cogs = { cert_fees: r2(certFees), service_cost: r2(serviceCost), bank: r2(cogsBank), total: r2(certFees + serviceCost + cogsBank) };
  const grossProfit = revenue - cogs.total;
  const opex: Record<string, number> = {};
  for (const c of OPEX_CATEGORIES) opex[c] = c === "commission" ? r2(commissionExpense) : c === "uncategorized" ? r2(Math.max(0, spend.uncategorized ?? 0)) : r2(spend[c] ?? 0);
  const opexTotal = Object.values(opex).reduce((s, v) => s + v, 0);
  const ebitda = grossProfit - opexTotal;
  const below = { interest: r2(spend.interest ?? 0), taxes: r2(spend.taxes ?? 0), depreciation: r2(spend.depreciation ?? 0) };
  const net = ebitda - below.interest - below.taxes - below.depreciation;
  const cars = jobs.length;
  const fixedOpex = FIXED_OPEX.reduce((s, c) => s + (opex[c] ?? 0), 0);
  const operatingDays = days.size || Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY));
  const contributionPerCar = cars ? (revenue - cogs.total) / cars : 0;
  const cashCollected = payments.reduce((s, p) => s + Number(p.amount), 0);
  const m = (n: number) => (revenue ? n / revenue : 0);
  return {
    from, to,
    revenue: r2(revenue), revenue_by_category: Object.fromEntries(Object.entries(revenueBy).map(([k, v]) => [k, r2(v)])), retail: r2(retail), partner: r2(partner),
    cogs, gross_profit: r2(grossProfit), gross_margin: m(grossProfit),
    opex, opex_total: r2(opexTotal), ebitda: r2(ebitda), ebitda_margin: m(ebitda),
    below, net_profit: r2(net), net_margin: m(net),
    cash_collected: r2(cashCollected), bank_in: r2(bankIn), bank_out: r2(bankOut), owner_draw: r2(spend.owner_draw ?? 0), uncategorized_count: uncategorizedCount,
    cars, smog_cars: smogCars, certificates: certCount, pass, fail, pass_rate: pass + fail ? pass / (pass + fail) : 0,
    avg_ticket: cars ? revenue / cars : 0, operating_days: operatingDays, cars_per_day: cars / operatingDays,
    fixed_opex: r2(fixedOpex), contribution_per_car: contributionPerCar,
    break_even_cars_per_day: contributionPerCar > 0 ? fixedOpex / operatingDays / contributionPerCar : null,
    retail_customers: contacts.size, marketing: opex.marketing ?? 0,
  };
}

function prevRange(from: string, to: string) {
  const f = new Date(from).getTime(), t = new Date(to).getTime();
  const len = t - f;
  return { from: new Date(f - len - 1).toISOString(), to: new Date(f - 1).toISOString() };
}

const range = z.object({ from: z.string(), to: z.string() });

export const financeRouter = router({
  pnl: adminProcedure.input(range.extend({ compareFrom: z.string().optional(), compareTo: z.string().optional() })).query(async ({ ctx, input }) => {
    const prev = input.compareFrom && input.compareTo ? { from: input.compareFrom, to: input.compareTo } : prevRange(input.from, input.to);
    const [current, previous] = await Promise.all([computePnl(ctx.db, input.from, input.to), computePnl(ctx.db, prev.from, prev.to)]);
    return { current, previous };
  }),

  /** Charts + KPIs for the finance page. `tzOffset` = browser getTimezoneOffset() so day/month buckets are local. */
  overview: adminProcedure.input(range.extend({ tzOffset: z.number().default(0) })).query(async ({ ctx, input }) => {
    const off = input.tzOffset * 60000;
    const local = (iso: string) => new Date(new Date(iso).getTime() - off).toISOString();
    const toD = new Date(input.to);
    const end = new Date(toD.getTime() - off);
    const start12 = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1) + off).toISOString();
    const earliest = new Date(Math.min(new Date(start12).getTime(), new Date(input.from).getTime())).toISOString();
    const jobs = await fetchAll<any>((a, b) => ctx.db.from("jobs").select("performed_at, price, cert_fee, result, company_id, contact_id, company:companies(id,name), service:services(name, category)")
      .gte("performed_at", earliest).lte("performed_at", input.to).order("performed_at").range(a, b));
    const txns = await fetchAll<any>((a, b) => ctx.db.from("transactions").select("amount, category, posted_at").gte("posted_at", start12).lte("posted_at", input.to).range(a, b));

    const months: { month: string; revenue: number; cars: number; expenses: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11 + i, 1));
      months.push({ month: d.toISOString().slice(0, 7), revenue: 0, cars: 0, expenses: 0 });
    }
    const mi = Object.fromEntries(months.map((m, i) => [m.month, i]));
    const fromT = new Date(input.from).getTime();
    const byService: Record<string, number> = {};
    const byAccount: Record<string, { id: string; name: string; revenue: number; cars: number }> = {};
    const perDay: Record<string, { day: string; cars: number; revenue: number }> = {};
    for (const j of jobs) {
      const amt = Number(j.price) + Number(j.cert_fee);
      const l = local(j.performed_at);
      const k = mi[l.slice(0, 7)];
      if (k !== undefined) { months[k]!.revenue += amt; months[k]!.cars++; }
      if (new Date(j.performed_at).getTime() < fromT) continue;
      const s = j.service?.category ?? "other";
      byService[s] = (byService[s] ?? 0) + amt;
      if (j.company) { byAccount[j.company.id] ??= { id: j.company.id, name: j.company.name, revenue: 0, cars: 0 }; byAccount[j.company.id]!.revenue += amt; byAccount[j.company.id]!.cars++; }
      const day = l.slice(0, 10);
      perDay[day] ??= { day, cars: 0, revenue: 0 }; perDay[day].cars++; perDay[day].revenue += amt;
    }
    for (const t of txns) {
      const k = mi[local(t.posted_at).slice(0, 7)];
      if (k !== undefined && Number(t.amount) < 0 && !["owner_draw", "transfer"].includes(t.category)) months[k]!.expenses += -Number(t.amount);
    }
    // fill missing days in the selected range so the trend is honest
    const days: { day: string; cars: number; revenue: number }[] = [];
    const startLocal = new Date(new Date(input.from).getTime() - off);
    for (let d = Date.UTC(startLocal.getUTCFullYear(), startLocal.getUTCMonth(), startLocal.getUTCDate()); d <= end.getTime() && days.length < 400; d += DAY) {
      const key = new Date(d).toISOString().slice(0, 10);
      days.push(perDay[key] ?? { day: key, cars: 0, revenue: 0 });
    }

    // AR aging as of today
    const open = must(await ctx.db.from("invoices").select("id, number, total, amount_paid, due_date, issue_date, company:companies(name)").in("status", ["sent", "partial", "overdue"]).limit(5000)) as any[];
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 };
    const now = Date.now();
    for (const i of open) {
      const bal = Number(i.total) - Number(i.amount_paid);
      const late = Math.floor((now - new Date((i.due_date ?? i.issue_date) + "T23:59:59").getTime()) / DAY);
      if (late <= 0) aging.current += bal; else if (late <= 30) aging.d1_30 += bal; else if (late <= 60) aging.d31_60 += bal; else if (late <= 90) aging.d61_90 += bal; else aging.d90 += bal;
      aging.total += bal;
    }

    // unit economics: CAC and LTV
    const newContacts = await fetchAll<any>((a, b) => ctx.db.from("contacts").select("id").gte("created_at", input.from).lte("created_at", input.to).range(a, b));
    const newIds = new Set(newContacts.map((c) => c.id));
    const periodJobs = jobs.filter((j) => new Date(j.performed_at).getTime() >= fromT);
    const newCustomers = new Set(periodJobs.filter((j) => j.contact_id && newIds.has(j.contact_id)).map((j) => j.contact_id)).size;
    const newAccounts = (must(await ctx.db.from("companies").select("id", { count: "exact", head: false }).gte("created_at", input.from).lte("created_at", input.to).in("status", ["active", "onboarding"])) as any[]).length;
    const marketing = txns.filter((t) => t.category === "marketing" && new Date(t.posted_at).getTime() >= fromT).reduce((s, t) => s - Number(t.amount), 0);
    // LTV: trailing-12-month revenue per retail customer x gross margin x 3 (biennial smog, ~6-year retention)
    const t12 = jobs.filter((j) => !j.company_id && j.contact_id);
    const t12Customers = new Set(t12.map((j) => j.contact_id)).size;
    const t12Rev = t12.reduce((s, j) => s + Number(j.price) + Number(j.cert_fee), 0);

    return {
      months: months.map((m) => ({ ...m, revenue: r2(m.revenue), expenses: r2(m.expenses) })),
      byService: Object.entries(byService).map(([category, revenue]) => ({ category, revenue: r2(revenue) })).sort((a, b) => b.revenue - a.revenue),
      topAccounts: Object.values(byAccount).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      days, aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, r2(v)])) as typeof aging, openInvoices: open.length,
      newCustomers, newAccounts, marketing: r2(marketing), cac: newCustomers + newAccounts ? marketing / (newCustomers + newAccounts) : null,
      revenuePerRetailCustomer12m: t12Customers ? t12Rev / t12Customers : 0,
    };
  }),

  mercuryStatus: adminProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.db.from("settings").select("value").eq("key", "mercury_last_sync").maybeSingle();
    return (data?.value ?? null) as null | { at: string; imported: number; matched: number; balances: { name: string; available: number; current: number }[] };
  }),
  sync: adminProcedure.input(z.object({ days: z.number().int().min(1).max(730).default(90) }).default({ days: 90 })).mutation(async ({ input }) => {
    const r = await syncMercury(input.days);
    return { ...r, overdue: await markOverdue() };
  }),

  transactions: adminProcedure.input(z.object({ q: z.string().optional(), category: z.string().optional(), from: z.string().optional(), to: z.string().optional(), direction: z.enum(["in", "out"]).optional(), limit: z.number().max(2000).default(500) }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("transactions").select("*", { count: "exact" }).order("posted_at", { ascending: false }).limit(input.limit);
      if (input.category) q = q.eq("category", input.category);
      if (input.from) q = q.gte("posted_at", input.from);
      if (input.to) q = q.lte("posted_at", input.to);
      if (input.direction === "in") q = q.gt("amount", 0);
      if (input.direction === "out") q = q.lt("amount", 0);
      if (input.q) { const s = `%${input.q.replace(/[%,()]/g, " ")}%`; q = q.or(`counterparty.ilike.${s},description.ilike.${s},account_name.ilike.${s}`); }
      const r = await q;
      return { rows: must(r) as any[], count: r.count ?? 0 };
    }),
  setCategory: adminProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1), category: CAT, remember: z.string().optional() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("transactions").update({ category: input.category }).in("id", input.ids));
    if (input.remember?.trim()) {
      const { data } = await ctx.db.from("settings").select("value").eq("key", "category_rules").maybeSingle();
      const rules = ((data?.value as any[]) ?? DEFAULT_RULES).filter((r: any) => r.match.toLowerCase() !== input.remember!.trim().toLowerCase());
      rules.unshift({ match: input.remember.trim().toLowerCase(), category: input.category });
      must(await ctx.db.from("settings").upsert({ key: "category_rules", value: rules, updated_at: new Date().toISOString() }));
    }
    return { ok: true };
  }),
  addTransaction: adminProcedure.input(z.object({ posted_at: z.string(), amount: z.number().refine((n) => n !== 0, "Amount cannot be 0"), counterparty: z.string().min(1), description: z.string().nullable().optional(), category: CAT, account_name: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => must(await ctx.db.from("transactions").insert({ ...input, account_name: input.account_name || "Manual", status: "posted" }).select().single())),
  updateTransaction: adminProcedure.input(z.object({ id: z.string().uuid(), posted_at: z.string().optional(), amount: z.number().optional(), counterparty: z.string().optional(), description: z.string().nullable().optional(), category: CAT.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const t = must(await ctx.db.from("transactions").select("mercury_id").eq("id", id).single()) as any;
      if (t.mercury_id && (patch.amount !== undefined || patch.posted_at !== undefined)) throw new TRPCError({ code: "BAD_REQUEST", message: "Bank-synced amounts and dates can't be edited; change the category instead." });
      return must(await ctx.db.from("transactions").update(patch).eq("id", id).select().single());
    }),
  deleteTransaction: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const t = must(await ctx.db.from("transactions").select("mercury_id").eq("id", input.id).single()) as any;
    if (t.mercury_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Bank-synced transactions can't be deleted. Categorize it as transfer to exclude it." });
    must(await ctx.db.from("transactions").delete().eq("id", input.id));
    return { ok: true };
  }),
  /** Re-run the auto-categorize rules over transactions (only uncategorized by default). */
  applyRules: adminProcedure.input(z.object({ all: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const { data } = await ctx.db.from("settings").select("value").eq("key", "category_rules").maybeSingle();
    const rules = ((data?.value as any[]) ?? DEFAULT_RULES) as { match: string; category: string }[];
    const rows = await fetchAll<any>((a, b) => {
      let q = ctx.db.from("transactions").select("id, counterparty, description, category, amount");
      if (!input.all) q = q.eq("category", "uncategorized");
      return q.range(a, b);
    });
    const byCat: Record<string, string[]> = {};
    for (const t of rows) {
      const text = `${t.counterparty ?? ""} ${t.description ?? ""}`.toLowerCase();
      const rule = rules.find((r) => r.match && text.includes(r.match.toLowerCase()));
      if (rule && rule.category !== t.category) (byCat[rule.category] ??= []).push(t.id);
    }
    let updated = 0;
    for (const [cat, ids] of Object.entries(byCat)) {
      for (let i = 0; i < ids.length; i += 200) must(await ctx.db.from("transactions").update({ category: cat }).in("id", ids.slice(i, i + 200)));
      updated += ids.length;
    }
    return { updated, scanned: rows.length };
  }),

  insights: adminProcedure.input(range).mutation(async ({ ctx, input }) => {
    const prev = prevRange(input.from, input.to);
    const [current, previous] = await Promise.all([computePnl(ctx.db, input.from, input.to), computePnl(ctx.db, prev.from, prev.to)]);
    const open = must(await ctx.db.from("invoices").select("total, amount_paid, status").in("status", ["sent", "partial", "overdue"])) as any[];
    const text = await businessInsights({
      period: { from: input.from, to: input.to }, current, previous_period: previous,
      open_ar: open.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0), overdue_invoices: open.filter((i) => i.status === "overdue").length,
    });
    await ctx.db.from("settings").upsert({ key: "ai_cfo_insights", value: { text, at: new Date().toISOString(), from: input.from, to: input.to }, updated_at: new Date().toISOString() });
    return { text, at: new Date().toISOString() };
  }),
  lastInsights: adminProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.db.from("settings").select("value").eq("key", "ai_cfo_insights").maybeSingle();
    return (data?.value ?? null) as null | { text: string; at: string };
  }),
});
