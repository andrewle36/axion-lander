import { z } from "zod";
import { router, protectedProcedure, must, isAdmin } from "@/server/trpc";
import { createLead } from "@/server/services/leads";
import { logActivity } from "@/server/services/comms";
import { contactOverview } from "@/server/services/ai";
import { fireTrigger, enroll } from "@/server/services/automations";
import { toE164 } from "@/lib/utils";

const STATUS = z.enum(["lead", "contacted", "booked", "customer", "lost"]);
const patchSchema = z.object({
  first_name: z.string().optional(), last_name: z.string().optional(), email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(), company_id: z.string().uuid().nullable().optional(), title: z.string().nullable().optional(),
  kind: z.enum(["driver", "partner_contact", "lead"]).optional(), source: z.string().nullable().optional(), status: STATUS.optional(),
  owner_id: z.string().uuid().nullable().optional(), tags: z.array(z.string()).optional(), dnd_sms: z.boolean().optional(), dnd_email: z.boolean().optional(),
  next_follow_up: z.string().nullable().optional(), notes: z.string().nullable().optional(),
});

export const contactsRouter = router({
  list: protectedProcedure.input(z.object({
    q: z.string().optional(), status: STATUS.optional(), kind: z.string().optional(), owner: z.string().optional(), tag: z.string().optional(),
    sort: z.string().default("created_at"), dir: z.enum(["asc", "desc"]).default("desc"), page: z.number().default(0), pageSize: z.number().default(100),
  })).query(async ({ ctx, input }) => {
    let q = ctx.db.from("contacts").select("*, company:companies(id,name), owner:profiles!contacts_owner_id_fkey(id,full_name,color)", { count: "exact" });
    if (input.q) { const s = `%${input.q.replace(/[%,()]/g, " ")}%`; q = q.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`); }
    if (input.status) q = q.eq("status", input.status);
    if (input.kind) q = q.eq("kind", input.kind);
    if (input.tag) q = q.contains("tags", [input.tag]);
    if (input.owner === "me" || !isAdmin(ctx.profile)) q = q.eq("owner_id", ctx.profile.id);
    else if (input.owner === "unassigned") q = q.is("owner_id", null);
    else if (input.owner) q = q.eq("owner_id", input.owner);
    q = q.order(input.sort, { ascending: input.dir === "asc" }).range(input.page * input.pageSize, input.page * input.pageSize + input.pageSize - 1);
    const r = await q;
    return { rows: must(r), count: r.count ?? 0 };
  }),
  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const c = must(await ctx.db.from("contacts").select("*, company:companies(id,name,smog_price), owner:profiles!contacts_owner_id_fkey(id,full_name,color), landing:landing_pages(name), variant:landing_variants(name)").eq("id", input.id).single());
    const [vehicles, jobs, stats] = await Promise.all([
      ctx.db.from("vehicles").select("*").eq("contact_id", input.id).order("created_at"),
      ctx.db.from("jobs").select("*, service:services(name), vehicle:vehicles(year,make,model)").eq("contact_id", input.id).order("performed_at", { ascending: false }).limit(50),
      ctx.db.from("messages").select("channel", { count: "exact" }).eq("contact_id", input.id),
    ]);
    const spend = (jobs.data ?? []).reduce((s: number, j: any) => s + Number(j.price) + Number(j.cert_fee), 0);
    return { ...c, vehicles: vehicles.data ?? [], jobs: jobs.data ?? [], lifetime_spend: spend, message_count: stats.count ?? 0 };
  }),
  create: protectedProcedure.input(patchSchema.extend({ first_name: z.string().min(1), vehicle: z.object({ year: z.number().optional(), make: z.string().optional(), model: z.string().optional() }).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { contact } = await createLead({ ...input, email: input.email || null, source: input.source ?? "manual", owner_id: input.owner_id ?? ctx.profile.id, kind: input.kind ?? "driver", vehicle: input.vehicle });
      const patch: any = {};
      if (input.status) patch.status = input.status;
      if (input.tags) patch.tags = input.tags;
      if (input.title) patch.title = input.title;
      if (Object.keys(patch).length) await ctx.db.from("contacts").update(patch).eq("id", contact.id);
      return contact;
    }),
  update: protectedProcedure.input(patchSchema.extend({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    const before = must(await ctx.db.from("contacts").select("status, tags").eq("id", id).single());
    if (patch.phone !== undefined) patch.phone = toE164(patch.phone);
    if (patch.email === "") patch.email = null;
    const after = must(await ctx.db.from("contacts").update(patch).eq("id", id).select().single());
    if (patch.status && patch.status !== before.status) await logActivity({ type: "stage_change", contact_id: id, user_id: ctx.profile.id, subject: `Status: ${before.status} → ${patch.status}` });
    for (const t of (patch.tags ?? []).filter((t) => !(before.tags ?? []).includes(t))) await fireTrigger("tag_added", id, { tag: t });
    return after;
  }),
  bulkUpdate: protectedProcedure.input(z.object({ ids: z.array(z.string().uuid()).min(1), status: STATUS.optional(), owner_id: z.string().uuid().nullable().optional(), add_tag: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const patch: any = {};
      if (input.status) patch.status = input.status;
      if (input.owner_id !== undefined) patch.owner_id = input.owner_id;
      if (Object.keys(patch).length) must(await ctx.db.from("contacts").update(patch).in("id", input.ids));
      if (input.add_tag) {
        const rows = must(await ctx.db.from("contacts").select("id, tags").in("id", input.ids));
        for (const r of rows as any[]) if (!(r.tags ?? []).includes(input.add_tag)) {
          await ctx.db.from("contacts").update({ tags: [...(r.tags ?? []), input.add_tag] }).eq("id", r.id);
          await fireTrigger("tag_added", r.id, { tag: input.add_tag });
        }
      }
      return { ok: true };
    }),
  delete: protectedProcedure.input(z.object({ ids: z.array(z.string().uuid()) })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("contacts").delete().in("id", input.ids)); return { ok: true };
  }),
  timeline: protectedProcedure.input(z.object({ contact_id: z.string().uuid().optional(), company_id: z.string().uuid().optional(), type: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("activities").select("*, user:profiles(full_name,color)").order("created_at", { ascending: false }).limit(200);
      if (input.contact_id) q = q.eq("contact_id", input.contact_id);
      if (input.company_id) q = q.eq("company_id", input.company_id);
      if (input.type) q = q.eq("type", input.type);
      return must(await q);
    }),
  addNote: protectedProcedure.input(z.object({ contact_id: z.string().uuid().optional(), company_id: z.string().uuid().optional(), deal_id: z.string().uuid().optional(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => { await logActivity({ type: "note", ...input, user_id: ctx.profile.id }); return { ok: true }; }),
  deleteActivity: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("activities").delete().eq("id", input.id).eq("type", "note")); return { ok: true };
  }),
  aiOverview: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input }) => contactOverview(input.id)),
  enroll: protectedProcedure.input(z.object({ ids: z.array(z.string().uuid()), automation_id: z.string().uuid() })).mutation(async ({ input }) => {
    let n = 0; for (const id of input.ids) if (await enroll(input.automation_id, id, { source: "manual" })) n++;
    return { enrolled: n };
  }),
  // vehicles
  saveVehicle: protectedProcedure.input(z.object({
    id: z.string().uuid().optional(), contact_id: z.string().uuid().nullable().optional(), company_id: z.string().uuid().nullable().optional(),
    year: z.number().int().nullable().optional(), make: z.string().nullable().optional(), model: z.string().nullable().optional(),
    vin: z.string().nullable().optional(), plate: z.string().nullable().optional(),
    category: z.enum(["passenger", "van", "exotic", "sprinter", "old", "old_luxury"]).optional(),
    last_smog_at: z.string().nullable().optional(), next_due_at: z.string().nullable().optional(), notes: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...v } = input;
    if (v.vin) v.vin = v.vin.toUpperCase().trim();
    if (id) return must(await ctx.db.from("vehicles").update(v).eq("id", id).select().single());
    return must(await ctx.db.from("vehicles").insert(v).select().single());
  }),
  deleteVehicle: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("vehicles").delete().eq("id", input.id)); return { ok: true };
  }),
  tags: protectedProcedure.query(async ({ ctx }) => {
    const rows = must(await ctx.db.from("contacts").select("tags").not("tags", "eq", "{}").limit(2000)) as any[];
    return Array.from(new Set(rows.flatMap((r) => r.tags ?? []))).sort();
  }),
});
