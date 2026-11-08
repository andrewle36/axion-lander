import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { router, protectedProcedure, adminProcedure, must, isAdmin } from "@/server/trpc";
import { TEMPLATES } from "@/components/landing/templates";
import { normalizeContent, cleanOverrides, SLUG_RE, slugify } from "@/components/landing/types";
import { significance } from "@/components/landing/stats";

const uuid = z.string().uuid();
const MODE = z.enum(["round_robin", "weighted", "least_loaded", "specific", "none"]);
const DAY = 864e5;

async function count(sb: SupabaseClient, build: (q: any) => any): Promise<number> {
  const r = await build(sb.from("page_events").select("id", { count: "exact", head: true }));
  if (r.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: r.error.message });
  return r.count ?? 0;
}

/** Page through all events for a page since a date (Supabase caps responses at 1000 rows). */
async function fetchEvents(sb: SupabaseClient, pageId: string, since: string) {
  const out: { variant_id: string | null; type: string; created_at: string; visitor_id: string | null }[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const r = await sb.from("page_events").select("variant_id, type, created_at, visitor_id").eq("page_id", pageId).gte("created_at", since)
      .order("id").range(from, from + 999);
    if (r.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: r.error.message });
    out.push(...((r.data ?? []) as any[]));
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
}

async function uniqueSlug(sb: SupabaseClient, base: string, exceptId?: string) {
  const root = slugify(base);
  for (let i = 0; i < 200; i++) {
    const s = i === 0 ? root : `${root}-${i + 1}`;
    let q = sb.from("landing_pages").select("id").eq("slug", s);
    if (exceptId) q = q.neq("id", exceptId);
    const { data } = await q.maybeSingle();
    if (!data) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function ensureControl(sb: SupabaseClient, pageId: string) {
  const { data } = await sb.from("landing_variants").select("*").eq("page_id", pageId).eq("is_control", true).maybeSingle();
  if (data) return data as any;
  return must(await sb.from("landing_variants").insert({ page_id: pageId, name: "Control", weight: 50, content: {}, active: true, is_control: true }).select().single()) as any;
}

async function pageOr404(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("landing_pages").select("*").eq("id", id).maybeSingle();
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found" });
  return data as any;
}

const variantName = (n: number) => `Variant ${String.fromCharCode(65 + (n % 26))}`;

export const landingRouter = router({
  templates: protectedProcedure.query(() => TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, slug: t.slug, image: t.content.hero.image, headline: t.content.hero.headline }))),

  list: protectedProcedure.query(async ({ ctx }) => {
    const pages = must(await ctx.db.from("landing_pages").select("*, variants:landing_variants(id, active)").order("created_at", { ascending: false })) as any[];
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    return Promise.all(pages.map(async (p) => {
      const [views, submits, leads] = await Promise.all([
        count(ctx.db, (q) => q.eq("page_id", p.id).eq("type", "view").gte("created_at", since)),
        count(ctx.db, (q) => q.eq("page_id", p.id).eq("type", "submit").gte("created_at", since)),
        ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("landing_page_id", p.id).gte("created_at", since).then((r) => r.count ?? 0),
      ]);
      const { variants, content, ...rest } = p;
      return {
        ...rest, headline: normalizeContent(content).hero.headline,
        variant_count: (variants ?? []).length, active_variants: (variants ?? []).filter((v: any) => v.active).length,
        views_30d: views, submits_30d: submits, leads_30d: leads, conversion_30d: views ? submits / views : 0,
      };
    }));
  }),

  get: protectedProcedure.input(z.object({ id: uuid })).query(async ({ ctx, input }) => {
    const page = await pageOr404(ctx.db, input.id);
    const variants = must(await ctx.db.from("landing_variants").select("*").eq("page_id", input.id).order("is_control", { ascending: false }).order("created_at")) as any[];
    const stats = await Promise.all(variants.map(async (v) => {
      const [views, submits, calls, ctas] = await Promise.all(["view", "submit", "call_click", "cta_click"].map((t) =>
        count(ctx.db, (q) => q.eq("page_id", input.id).eq("variant_id", v.id).eq("type", t))));
      return { views: views!, submits: submits!, call_clicks: calls!, cta_clicks: ctas! };
    }));
    const [untrackedViews, untrackedSubmits, leadCount] = await Promise.all([
      count(ctx.db, (q) => q.eq("page_id", input.id).is("variant_id", null).eq("type", "view")),
      count(ctx.db, (q) => q.eq("page_id", input.id).is("variant_id", null).eq("type", "submit")),
      ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("landing_page_id", input.id).then((r) => r.count ?? 0),
    ]);
    const ci = variants.findIndex((v) => v.is_control);
    const control = ci >= 0 ? stats[ci]! : null;
    const activeWeight = variants.filter((v) => v.active).reduce((s, v) => s + Math.max(0, v.weight), 0);
    return {
      page: { ...page, content: normalizeContent(page.content) },
      lead_count: leadCount,
      unattributed: { views: untrackedViews, submits: untrackedSubmits },
      variants: variants.map((v, i) => {
        const s = stats[i]!;
        const sig = control && !v.is_control ? significance(s.submits, s.views, control.submits, control.views) : null;
        return {
          ...v, content: cleanOverrides(v.content), ...s,
          conversion: s.views ? s.submits / s.views : 0,
          traffic_share: v.active && activeWeight > 0 ? Math.max(0, v.weight) / activeWeight : 0,
          uplift: sig?.uplift ?? null, confidence: sig?.confidence ?? null, chance_to_beat: sig?.chance_to_beat ?? null, significant: sig?.significant ?? false,
        };
      }),
    };
  }),

  create: adminProcedure.input(z.object({ template: z.enum(["smog", "partner", "dmv", "blank"]), name: z.string().min(1).optional(), slug: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const tpl = TEMPLATES.find((t) => t.id === input.template)!;
      const name = input.name?.trim() || tpl.name;
      if (input.slug && !SLUG_RE.test(input.slug)) throw new TRPCError({ code: "BAD_REQUEST", message: "Slug must be lowercase kebab-case (letters, numbers, dashes)." });
      let slug: string;
      if (input.slug) {
        const { data } = await ctx.db.from("landing_pages").select("id").eq("slug", input.slug).maybeSingle();
        if (data) throw new TRPCError({ code: "CONFLICT", message: `/p/${input.slug} is already used by another page.` });
        slug = input.slug;
      } else slug = await uniqueSlug(ctx.db, input.name ? input.name : tpl.slug);
      const page = must(await ctx.db.from("landing_pages").insert({
        name, slug, status: "draft", content: tpl.content, routing_mode: "round_robin",
        thank_you_message: "Thanks! We got your request and will reach out shortly. Need us now? Call (714) 436-1700.",
      }).select().single()) as any;
      await ensureControl(ctx.db, page.id);
      return page;
    }),

  update: adminProcedure.input(z.object({
    id: uuid, name: z.string().min(1).optional(), slug: z.string().optional(), status: z.enum(["draft", "published", "archived"]).optional(),
    content: z.record(z.string(), z.any()).optional(), thank_you_message: z.string().nullable().optional(), redirect_url: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input as any;
    if (patch.slug !== undefined) {
      patch.slug = String(patch.slug).trim();
      if (!SLUG_RE.test(patch.slug)) throw new TRPCError({ code: "BAD_REQUEST", message: "Slug must be lowercase kebab-case, e.g. star-smog-check." });
      const { data } = await ctx.db.from("landing_pages").select("id").eq("slug", patch.slug).neq("id", id).maybeSingle();
      if (data) throw new TRPCError({ code: "CONFLICT", message: `/p/${patch.slug} is already used by another page.` });
    }
    if (patch.content) patch.content = normalizeContent(patch.content);
    if (patch.redirect_url) {
      patch.redirect_url = patch.redirect_url.trim();
      if (!/^(https?:\/\/|\/)/.test(patch.redirect_url)) throw new TRPCError({ code: "BAD_REQUEST", message: "Redirect URL must start with https:// or /" });
    }
    if (patch.redirect_url === "") patch.redirect_url = null;
    return must(await ctx.db.from("landing_pages").update(patch).eq("id", id).select().single());
  }),

  setStatus: adminProcedure.input(z.object({ id: uuid, status: z.enum(["draft", "published", "archived"]) })).mutation(async ({ ctx, input }) => {
    if (input.status === "published") await ensureControl(ctx.db, input.id);
    return must(await ctx.db.from("landing_pages").update({ status: input.status }).eq("id", input.id).select().single());
  }),

  duplicate: adminProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    const p = await pageOr404(ctx.db, input.id);
    const slug = await uniqueSlug(ctx.db, `${p.slug}-copy`);
    const copy = must(await ctx.db.from("landing_pages").insert({
      name: `${p.name} (copy)`, slug, status: "draft", content: p.content, routing_mode: p.routing_mode, routing_reps: p.routing_reps,
      routing_weights: p.routing_weights, thank_you_message: p.thank_you_message, redirect_url: p.redirect_url,
    }).select().single()) as any;
    const vs = must(await ctx.db.from("landing_variants").select("*").eq("page_id", p.id)) as any[];
    if (vs.length) must(await ctx.db.from("landing_variants").insert(vs.map((v) => ({ page_id: copy.id, name: v.name, weight: v.weight, content: v.content, active: v.active, is_control: v.is_control }))));
    else await ensureControl(ctx.db, copy.id);
    return copy;
  }),

  delete: adminProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("landing_pages").delete().eq("id", input.id)); return { ok: true };
  }),

  resetStats: adminProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("page_events").delete().eq("page_id", input.id)); return { ok: true };
  }),

  // ---------- variants ----------
  createVariant: adminProcedure.input(z.object({ page_id: uuid, name: z.string().optional(), from_id: uuid.optional() })).mutation(async ({ ctx, input }) => {
    const control = await ensureControl(ctx.db, input.page_id);
    const all = must(await ctx.db.from("landing_variants").select("id, name, content, weight, active").eq("page_id", input.page_id)) as any[];
    const src = (input.from_id && all.find((v) => v.id === input.from_id)) || control;
    let name = input.name?.trim();
    if (!name) { let n = all.length; while (all.some((v) => v.name === variantName(n))) n++; name = variantName(n); }
    const active = all.filter((v) => v.active);
    const weight = active.length ? Math.round(active.reduce((s, v) => s + v.weight, 0) / active.length) || 50 : 50;
    return must(await ctx.db.from("landing_variants").insert({ page_id: input.page_id, name, weight, content: cleanOverrides(src.content), active: true, is_control: false }).select().single());
  }),
  updateVariant: adminProcedure.input(z.object({
    id: uuid, name: z.string().min(1).optional(), content: z.record(z.string(), z.any()).optional(), weight: z.number().int().min(0).max(1000).optional(), active: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input as any;
    if (patch.content) patch.content = cleanOverrides(patch.content);
    return must(await ctx.db.from("landing_variants").update(patch).eq("id", id).select().single());
  }),
  deleteVariant: adminProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    const v = must(await ctx.db.from("landing_variants").select("is_control").eq("id", input.id).single()) as any;
    if (v.is_control) throw new TRPCError({ code: "BAD_REQUEST", message: "The control can't be deleted. Declare another variant the winner instead." });
    must(await ctx.db.from("landing_variants").delete().eq("id", input.id)); return { ok: true };
  }),
  declareWinner: adminProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    const v = must(await ctx.db.from("landing_variants").select("page_id").eq("id", input.id).single()) as any;
    must(await ctx.db.from("landing_variants").update({ active: false }).eq("page_id", v.page_id).neq("id", input.id));
    must(await ctx.db.from("landing_variants").update({ active: true, weight: 100 }).eq("id", input.id));
    return { ok: true };
  }),

  // ---------- routing ----------
  updateRouting: adminProcedure.input(z.object({
    id: uuid, mode: MODE, reps: z.array(uuid), weights: z.record(z.string(), z.number().min(0).max(1000)).default({}),
  })).mutation(async ({ ctx, input }) => {
    const weights: Record<string, number> = {};
    for (const r of input.reps) weights[r] = Math.round(input.weights[r] ?? 1);
    return must(await ctx.db.from("landing_pages").update({ routing_mode: input.mode, routing_reps: input.reps, routing_weights: weights }).eq("id", input.id).select().single());
  }),
  resetRotation: adminProcedure.input(z.object({ id: uuid })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("landing_pages").update({ rr_pointer: 0 }).eq("id", input.id)); return { ok: true };
  }),
  /** Side-effect-free preview of who gets the next lead, mirroring services/routing.ts pickRep. */
  routingPreview: protectedProcedure.input(z.object({ id: uuid })).query(async ({ ctx, input }) => {
    const page = await pageOr404(ctx.db, input.id);
    const reps = must(await ctx.db.from("profiles").select("id, full_name, email, color, rr_paused, active").eq("active", true)) as any[];
    const pool: string[] = page.routing_reps?.length ? page.routing_reps : reps.map((r) => r.id);
    const eligible = pool.filter((id) => reps.some((r) => r.id === id && !r.rr_paused));
    const since30 = new Date(Date.now() - 30 * DAY).toISOString();
    const since7 = new Date(Date.now() - 7 * DAY).toISOString();
    const recent = must(await ctx.db.from("contacts").select("owner_id").eq("landing_page_id", input.id).gte("created_at", since30).limit(5000)) as any[];
    const distribution: Record<string, number> = {};
    for (const r of recent) { const k = r.owner_id ?? "unassigned"; distribution[k] = (distribution[k] ?? 0) + 1; }
    const load7: Record<string, number> = {};
    await Promise.all(eligible.map(async (id) => {
      load7[id] = (await ctx.db.from("contacts").select("id", { count: "exact", head: true }).eq("owner_id", id).gte("created_at", since7)).count ?? 0;
    }));
    let next: string | null = null; let upcoming: string[] = [];
    const probabilities: Record<string, number> = {};
    const mode = page.routing_mode as string;
    if (eligible.length && mode !== "none") {
      if (mode === "specific") next = eligible[0]!;
      else if (mode === "weighted") {
        const w = eligible.map((id) => Math.max(0, Number(page.routing_weights?.[id] ?? 1)));
        const total = w.reduce((a, b) => a + b, 0) || 1;
        eligible.forEach((id, i) => { probabilities[id] = w[i]! / total; });
      } else if (mode === "least_loaded") {
        const counts = eligible.map((id) => load7[id] ?? 0);
        next = eligible[counts.indexOf(Math.min(...counts))]!;
      } else {
        const ptr = Number(page.rr_pointer ?? 0);
        next = eligible[ptr % eligible.length]!;
        upcoming = Array.from({ length: Math.min(6, eligible.length * 2) }, (_, i) => eligible[(ptr + i) % eligible.length]!);
      }
    }
    return { mode, next, upcoming, probabilities, eligible, pool_is_everyone: !page.routing_reps?.length, distribution, load7, pointer: page.rr_pointer };
  }),

  // ---------- analytics ----------
  stats: protectedProcedure.input(z.object({ pageId: uuid, days: z.number().int().min(1).max(365).default(30) })).query(async ({ ctx, input }) => {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setTime(start.getTime() - (input.days - 1) * DAY);
    const [events, variants] = await Promise.all([
      fetchEvents(ctx.db, input.pageId, start.toISOString()),
      ctx.db.from("landing_variants").select("id, name, is_control, active").eq("page_id", input.pageId).order("is_control", { ascending: false }).order("created_at").then((r) => (r.data ?? []) as any[]),
    ]);
    const keys = [...variants.map((v) => v.id as string), "none"];
    const days: { date: string; views: number; submits: number; by: Record<string, { views: number; submits: number }> }[] = [];
    const idx = new Map<string, number>();
    for (let i = 0; i < input.days; i++) {
      const d = new Date(start.getTime() + i * DAY).toISOString().slice(0, 10);
      idx.set(d, i);
      days.push({ date: d, views: 0, submits: 0, by: Object.fromEntries(keys.map((k) => [k, { views: 0, submits: 0 }])) });
    }
    const totals = { views: 0, submits: 0, call_clicks: 0, cta_clicks: 0, visitors: 0, conversion: 0 };
    const visitors = new Set<string>();
    for (const e of events) {
      if (e.visitor_id) visitors.add(e.visitor_id);
      if (e.type === "call_click") { totals.call_clicks++; continue; }
      if (e.type === "cta_click") { totals.cta_clicks++; continue; }
      const i = idx.get(e.created_at.slice(0, 10)); if (i == null) continue;
      const row = days[i]!; const k = e.variant_id && row.by[e.variant_id] ? e.variant_id : "none";
      if (e.type === "view") { row.views++; row.by[k]!.views++; totals.views++; }
      if (e.type === "submit") { row.submits++; row.by[k]!.submits++; totals.submits++; }
    }
    totals.visitors = visitors.size;
    totals.conversion = totals.views ? totals.submits / totals.views : 0;
    const perVariant = keys.map((k) => {
      const views = days.reduce((s, d) => s + d.by[k]!.views, 0), submits = days.reduce((s, d) => s + d.by[k]!.submits, 0);
      return { id: k, views, submits, conversion: views ? submits / views : 0 };
    });
    const ctrl = variants.find((v) => v.is_control);
    const ctrlStats = perVariant.find((p) => p.id === ctrl?.id);
    return {
      days, totals,
      variants: [...variants.map((v) => ({ id: v.id as string, name: v.name as string, is_control: !!v.is_control, active: !!v.active })), { id: "none", name: "Unattributed", is_control: false, active: false }],
      perVariant: perVariant.map((p) => ({
        ...p, ...(ctrlStats && p.id !== ctrl?.id && p.id !== "none" ? (({ uplift, confidence }) => ({ uplift, confidence }))(significance(p.submits, p.views, ctrlStats.submits, ctrlStats.views)) : { uplift: null, confidence: null }),
      })),
    };
  }),

  leads: protectedProcedure.input(z.object({ pageId: uuid, limit: z.number().int().min(1).max(1000).default(500) })).query(async ({ ctx, input }) => {
    let q = ctx.db.from("contacts")
      .select("id, first_name, last_name, email, phone, status, source, utm, created_at, variant:landing_variants(id,name), owner:profiles!contacts_owner_id_fkey(id,full_name,color)")
      .eq("landing_page_id", input.pageId).order("created_at", { ascending: false }).limit(input.limit);
    if (!isAdmin(ctx.profile)) q = q.eq("owner_id", ctx.profile.id);
    return must(await q) as any[];
  }),
});
