import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, must, isAdmin } from "@/server/trpc";
import { logActivity, sendEmailToContact } from "@/server/services/comms";
import { money } from "@/lib/utils";
import {
  ensureChecklist, completeItem, setupPayments, sendContractForDeal, DEFAULT_CHECKLIST, REQUIRED_KEYS, SHOP, BILLING_TERMS,
} from "./deals";

const BILLING = z.enum(["monthly_invoice", "per_job", "card_on_file", "zelle", "check", "cash"]);

/** Pick the deal that represents this account's partnership: newest won, else newest open, else newest. */
function pickDeal(deals: any[]) {
  const sorted = [...deals].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return sorted.find((d) => d.stage === "won") ?? sorted.find((d) => d.stage !== "lost") ?? sorted[0] ?? null;
}

async function primaryContact(sb: any, companyId: string) {
  const { data } = await sb.from("contacts").select("id, first_name, last_name, email, phone, kind").eq("company_id", companyId).order("created_at");
  const list = (data ?? []) as any[];
  return list.find((c) => c.email && c.kind === "partner_contact") ?? list.find((c) => c.email) ?? list[0] ?? null;
}

function welcomeEmail(co: any) {
  const price = co.smog_price != null ? money(co.smog_price) : null;
  const old = co.old_car_price != null ? money(co.old_car_price) : null;
  const vin = co.vin_price != null ? money(co.vin_price) : null;
  const terms = co.billing_method === "monthly_invoice"
    ? `${BILLING_TERMS.replace("net 15", `net ${co.payment_terms_days ?? 15}`)}. You'll get one itemized invoice at month end${co.email ? ` at ${co.email}` : ""} listing every car (date, vehicle, VIN and job number), with a secure pay link.`
    : `Billing: ${String(co.billing_method).replace(/_/g, " ")}.`;
  const subject = `Welcome to Newport Smog, ${co.name}!`;
  const body = `Hi {{first_name}},

Welcome aboard! ${co.name} is now set up as a Newport Smog partner account. Here's everything your team needs to start sending cars our way.

HOW DROP-OFF WORKS
- Bring the car to ${SHOP.address}. No appointment needed for partner cars; just tell the front desk it's for ${co.name}.
- Your porter can leave the keys with us; we'll text or call when it's done (most smogs take about 20-30 minutes).
- We're a STAR certified test-only station, so we test and certify only. No repairs, no upsells.
- Certificates are sent to the DMV electronically, and we'll send you the results for every car.

HOURS
${SHOP.hours}

YOUR PARTNER PRICING
${price ? `- Smog check: ${price} per car` : "- Smog check: your partner rate as agreed"}
${old ? `- Pre-2000 vehicles: ${old}\n` : ""}${vin ? `- VIN verification: ${vin}\n` : ""}- Retests on failed cars at partner rates

MONTH-END BILLING
${terms}

Questions or a rush car? Call or text us at ${SHOP.phone}. Your rep is {{rep_name}}.

Thanks for partnering with us!
${SHOP.name}`;
  return { subject, body };
}

export const onboardingRouter = router({
  /** Accounts in onboarding plus those activated in the last 30 days. */
  board: protectedProcedure.input(z.object({ owner: z.string().optional() }).default({})).query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19) + "Z";
    let q = ctx.db.from("companies").select("*, owner:profiles!companies_owner_id_fkey(id,full_name,color)")
      .or(`status.eq.onboarding,and(status.eq.active,updated_at.gte.${since})`);
    if (!isAdmin(ctx.profile) || input.owner === "me") q = q.eq("owner_id", ctx.profile.id);
    else if (input.owner) q = q.eq("owner_id", input.owner);
    const cos = must(await q.order("updated_at", { ascending: false })) as any[];
    if (!cos.length) return [];
    const ids = cos.map((c) => c.id);
    const [items, deals, contracts, contacts] = await Promise.all([
      ctx.db.from("onboarding_items").select("*").in("company_id", ids).order("sort"),
      ctx.db.from("deals").select("id, number, name, stage, value_monthly, est_cars_per_month, smog_price, created_at, company_id, owner_id").in("company_id", ids),
      ctx.db.from("contracts").select("id, status, company_id, created_at, completed_at").in("company_id", ids).order("created_at", { ascending: false }),
      ctx.db.from("contacts").select("id, first_name, last_name, email, kind, company_id").in("company_id", ids).order("created_at"),
    ]);
    const by = <T extends { company_id: string }>(rows: T[] | null) => {
      const m: Record<string, T[]> = {};
      for (const r of rows ?? []) (m[r.company_id] ??= []).push(r);
      return m;
    };
    const I = by(items.data as any[]), D = by(deals.data as any[]), K = by(contracts.data as any[]), P = by(contacts.data as any[]);
    // only include recently-activated accounts that actually went through onboarding
    return cos.filter((c) => c.status === "onboarding" || (I[c.id]?.length ?? 0) > 0).map((c) => {
      const its = I[c.id] ?? [];
      const ppl = P[c.id] ?? [];
      return {
        ...c,
        items: its,
        done: its.filter((i: any) => i.done).length,
        total: its.length,
        requiredDone: REQUIRED_KEYS.every((k) => its.find((i: any) => i.key === k)?.done),
        deal: pickDeal(D[c.id] ?? []),
        latestContract: (K[c.id] ?? [])[0] ?? null,
        primaryContact: ppl.find((p: any) => p.email && p.kind === "partner_contact") ?? ppl.find((p: any) => p.email) ?? ppl[0] ?? null,
        contactCount: ppl.length,
      };
    });
  }),

  items: protectedProcedure.input(z.object({ companyId: z.string().uuid() })).query(async ({ ctx, input }) =>
    must(await ctx.db.from("onboarding_items").select("*").eq("company_id", input.companyId).order("sort")) as any[]),

  ensureChecklist: protectedProcedure.input(z.object({ companyId: z.string().uuid(), dealId: z.string().uuid().optional() })).mutation(async ({ input }) =>
    ensureChecklist(input.companyId, input.dealId)),

  toggle: protectedProcedure.input(z.object({ id: z.string().uuid(), done: z.boolean() })).mutation(async ({ ctx, input }) => {
    const it = must(await ctx.db.from("onboarding_items").update({ done: input.done, done_at: input.done ? new Date().toISOString() : null }).eq("id", input.id).select().single()) as any;
    await logActivity({ type: "system", company_id: it.company_id, deal_id: it.deal_id, user_id: ctx.profile.id, subject: `Onboarding: ${it.label} ${input.done ? "✓ done" : "reopened"}` });
    return it;
  }),

  /** 1-click contract for an account: uses its won/open deal, or creates one if none exists. */
  sendContract: protectedProcedure.input(z.object({ companyId: z.string().uuid(), recipientEmail: z.string().email().optional() })).mutation(async ({ ctx, input }) => {
    const deals = must(await ctx.db.from("deals").select("*").eq("company_id", input.companyId)) as any[];
    let deal = pickDeal(deals);
    if (deal && deal.stage === "lost") deal = null;
    if (!deal) {
      const co = must(await ctx.db.from("companies").select("name, smog_price, owner_id").eq("id", input.companyId).single()) as any;
      const contact = await primaryContact(ctx.db, input.companyId);
      const { data: pos } = await ctx.db.from("deals").select("position").eq("stage", "proposal").order("position", { ascending: false }).limit(1);
      deal = must(await ctx.db.from("deals").insert({
        name: `${co.name} partner account`, company_id: input.companyId, contact_id: contact?.id ?? null, stage: "proposal",
        smog_price: co.smog_price, owner_id: co.owner_id ?? ctx.profile.id, position: Number(pos?.[0]?.position ?? 0) + 1000,
      }).select().single());
      await logActivity({ type: "system", deal_id: deal.id, company_id: input.companyId, user_id: ctx.profile.id, subject: "Deal created for contract" });
    }
    return sendContractForDeal(deal.id, { recipientEmail: input.recipientEmail, userId: ctx.profile.id });
  }),

  sendWelcome: protectedProcedure.input(z.object({ companyId: z.string().uuid(), contactId: z.string().uuid().optional() })).mutation(async ({ ctx, input }) => {
    const co = must(await ctx.db.from("companies").select("*").eq("id", input.companyId).single()) as any;
    const contact = input.contactId ? { id: input.contactId } : await primaryContact(ctx.db, input.companyId);
    if (!contact) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a contact with an email to this account first." });
    const { subject, body } = welcomeEmail(co);
    await sendEmailToContact(contact.id, subject, body, { userId: ctx.profile.id });
    await ensureChecklist(input.companyId);
    await completeItem(input.companyId, "welcome_sent");
    await logActivity({ type: "system", company_id: input.companyId, contact_id: contact.id, user_id: ctx.profile.id, subject: "Partner welcome email sent" });
    return { ok: true };
  }),

  setupBilling: protectedProcedure.input(z.object({
    companyId: z.string().uuid(), email: z.string().email(), billing_method: BILLING, payment_terms_days: z.number().int().min(0).max(120),
  })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("companies").update({ email: input.email, billing_method: input.billing_method, payment_terms_days: input.payment_terms_days }).eq("id", input.companyId));
    await ensureChecklist(input.companyId);
    const r = await setupPayments(input.companyId);
    if (!r.done) {
      // non-monthly methods are still a completed billing setup
      await completeItem(input.companyId, "billing_setup");
      await logActivity({ type: "system", company_id: input.companyId, user_id: ctx.profile.id, subject: "Billing set up", body: `${input.billing_method.replace(/_/g, " ")}, billing email ${input.email}` });
      return { ok: true, note: `Billing set to ${input.billing_method.replace(/_/g, " ")}.` };
    }
    return { ok: true, note: r.note };
  }),

  activate: protectedProcedure.input(z.object({ companyId: z.string().uuid(), force: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const items = await ensureChecklist(input.companyId);
    const missing = items.filter((i: any) => REQUIRED_KEYS.includes(i.key) && !i.done);
    if (missing.length && !(input.force && isAdmin(ctx.profile)))
      throw new TRPCError({ code: "BAD_REQUEST", message: `Finish first: ${missing.map((m: any) => m.label).join("; ")}` });
    const before = must(await ctx.db.from("companies").select("status").eq("id", input.companyId).single()) as any;
    must(await ctx.db.from("companies").update({ status: "active" }).eq("id", input.companyId));
    await logActivity({
      type: "stage_change", company_id: input.companyId, user_id: ctx.profile.id,
      subject: `Account activated (${before.status} → active)`, body: missing.length ? `Activated with open items: ${missing.map((m: any) => m.label).join("; ")}` : "All required onboarding items complete.",
    });
    return { ok: true };
  }),

  checklistTemplate: protectedProcedure.query(() => ({ items: DEFAULT_CHECKLIST, required: REQUIRED_KEYS })),
});
