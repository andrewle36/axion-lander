import { z } from "zod";
import { router, protectedProcedure, must, isAdmin } from "@/server/trpc";
import { webrtcToken } from "@/lib/integrations/telnyx";
import { env } from "@/lib/env";
import { sendSmsToContact, sendEmailToContact, logActivity, findContact } from "@/server/services/comms";
import { draftMessage } from "@/server/services/ai";
import { chat, BUSINESS_CONTEXT } from "@/lib/integrations/openrouter";
import { fullName, toE164 } from "@/lib/utils";

export const commsRouter = router({
  dialerToken: protectedProcedure.mutation(async ({ ctx }) => {
    const key = `telnyx_cred:${ctx.profile.id}`;
    const { data } = await ctx.db.from("settings").select("value").eq("key", key).maybeSingle();
    const r = await webrtcToken((data?.value as any)?.id ?? null, `crm-${ctx.profile.email}`);
    if (!data) await ctx.db.from("settings").upsert({ key, value: { id: r.credentialId } });
    return { token: r.token, callerNumber: env.telnyxNumber };
  }),
  lookupNumber: protectedProcedure.input(z.object({ number: z.string() })).mutation(async ({ input }) => {
    const c = await findContact({ phone: input.number });
    return c ? { id: c.id as string, company_id: c.company_id as string | null, name: fullName(c) } : null;
  }),
  logCallStart: protectedProcedure.input(z.object({ to: z.string(), direction: z.enum(["in", "out"]), contact_id: z.string().uuid().nullable(), company_id: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      let contactId = input.contact_id, companyId = input.company_id;
      if (!contactId) { const c = await findContact({ phone: input.to }); contactId = c?.id ?? null; companyId = companyId ?? c?.company_id ?? null; }
      const n = toE164(input.to);
      return must(await ctx.db.from("calls").insert({
        direction: input.direction, contact_id: contactId, company_id: companyId, user_id: ctx.profile.id, status: "initiated",
        from_number: input.direction === "out" ? env.telnyxNumber : n, to_number: input.direction === "out" ? n : env.telnyxNumber,
      }).select("id").single());
    }),
  logCallEnd: protectedProcedure.input(z.object({ id: z.string().uuid(), duration_sec: z.number().int(), status: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const call = must(await ctx.db.from("calls").update({ duration_sec: input.duration_sec, status: input.status, notes: input.notes || null, ended_at: new Date().toISOString() }).eq("id", input.id).select().single());
      let summary: string | null = null;
      if (input.notes && input.notes.length > 20 && env.openrouterKey) {
        try {
          summary = await chat([{ role: "system", content: `${BUSINESS_CONTEXT}\nSummarize these call notes in 2-3 bullets and end with "Next step: …".` }, { role: "user", content: input.notes }], { tier: "fast", maxTokens: 300 });
          await ctx.db.from("calls").update({ ai_summary: summary }).eq("id", input.id);
        } catch { /* optional */ }
      }
      await logActivity({ type: "call", direction: call.direction, contact_id: call.contact_id, company_id: call.company_id, user_id: ctx.profile.id,
        subject: `${call.direction === "out" ? "Outbound" : "Inbound"} call · ${Math.floor(input.duration_sec / 60)}m ${input.duration_sec % 60}s · ${input.status.replace("_", " ")}`,
        body: summary ?? input.notes ?? null, meta: { call_id: call.id } });
      if (call.contact_id) await ctx.db.from("contacts").update({ last_contacted_at: new Date().toISOString() }).eq("id", call.contact_id);
      return { ok: true };
    }),
  calls: protectedProcedure.input(z.object({ contact_id: z.string().uuid().optional(), company_id: z.string().uuid().optional(), limit: z.number().default(100) }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("calls").select("*, contact:contacts(id,first_name,last_name), user:profiles(full_name)").order("started_at", { ascending: false }).limit(input?.limit ?? 100);
      if (input?.contact_id) q = q.eq("contact_id", input.contact_id);
      if (input?.company_id) q = q.eq("company_id", input.company_id);
      if (!isAdmin(ctx.profile) && !input?.contact_id && !input?.company_id) q = q.eq("user_id", ctx.profile.id);
      return must(await q);
    }),
  sendSms: protectedProcedure.input(z.object({ contact_id: z.string().uuid(), body: z.string().min(1).max(1600) }))
    .mutation(async ({ ctx, input }) => ({ id: await sendSmsToContact(input.contact_id, input.body, { userId: ctx.profile.id }) })),
  sendEmail: protectedProcedure.input(z.object({ contact_id: z.string().uuid(), subject: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => ({ id: await sendEmailToContact(input.contact_id, input.subject, input.body, { userId: ctx.profile.id }) })),
  draft: protectedProcedure.input(z.object({ contact_id: z.string().uuid(), channel: z.enum(["sms", "email"]), goal: z.string().default("") }))
    .mutation(({ input }) => draftMessage(input.contact_id, input.channel, input.goal)),
  thread: protectedProcedure.input(z.object({ contact_id: z.string().uuid(), channel: z.enum(["sms", "email", "all"]).default("all") }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("messages").select("*").eq("contact_id", input.contact_id).order("created_at", { ascending: true }).limit(500);
      if (input.channel !== "all") q = q.eq("channel", input.channel);
      return must(await q);
    }),
  markRead: protectedProcedure.input(z.object({ contact_id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.from("messages").update({ read_at: new Date().toISOString() }).eq("contact_id", input.contact_id).eq("direction", "in").is("read_at", null);
    return { ok: true };
  }),
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const { count } = await ctx.db.from("messages").select("id", { count: "exact", head: true }).eq("direction", "in").is("read_at", null);
    return count ?? 0;
  }),
  inbox: protectedProcedure.input(z.object({ filter: z.enum(["all", "unread", "sms", "email", "mine"]).default("all"), q: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from("messages").select("id, channel, direction, body, subject, created_at, read_at, contact_id, contact:contacts(id, first_name, last_name, phone, email, owner_id)")
        .order("created_at", { ascending: false }).limit(600);
      if (input.filter === "sms" || input.filter === "email") q = q.eq("channel", input.filter);
      const rows = must(await q) as any[];
      const map = new Map<string, any>();
      for (const m of rows) {
        if (!m.contact_id || !m.contact) continue;
        const cur = map.get(m.contact_id);
        if (!cur) map.set(m.contact_id, { contact: m.contact, last: m, unread: m.direction === "in" && !m.read_at ? 1 : 0 });
        else if (m.direction === "in" && !m.read_at) cur.unread++;
      }
      let list = Array.from(map.values());
      if (input.filter === "unread") list = list.filter((x) => x.unread > 0);
      if (input.filter === "mine") list = list.filter((x) => x.contact.owner_id === ctx.profile.id);
      if (input.q) { const s = input.q.toLowerCase(); list = list.filter((x) => fullName(x.contact).toLowerCase().includes(s) || (x.contact.phone ?? "").includes(s) || (x.contact.email ?? "").toLowerCase().includes(s)); }
      return list;
    }),
});
