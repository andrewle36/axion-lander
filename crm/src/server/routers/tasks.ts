import { z } from "zod";
import { router, protectedProcedure, must } from "@/server/trpc";
import { logActivity } from "@/server/services/comms";

const SELECT = "*, contact:contacts(id,first_name,last_name), company:companies(id,name), deal:deals(id,number,name), assignee:profiles(id,full_name,color)";

const fields = z.object({
  title: z.string().min(1).optional(),
  due_at: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const tasksRouter = router({
  list: protectedProcedure.input(z.object({
    scope: z.enum(["mine", "all"]).default("mine"),
    assignee: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(), companyId: z.string().uuid().optional(), dealId: z.string().uuid().optional(),
    q: z.string().optional(),
    doneLimit: z.number().int().min(0).max(500).default(50),
  }).default({ scope: "mine", doneLimit: 50 })).query(async ({ ctx, input }) => {
    const build = (done: boolean) => {
      let q = ctx.db.from("tasks").select(SELECT).eq("done", done);
      if (input.contactId) q = q.eq("contact_id", input.contactId);
      if (input.companyId) q = q.eq("company_id", input.companyId);
      if (input.dealId) q = q.eq("deal_id", input.dealId);
      if (input.assignee) q = q.eq("assignee_id", input.assignee);
      else if (input.scope === "mine" && !input.contactId && !input.companyId && !input.dealId) q = q.eq("assignee_id", ctx.profile.id);
      if (input.q?.trim()) q = q.ilike("title", `%${input.q.trim().replace(/[%,()]/g, " ")}%`);
      return q;
    };
    const [open, done] = await Promise.all([
      build(false).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000),
      input.doneLimit ? build(true).order("created_at", { ascending: false }).limit(input.doneLimit) : Promise.resolve({ data: [], error: null }),
    ]);
    return { open: must(open) as any[], done: must(done as any) as any[] };
  }),

  create: protectedProcedure.input(fields.extend({ title: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const t = must(await ctx.db.from("tasks").insert({
      ...input, title: input.title.trim(), due_at: input.due_at || null,
      assignee_id: input.assignee_id === undefined ? ctx.profile.id : input.assignee_id,
    }).select(SELECT).single()) as any;
    await logActivity({ type: "task", contact_id: t.contact_id, company_id: t.company_id, deal_id: t.deal_id, user_id: ctx.profile.id, subject: `Task created: ${t.title}` });
    return t;
  }),

  update: protectedProcedure.input(fields.extend({ id: z.string().uuid(), done: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    if (patch.due_at === "") patch.due_at = null;
    return must(await ctx.db.from("tasks").update(patch).eq("id", id).select(SELECT).single());
  }),

  toggle: protectedProcedure.input(z.object({ id: z.string().uuid(), done: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const cur = must(await ctx.db.from("tasks").select("done").eq("id", input.id).single()) as any;
    const done = input.done ?? !cur.done;
    const t = must(await ctx.db.from("tasks").update({ done }).eq("id", input.id).select(SELECT).single()) as any;
    if (done && !cur.done) await logActivity({ type: "task", contact_id: t.contact_id, company_id: t.company_id, deal_id: t.deal_id, user_id: ctx.profile.id, subject: `Task completed: ${t.title}` });
    return t;
  }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("tasks").delete().eq("id", input.id));
    return { ok: true };
  }),

  /** Link pickers for quick add. */
  linkOptions: protectedProcedure.input(z.object({ q: z.string().default("") })).query(async ({ ctx, input }) => {
    const s = input.q.trim().replace(/[%,()]/g, " ");
    const like = `%${s}%`;
    const num = s.replace(/^ns-?/i, "");
    let cq = ctx.db.from("contacts").select("id, first_name, last_name, company_id").limit(8);
    if (s) cq = cq.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`);
    let coq = ctx.db.from("companies").select("id, name").limit(8);
    if (s) coq = coq.ilike("name", like);
    let dq = ctx.db.from("deals").select("id, number, name, company_id, contact_id").limit(8).order("created_at", { ascending: false });
    if (s) dq = /^\d+$/.test(num) ? dq.eq("number", Number(num)) : dq.ilike("name", like);
    const [c, co, d] = await Promise.all([cq, coq, dq]);
    return { contacts: (c.data ?? []) as any[], companies: (co.data ?? []) as any[], deals: (d.data ?? []) as any[] };
  }),
});
