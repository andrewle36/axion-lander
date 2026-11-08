import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, must } from "@/server/trpc";
import { TRIGGERS, TEMPLATES, blankGraph, enroll, processRun, validateGraph, type Graph } from "@/server/services/automations";

const nodeSchema = z.object({
  id: z.string(), type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.any()).default({}),
});
const edgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string(), sourceHandle: z.string().nullable().optional() });
const graphSchema = z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) });
const RUN_STATUS = z.enum(["running", "waiting", "completed", "failed", "stopped"]);
const now = () => new Date().toISOString();

/** Keep the trigger node's data in sync with the automation's trigger_type. */
function syncTrigger(graph: Graph, triggerType: string): Graph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.type === "trigger" ? { ...n, data: { ...n.data, trigger_type: triggerType } } : n)) };
}

export const automationsRouter = router({
  triggers: protectedProcedure.query(() => Object.entries(TRIGGERS).map(([id, t]) => ({ id, ...t }))),

  templates: protectedProcedure.query(() => TEMPLATES.map((t) => {
    const g = t.build();
    return { id: t.id, name: t.name, description: t.description, trigger_type: t.trigger_type, trigger_label: TRIGGERS[t.trigger_type]?.label ?? t.trigger_type, steps: g.nodes.filter((n) => n.type !== "trigger" && n.type !== "end").map((n) => n.type) };
  })),

  /** Landing pages for the trigger config select (read directly so it works even before the landing router exists). */
  landingPages: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.db.from("landing_pages").select("id, name, slug, status").order("name");
    return data ?? [];
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = must(await ctx.db.from("automations").select("*").order("updated_at", { ascending: false })) as any[];
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const stats = await Promise.all(rows.map(async (a) => {
      const runs = (s: string[]) => ctx.db.from("automation_runs").select("id", { count: "exact", head: true }).eq("automation_id", a.id).in("status", s);
      const [active, completed, failed, sent, lastRun] = await Promise.all([
        runs(["running", "waiting"]), runs(["completed"]), runs(["failed"]),
        ctx.db.from("messages").select("id, automation_runs!inner(automation_id)", { count: "exact", head: true })
          .eq("automation_runs.automation_id", a.id).eq("direction", "out").gte("created_at", since),
        ctx.db.from("automation_runs").select("created_at").eq("automation_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { active_runs: active.count ?? 0, completed: completed.count ?? 0, failed: failed.count ?? 0, sent_30d: sent.count ?? 0, last_run_at: (lastRun.data as any)?.created_at ?? null };
    }));
    return rows.map((a, i) => ({
      ...a, ...stats[i]!, trigger_label: TRIGGERS[a.trigger_type]?.label ?? a.trigger_type,
      step_count: ((a.graph?.nodes ?? []) as any[]).filter((n) => n.type !== "trigger" && n.type !== "end").length,
    }));
  }),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const a = must(await ctx.db.from("automations").select("*").eq("id", input.id).single()) as any;
    if (!a.graph?.nodes) a.graph = blankGraph(a.trigger_type);
    return a as { id: string; name: string; description: string | null; status: "draft" | "active" | "paused"; trigger_type: string; trigger_config: Record<string, any>; graph: Graph; created_at: string; updated_at: string };
  }),

  create: protectedProcedure.input(z.object({ name: z.string().optional(), templateId: z.string().optional(), trigger_type: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const tpl = input.templateId ? TEMPLATES.find((t) => t.id === input.templateId) : null;
      if (input.templateId && !tpl) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      const trigger_type = tpl?.trigger_type ?? input.trigger_type ?? "lead_created";
      const row = {
        name: input.name?.trim() || tpl?.name || "Untitled automation",
        description: tpl?.description ?? null,
        status: "draft",
        trigger_type,
        trigger_config: tpl?.trigger_config ?? { stop_on_reply: true, allow_reentry: false },
        graph: tpl ? tpl.build() : blankGraph(trigger_type),
      };
      return must(await ctx.db.from("automations").insert(row).select().single());
    }),

  update: protectedProcedure.input(z.object({
    id: z.string().uuid(), name: z.string().min(1).optional(), description: z.string().nullable().optional(),
    status: z.enum(["draft", "active", "paused"]).optional(), trigger_type: z.string().optional(),
    trigger_config: z.record(z.string(), z.any()).optional(), graph: graphSchema.optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    if (patch.trigger_type && !TRIGGERS[patch.trigger_type]) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown trigger" });
    const cur = must(await ctx.db.from("automations").select("trigger_type, graph, status").eq("id", id).single()) as any;
    const triggerType = patch.trigger_type ?? cur.trigger_type;
    const graph = patch.graph ? syncTrigger(patch.graph as Graph, triggerType) : undefined;
    const finalStatus = patch.status ?? cur.status;
    if (finalStatus === "active") {
      const errs = validateGraph(graph ?? cur.graph);
      if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Can't activate: ${errs.join("; ")}` });
    }
    return must(await ctx.db.from("automations").update({ ...patch, ...(graph ? { graph } : {}) }).eq("id", id).select().single());
  }),

  setStatus: protectedProcedure.input(z.object({ id: z.string().uuid(), status: z.enum(["draft", "active", "paused"]) })).mutation(async ({ ctx, input }) => {
    if (input.status === "active") {
      const a = must(await ctx.db.from("automations").select("graph").eq("id", input.id).single()) as any;
      const errs = validateGraph(a.graph);
      if (errs.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Can't activate: ${errs.join("; ")}` });
    }
    return must(await ctx.db.from("automations").update({ status: input.status }).eq("id", input.id).select().single());
  }),

  duplicate: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const a = must(await ctx.db.from("automations").select("*").eq("id", input.id).single()) as any;
    return must(await ctx.db.from("automations").insert({
      name: `${a.name} (copy)`, description: a.description, status: "draft", trigger_type: a.trigger_type, trigger_config: a.trigger_config, graph: a.graph,
    }).select().single());
  }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("automations").delete().eq("id", input.id));
    return { ok: true };
  }),

  runs: protectedProcedure.input(z.object({ automationId: z.string().uuid().optional(), status: RUN_STATUS.optional(), q: z.string().optional(), limit: z.number().min(1).max(500).default(200) }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("automation_runs")
        .select("id, automation_id, contact_id, status, current_node, next_run_at, error, log, context, created_at, updated_at, contact:contacts(id, first_name, last_name, phone, email), automation:automations(id, name, graph)")
        .order("created_at", { ascending: false }).limit(input.limit);
      if (input.automationId) q = q.eq("automation_id", input.automationId);
      if (input.status) q = q.eq("status", input.status);
      const rows = must(await q) as any[];
      const out = rows.map((r) => {
        const nodes: any[] = r.automation?.graph?.nodes ?? [];
        const cur = nodes.find((n) => n.id === r.current_node);
        const log: any[] = Array.isArray(r.log) ? r.log : [];
        const last = log[log.length - 1] ?? null;
        return {
          id: r.id as string, automation_id: r.automation_id as string, automation_name: (r.automation?.name ?? "") as string,
          contact_id: r.contact_id as string | null, contact: r.contact as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null,
          status: r.status as string, current_node: r.current_node as string | null, current_step: cur ? (cur.data?.label || cur.type) as string : null, current_type: (cur?.type ?? null) as string | null,
          next_run_at: r.next_run_at as string, error: r.error as string | null, created_at: r.created_at as string, updated_at: r.updated_at as string,
          last_log: last ? { at: last.at as string, msg: last.msg as string, ok: last.ok !== false } : null, steps: log.length, test: !!r.context?.test,
        };
      });
      if (!input.q) return out;
      const s = input.q.toLowerCase();
      return out.filter((r) => `${r.contact?.first_name ?? ""} ${r.contact?.last_name ?? ""} ${r.contact?.phone ?? ""} ${r.contact?.email ?? ""}`.toLowerCase().includes(s));
    }),

  runDetail: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const r = must(await ctx.db.from("automation_runs")
      .select("*, contact:contacts(id, first_name, last_name, phone, email, status), automation:automations(id, name, graph)").eq("id", input.id).single()) as any;
    const nodes: any[] = r.automation?.graph?.nodes ?? [];
    const nodeName = (id: string) => { const n = nodes.find((x) => x.id === id); return n ? { label: (n.data?.label || n.type) as string, type: n.type as string } : { label: id, type: "unknown" }; };
    type LogRow = { at: string; node: string; msg: string; ok: boolean; label: string; type: string };
    const log: LogRow[] = ((Array.isArray(r.log) ? r.log : []) as any[]).map((l) => ({ at: l.at as string, node: l.node as string, msg: l.msg as string, ok: l.ok !== false, ...nodeName(l.node) }));
    const { data: messages } = await ctx.db.from("messages").select("id, channel, subject, body, status, error, created_at").eq("automation_run_id", input.id).order("created_at");
    return {
      id: r.id as string, status: r.status as string, error: r.error as string | null, created_at: r.created_at as string, next_run_at: r.next_run_at as string,
      current_node: r.current_node as string | null, current: r.current_node ? nodeName(r.current_node) : null,
      contact: r.contact as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null; status: string } | null,
      automation: { id: r.automation?.id as string, name: r.automation?.name as string }, test: !!r.context?.test,
      log, messages: (messages ?? []) as { id: string; channel: string; subject: string | null; body: string | null; status: string; error: string | null; created_at: string }[],
    };
  }),

  stopRun: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const r = must(await ctx.db.from("automation_runs").select("log, status").eq("id", input.id).single()) as any;
    if (!["running", "waiting"].includes(r.status)) throw new TRPCError({ code: "BAD_REQUEST", message: `Run is already ${r.status}` });
    const log = [...(Array.isArray(r.log) ? r.log : []), { at: now(), node: "manual", msg: `Stopped by ${ctx.profile.full_name ?? ctx.profile.email}`, ok: true }];
    must(await ctx.db.from("automation_runs").update({ status: "stopped", error: "Stopped manually", log, updated_at: now() }).eq("id", input.id));
    return { ok: true };
  }),

  retryRun: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const r = must(await ctx.db.from("automation_runs").select("log, status, current_node").eq("id", input.id).single()) as any;
    if (!r.current_node) throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing left to run in this execution" });
    const log = [...(Array.isArray(r.log) ? r.log : []), { at: now(), node: r.current_node, msg: `Retried by ${ctx.profile.full_name ?? ctx.profile.email}`, ok: true }];
    must(await ctx.db.from("automation_runs").update({ status: "running", next_run_at: now(), error: null, log, updated_at: now() }).eq("id", input.id));
    await processRun(input.id);
    const after = must(await ctx.db.from("automation_runs").select("status, error").eq("id", input.id).single()) as any;
    return { status: after.status as string, error: after.error as string | null };
  }),

  enrollContacts: protectedProcedure.input(z.object({ automationId: z.string().uuid(), contactIds: z.array(z.string().uuid()).min(1).max(500) }))
    .mutation(async ({ input }) => {
      let enrolled = 0, skipped = 0;
      for (const id of input.contactIds) {
        const run = await enroll(input.automationId, id, { source: "manual" });
        if (run) enrolled++; else skipped++;
      }
      return { enrolled, skipped };
    }),

  testRun: protectedProcedure.input(z.object({ automationId: z.string().uuid(), contactId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const run = await enroll(input.automationId, input.contactId, { source: "test" }, { force: true, test: true });
    if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not start test run" });
    const after = must(await ctx.db.from("automation_runs").select("id, status, error").eq("id", run.id).single()) as any;
    return { id: after.id as string, status: after.status as string, error: after.error as string | null };
  }),
});
