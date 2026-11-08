import { z } from "zod";
import { router, protectedProcedure, must, isAdmin } from "@/server/trpc";
import { fetchAll } from "@/server/services/billing";
import { computePnl } from "./finance";

const DAY = 864e5;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Local-time anchors as UTC instants, given the browser's getTimezoneOffset(). */
function anchors(off: number) {
  const now = Date.now();
  const ms = off * 60000;
  const l = new Date(now - ms); // wall clock as if UTC
  const today = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + ms;
  const month = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) + ms;
  const prevMonth = Date.UTC(l.getUTCFullYear(), l.getUTCMonth() - 1, 1) + ms;
  const elapsed = now - month;
  return {
    now, today, yesterday: today - DAY, tomorrow: today + DAY, month, prevMonth,
    prevMonthSame: Math.min(prevMonth + elapsed, month - 1), d30: today - 29 * DAY, d7: now - 7 * DAY, d14: now - 14 * DAY,
  };
}
const iso = (t: number) => new Date(t).toISOString();

export const dashboardRouter = router({
  summary: protectedProcedure.input(z.object({ tzOffset: z.number().default(0) })).query(async ({ ctx, input }) => {
    const admin = isAdmin(ctx.profile);
    const me = ctx.profile.id;
    const a = anchors(input.tzOffset);
    const off = input.tzOffset * 60000;
    const since = Math.min(a.prevMonth, a.d30);

    // ---- jobs (scoped to the rep's accounts and customers for reps) ----
    const JOBS = "id, performed_at, price, cert_fee, result, company_id, contact_id";
    let jobs: any[];
    if (admin) jobs = await fetchAll<any>((x, y) => ctx.db.from("jobs").select(JOBS).gte("performed_at", iso(since)).range(x, y));
    else {
      const [byCo, byContact] = await Promise.all([
        fetchAll<any>((x, y) => ctx.db.from("jobs").select(`${JOBS}, company:companies!inner(owner_id)`).eq("company.owner_id", me).gte("performed_at", iso(since)).range(x, y)),
        fetchAll<any>((x, y) => ctx.db.from("jobs").select(`${JOBS}, contact:contacts!inner(owner_id)`).eq("contact.owner_id", me).gte("performed_at", iso(since)).range(x, y)),
      ]);
      const m = new Map<string, any>(); for (const j of [...byCo, ...byContact]) m.set(j.id, j); jobs = Array.from(m.values());
    }
    const inRange = (j: any, f: number, t: number) => { const x = new Date(j.performed_at).getTime(); return x >= f && x < t; };
    const agg = (f: number, t: number) => {
      let rev = 0, cars = 0, pass = 0, fail = 0;
      for (const j of jobs) if (inRange(j, f, t)) { rev += Number(j.price) + Number(j.cert_fee); cars++; if (j.result === "pass") pass++; if (j.result === "fail") fail++; }
      return { rev: r2(rev), cars, pass_rate: pass + fail ? pass / (pass + fail) : null };
    };
    const today = agg(a.today, a.tomorrow), yesterday = agg(a.yesterday, a.today);
    const mtd = agg(a.month, a.tomorrow), prevMtd = agg(a.prevMonth, a.prevMonthSame);

    const days: { day: string; revenue: number; cars: number }[] = [];
    for (let t = a.d30; t < a.tomorrow; t += DAY) {
      const s = agg(t, t + DAY);
      days.push({ day: new Date(t - off).toISOString().slice(0, 10), revenue: s.rev, cars: s.cars });
    }
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, cars: 0 }));
    for (const j of jobs) if (new Date(j.performed_at).getTime() >= a.d30) hours[new Date(new Date(j.performed_at).getTime() - off).getUTCHours()]!.cars++;
    const openHours = hours.filter((h) => h.cars > 0);
    const hourRange = openHours.length ? hours.slice(Math.min(...openHours.map((h) => h.hour)), Math.max(...openHours.map((h) => h.hour)) + 1) : hours.slice(8, 19);

    // ---- leads / funnel / pipeline ----
    const scopeOwner = (q: any, col = "owner_id") => (admin ? q : q.eq(col, me));
    const [leads7, leadsPrev7, funnelRows, deals, apptsUpcoming, apptsToday, tasks, acts, openInv] = await Promise.all([
      scopeOwner(ctx.db.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", iso(a.d7))),
      scopeOwner(ctx.db.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", iso(a.d14)).lt("created_at", iso(a.d7))),
      Promise.all(["lead", "contacted", "booked", "customer", "lost"].map(async (s) => {
        const r = await scopeOwner(ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("status", s));
        return { stage: s, count: r.count ?? 0 };
      })),
      scopeOwner(ctx.db.from("deals").select("stage, value_monthly").limit(5000)),
      ctx.db.from("events").select("id, contact:contacts(owner_id), created_by", { count: "exact" }).gte("start_at", iso(a.now)).lt("start_at", iso(a.now + 7 * DAY)).in("status", ["confirmed", "tentative"]).limit(2000),
      ctx.db.from("events").select("id, title, start_at, end_at, status, location, all_day, contact:contacts(id,first_name,last_name,phone,owner_id), calendar:calendars(name,color), created_by")
        .gte("start_at", iso(a.today)).lt("start_at", iso(a.tomorrow)).neq("status", "cancelled").order("start_at").limit(100),
      (() => { let q = ctx.db.from("tasks").select("id, title, due_at, done, contact:contacts(id,first_name,last_name), company:companies(id,name), assignee:profiles(id,full_name,color)").eq("done", false).lt("due_at", iso(a.tomorrow + DAY)).order("due_at").limit(25); if (!admin) q = q.eq("assignee_id", me); return q; })(),
      (() => { let q = ctx.db.from("activities").select("id, type, direction, subject, body, created_at, contact:contacts(id,first_name,last_name), company:companies(id,name), user:profiles(full_name,color)").order("created_at", { ascending: false }).limit(20); if (!admin) q = q.eq("user_id", me); return q; })(),
      ctx.db.from("invoices").select("total, amount_paid, status, company:companies(owner_id)").in("status", ["sent", "partial", "overdue"]).limit(5000),
    ]);
    const mineEvent = (e: any) => admin || e.created_by === me || e.contact?.owner_id === me;
    const stageOrder = ["lead", "qualified", "proposal", "contract_sent", "won", "lost"];
    const pipeline = stageOrder.map((s) => {
      const ds = ((deals.data ?? []) as any[]).filter((d) => d.stage === s);
      return { stage: s, count: ds.length, value: r2(ds.reduce((t, d) => t + Number(d.value_monthly), 0)) };
    });
    const inv = ((openInv.data ?? []) as any[]).filter((i) => admin || i.company?.owner_id === me);
    const openAr = inv.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);
    const overdueAr = inv.filter((i) => i.status === "overdue").reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0);

    // ---- leaderboard: revenue sourced (commission base) + commission, this month ----
    const comms = await fetchAll<any>((x, y) => ctx.db.from("commissions").select("rep_id, base_amount, amount, rep:profiles!commissions_rep_id_fkey(id,full_name,color)").neq("status", "void").gte("earned_at", iso(a.month)).range(x, y));
    const board: Record<string, { id: string; name: string; color: string; revenue: number; commission: number }> = {};
    for (const c of comms) {
      board[c.rep_id] ??= { id: c.rep_id, name: c.rep?.full_name ?? "Rep", color: c.rep?.color ?? "#888", revenue: 0, commission: 0 };
      board[c.rep_id]!.revenue += Number(c.base_amount); board[c.rep_id]!.commission += Number(c.amount);
    }
    const leaderboard = Object.values(board).map((b) => ({ ...b, revenue: r2(b.revenue), commission: r2(b.commission), me: b.id === me })).sort((x, y) => y.revenue - x.revenue);

    let net: null | { mtd: number; prev: number; margin: number } = null;
    if (admin) {
      const [c, p] = await Promise.all([computePnl(ctx.db, iso(a.month), iso(a.now)), computePnl(ctx.db, iso(a.prevMonth), iso(a.prevMonthSame))]);
      net = { mtd: c.net_profit, prev: p.net_profit, margin: c.net_margin };
    }

    return {
      admin, name: ctx.profile.full_name,
      kpis: {
        revenue_today: today.rev, revenue_yesterday: yesterday.rev, revenue_mtd: mtd.rev, revenue_prev_mtd: prevMtd.rev,
        cars_today: today.cars, cars_yesterday: yesterday.cars, cars_mtd: mtd.cars, cars_prev_mtd: prevMtd.cars,
        pass_rate_mtd: mtd.pass_rate, pass_rate_prev: prevMtd.pass_rate,
        leads_7d: leads7.count ?? 0, leads_prev_7d: leadsPrev7.count ?? 0,
        appointments_upcoming: ((apptsUpcoming.data ?? []) as any[]).filter(mineEvent).length,
        open_ar: r2(openAr), overdue_ar: r2(overdueAr), open_invoices: inv.length, net,
      },
      days, hours: hourRange, funnel: funnelRows, pipeline,
      appointments: ((apptsToday.data ?? []) as any[]).filter(mineEvent),
      tasks: must(tasks) as any[], activity: must(acts) as any[], leaderboard,
    };
  }),
});
