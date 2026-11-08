import { z } from "zod";
import { router, protectedProcedure, adminProcedure, must } from "@/server/trpc";
import { integrationStatus, env } from "@/lib/env";
import * as telnyx from "@/lib/integrations/telnyx";
import * as calendly from "@/lib/integrations/calendly";
import * as pandadoc from "@/lib/integrations/pandadoc";
import * as mercury from "@/lib/integrations/mercury";
import { chat, models, DEFAULT_MODELS } from "@/lib/integrations/openrouter";
import { sendEmail } from "@/lib/integrations/resend";
import { DEFAULT_RULES } from "@/server/services/billing";

const DEMO_TABLES = ["page_events", "automation_runs", "commissions", "payments", "invoices", "jobs", "messages", "calls", "activities", "tasks", "events", "contracts", "deals", "vehicles", "contacts", "landing_pages", "automations", "transactions", "companies"];

export const settingsRouter = router({
  get: protectedProcedure.input(z.object({ key: z.string() })).query(async ({ ctx, input }) => {
    const { data } = await ctx.db.from("settings").select("value").eq("key", input.key).maybeSingle();
    return (data?.value ?? null) as any;
  }),
  set: adminProcedure.input(z.object({ key: z.string().regex(/^[a-z_]+$/), value: z.any() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("settings").upsert({ key: input.key, value: input.value, updated_at: new Date().toISOString() }));
    return { ok: true };
  }),
  aiModels: protectedProcedure.query(() => models()),
  defaultModels: protectedProcedure.query(() => DEFAULT_MODELS),
  categoryRules: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.db.from("settings").select("value").eq("key", "category_rules").maybeSingle();
    return ((data?.value as any) ?? DEFAULT_RULES) as { match: string; category: string }[];
  }),
  integrations: protectedProcedure.query(() => ({
    status: integrationStatus(),
    webhooks: {
      telnyx: `${env.appUrl}/api/webhooks/telnyx`,
      resend: `${env.appUrl}/api/webhooks/resend`,
      calendly: `${env.appUrl}/api/webhooks/calendly`,
      pandadoc: `${env.appUrl}/api/webhooks/pandadoc`,
      leads: `${env.appUrl}/api/public/lead`,
    },
    from: { sms: env.telnyxNumber, email: env.resendFrom },
  })),
  testIntegration: adminProcedure
    .input(z.object({ provider: z.enum(["openrouter", "telnyx", "resend", "calendly", "pandadoc", "mercury"]), to: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      switch (input.provider) {
        case "openrouter":
          return { ok: true, detail: await chat([{ role: "user", content: "Reply with: Newport Smog CRM connected." }], { tier: "fast", maxTokens: 20 }) };
        case "telnyx": {
          const n = await telnyx.listNumbers();
          return { ok: true, detail: `${n.length} number(s): ${n.map((x) => x.phone_number).join(", ")}` };
        }
        case "resend": {
          const to = input.to || ctx.profile.email;
          const id = await sendEmail({ to, subject: "Newport Smog CRM test email", html: "<p>Resend is connected.</p>" });
          return { ok: true, detail: `Sent test email (${id}) to ${to}` };
        }
        case "calendly": {
          const me = await calendly.me();
          const wh = await calendly.ensureWebhook();
          return { ok: true, detail: `Connected as ${me.name}. Webhook ${wh.state ?? "active"} -> ${wh.callback_url}` };
        }
        case "pandadoc": {
          const t = await pandadoc.templates();
          return { ok: true, detail: `${t.length} templates: ${t.slice(0, 5).map((x) => `${x.name} (${x.id})`).join(", ")}` };
        }
        case "mercury": {
          const a = await mercury.accounts();
          return { ok: true, detail: a.map((x) => `${x.name}: $${x.availableBalance.toLocaleString()}`).join(" · ") };
        }
      }
    }),
  services: protectedProcedure.query(async ({ ctx }) => must(await ctx.db.from("services").select("*").order("sort"))),
  saveService: adminProcedure
    .input(z.object({
      id: z.string().uuid().optional(), code: z.string().min(1), name: z.string().min(1),
      category: z.enum(["smog", "retest", "dmv", "vin", "other"]), vehicle_category: z.string().nullable().optional(),
      price: z.number(), cert_fee: z.number(), cost: z.number(), active: z.boolean(), sort: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...s } = input;
      if (id) return must(await ctx.db.from("services").update(s).eq("id", id).select().single());
      return must(await ctx.db.from("services").insert(s).select().single());
    }),
  archiveService: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("services").update({ active: false }).eq("id", input.id));
    return { ok: true };
  }),
  demoCounts: adminProcedure.query(async ({ ctx }) => {
    const out: Record<string, number> = {};
    for (const t of ["contacts", "companies", "deals", "jobs", "invoices", "transactions", "events", "messages"]) {
      const { count } = await ctx.db.from(t).select("id", { count: "exact", head: true }).eq("is_demo", true);
      out[t] = count ?? 0;
    }
    return out;
  }),
  wipeDemo: adminProcedure.input(z.object({ confirm: z.literal("DELETE DEMO DATA") })).mutation(async ({ ctx }) => {
    const removed: Record<string, number> = {};
    for (const t of DEMO_TABLES) {
      const { count, error } = await ctx.db.from(t).delete({ count: "exact" }).eq("is_demo", true);
      if (error) throw new Error(`${t}: ${error.message}`);
      removed[t] = count ?? 0;
    }
    return removed;
  }),
});
