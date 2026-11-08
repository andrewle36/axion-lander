import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { format } from "date-fns";
import { router, protectedProcedure, must, isAdmin, type Profile } from "@/server/trpc";
import { db } from "@/lib/supabase/admin";
import { logActivity } from "@/server/services/comms";
import { fireTrigger } from "@/server/services/automations";
import * as pandadoc from "@/lib/integrations/pandadoc";
import * as mercury from "@/lib/integrations/mercury";
import { integrationStatus } from "@/lib/env";
import { dealNo, money, toE164, fullName } from "@/lib/utils";

/* ============================================================
 * Shared deal / contract / onboarding logic (also used by the
 * onboarding router and the PandaDoc webhook).
 * ============================================================ */

export const STAGES = ["lead", "qualified", "proposal", "contract_sent", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
const STAGE = z.enum(STAGES);
const KIND = z.enum(["dealer", "rental", "repair", "exotic", "fleet", "storage", "other"]);

export const SHOP = {
  name: "Newport Smog & Auto Registration",
  address: "375 Bristol St Unit 80, Costa Mesa, CA 92626",
  phone: "(714) 436-1700",
  hours: "Mon-Fri 8am-6pm, Sat 8am-4pm, closed Sunday",
};
export const BILLING_TERMS = "Billed at end of month, due net 15";

export const DEFAULT_CHECKLIST = [
  { key: "contract_signed", label: "Partner agreement signed (PandaDoc)" },
  { key: "billing_setup", label: "Billing email + month-end invoicing set up (Mercury)" },
  { key: "pricing_confirmed", label: "Partner smog/VIN pricing confirmed" },
  { key: "contacts_added", label: "Dealer contacts added (sales manager, porter)" },
  { key: "first_car", label: "First car smogged" },
  { key: "welcome_sent", label: "Welcome email sent" },
] as const;
/** Items that must be done before an account can be activated. */
export const REQUIRED_KEYS = ["contract_signed", "billing_setup", "pricing_confirmed", "contacts_added"];

const DEAL_SELECT = "*, company:companies(id,name,kind,status,email,phone,smog_price,billing_method,payment_terms_days,contact_name), contact:contacts(id,first_name,last_name,email,phone), owner:profiles!deals_owner_id_fkey(id,full_name,color)";

/** Create (idempotently) the default onboarding checklist for an account and sync auto-detectable items. */
export async function ensureChecklist(companyId: string, dealId?: string | null) {
  const sb = db();
  const rows = DEFAULT_CHECKLIST.map((it, i) => ({ company_id: companyId, deal_id: dealId ?? null, key: it.key, label: it.label, sort: i }));
  const { error } = await sb.from("onboarding_items").upsert(rows, { onConflict: "company_id,key", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  if (dealId) await sb.from("onboarding_items").update({ deal_id: dealId }).eq("company_id", companyId).is("deal_id", null);
  // auto-sync from existing data
  const [signed, jobs, co] = await Promise.all([
    sb.from("contracts").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "completed"),
    sb.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    sb.from("companies").select("email, billing_method, mercury_customer_id").eq("id", companyId).single(),
  ]);
  if (signed.count) await completeItem(companyId, "contract_signed");
  if (jobs.count) await completeItem(companyId, "first_car");
  if (co.data?.email && co.data.billing_method === "monthly_invoice" && co.data.mercury_customer_id) await completeItem(companyId, "billing_setup");
  const { data } = await sb.from("onboarding_items").select("*").eq("company_id", companyId).order("sort");
  return data ?? [];
}

export async function completeItem(companyId: string, key: string, done = true) {
  await db().from("onboarding_items").update({ done, done_at: done ? new Date().toISOString() : null }).eq("company_id", companyId).eq("key", key);
}

/**
 * Month-end invoicing setup: when an account is billed monthly and has a billing email,
 * create the Mercury AR customer (if Mercury is connected) and mark billing_setup done.
 * Returns a human-readable note.
 */
export async function setupPayments(companyId: string): Promise<{ done: boolean; note: string }> {
  const sb = db();
  const { data: co } = await sb.from("companies").select("*").eq("id", companyId).single();
  if (!co) return { done: false, note: "Account not found" };
  if (co.billing_method !== "monthly_invoice") return { done: false, note: `Billing method is ${String(co.billing_method).replace(/_/g, " ")}; no month-end invoicing to set up.` };
  if (!co.email) return { done: false, note: "Add a billing email to finish month-end invoicing setup." };
  let note = `Month-end invoices will go to ${co.email} (net ${co.payment_terms_days ?? 15}).`;
  if (integrationStatus().mercury && !co.mercury_customer_id) {
    try {
      const id = await mercury.createCustomer(co.name, co.email);
      await sb.from("companies").update({ mercury_customer_id: id }).eq("id", companyId);
      note += " Mercury customer created.";
    } catch (e) {
      note += ` Mercury customer will be created on first invoice (${(e as Error).message}).`;
    }
  } else if (!integrationStatus().mercury) {
    note += " Mercury is not connected; invoices will be emailed directly.";
  }
  await completeItem(companyId, "billing_setup");
  await logActivity({ type: "system", company_id: companyId, subject: "Billing set up", body: note });
  return { done: true, note };
}

/** Apply a stage transition with all its side effects. Caller has already validated access. */
export async function applyStageChange(deal: any, stage: Stage, opts: { userId?: string | null; lostReason?: string | null; position?: number } = {}) {
  const sb = db();
  const from = deal.stage as Stage;
  const patch: Record<string, unknown> = { stage };
  if (opts.position != null) patch.position = opts.position;
  if (from !== stage) {
    if (stage === "won" || stage === "lost") patch.closed_at = new Date().toISOString();
    else patch.closed_at = null;
    if (stage === "lost") {
      const reason = (opts.lostReason ?? deal.lost_reason ?? "").trim();
      if (!reason) throw new TRPCError({ code: "BAD_REQUEST", message: "A lost reason is required to mark a deal lost." });
      patch.lost_reason = reason;
    } else patch.lost_reason = null;
  }
  const { data: updated, error } = await sb.from("deals").update(patch).eq("id", deal.id).select().single();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (from === stage) return updated;

  await logActivity({
    type: "stage_change", deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id, user_id: opts.userId ?? null,
    subject: `${dealNo(deal.number)} stage: ${from.replace(/_/g, " ")} → ${stage.replace(/_/g, " ")}`,
    body: stage === "lost" ? `Lost reason: ${patch.lost_reason}` : null, meta: { from, to: stage },
  });
  if (deal.contact_id) await fireTrigger("deal_stage_changed", deal.contact_id, { stage, deal_id: deal.id, company_id: deal.company_id });

  if (stage === "won" && deal.company_id) {
    const { data: co } = await sb.from("companies").select("status").eq("id", deal.company_id).single();
    const coPatch: Record<string, unknown> = {};
    if (co && co.status !== "active") coPatch.status = "onboarding";
    if (deal.owner_id) coPatch.owner_id = deal.owner_id;
    if (deal.smog_price != null) coPatch.smog_price = deal.smog_price;
    if (Object.keys(coPatch).length) await sb.from("companies").update(coPatch).eq("id", deal.company_id);
    if (coPatch.status && co?.status !== coPatch.status)
      await logActivity({ type: "stage_change", company_id: deal.company_id, deal_id: deal.id, user_id: opts.userId ?? null, subject: `Account status: ${co?.status} → onboarding` });
    await ensureChecklist(deal.company_id, deal.id);
  }
  return updated;
}

async function nextPosition(stage: string) {
  const { data } = await db().from("deals").select("position").eq("stage", stage).order("position", { ascending: false }).limit(1);
  return Number(data?.[0]?.position ?? 0) + 1000;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** Send the partner agreement through PandaDoc for a deal. Always leaves a contracts row (sent or error). */
export async function sendContractForDeal(dealId: string, opts: { recipientEmail?: string | null; recipientName?: string | null; message?: string | null; userId?: string | null } = {}) {
  const sb = db();
  const { data: deal } = await sb.from("deals").select("*, company:companies(*), contact:contacts(*)").eq("id", dealId).single();
  if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
  if (!deal.company_id) throw new TRPCError({ code: "BAD_REQUEST", message: "Link this deal to a partner account before sending a contract." });
  const co = deal.company;
  const email = (opts.recipientEmail || deal.contact?.email || co?.email || "").trim();
  if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "No recipient email: add an email to the deal contact or account, or enter one." });
  const nameStr = (opts.recipientName || (deal.contact ? fullName(deal.contact) : "") || co?.contact_name || co?.name || "").trim();
  const { first, last } = splitName(nameStr);
  const price = deal.smog_price ?? co?.smog_price;
  const cars = Number(deal.est_cars_per_month ?? 0);
  const value = Number(deal.value_monthly ?? 0) || cars * Number(price ?? 0);
  const name = `${co?.name ?? deal.name} – Partner Agreement ${dealNo(deal.number)}`;
  const tokens: Record<string, string> = {
    "Client.Company": co?.name ?? deal.name,
    "Client.FirstName": first,
    "Client.LastName": last,
    "Client.Email": email,
    "Deal.Number": dealNo(deal.number),
    "Deal.SmogPrice": price != null ? money(price) : "",
    "Deal.CarsPerMonth": String(cars),
    "Deal.MonthlyValue": money(value),
    "Deal.BillingTerms": BILLING_TERMS,
    "Shop.Name": SHOP.name,
    "Shop.Address": SHOP.address,
    "Shop.Phone": SHOP.phone,
    "Date": format(new Date(), "MMMM d, yyyy"),
  };
  try {
    const docId = await pandadoc.createAndSend({
      name, recipient: { email, first_name: first || nameStr, last_name: last }, tokens,
      metadata: { deal_id: deal.id, company_id: deal.company_id }, message: opts.message || undefined,
    });
    const { data: contract, error } = await sb.from("contracts").insert({
      deal_id: deal.id, company_id: deal.company_id, name, pandadoc_id: docId, status: "sent",
      recipient_email: email, recipient_name: nameStr || null, sent_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (["lead", "qualified", "proposal"].includes(deal.stage)) await applyStageChange(deal, "contract_sent", { userId: opts.userId });
    await logActivity({
      type: "contract", direction: "out", deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id, user_id: opts.userId ?? null,
      subject: `Partner agreement sent to ${email}`, body: `${name} sent via PandaDoc.`, meta: { contract_id: contract.id, pandadoc_id: docId },
    });
    return contract;
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("contracts").insert({
      deal_id: deal.id, company_id: deal.company_id, name, status: "error", error: msg, recipient_email: email, recipient_name: nameStr || null,
    });
    await logActivity({ type: "contract", deal_id: deal.id, company_id: deal.company_id, contact_id: deal.contact_id, user_id: opts.userId ?? null, subject: "Contract send failed", body: msg });
    throw e;
  }
}

/** A contract was signed: mark completed, win the deal, tick onboarding and kick off payment setup. */
export async function handleContractCompleted(contractId: string, opts: { userId?: string | null } = {}) {
  const sb = db();
  const { data: c } = await sb.from("contracts").select("*").eq("id", contractId).single();
  if (!c) return;
  const already = c.status === "completed";
  if (!already) await sb.from("contracts").update({ status: "completed", completed_at: new Date().toISOString(), error: null }).eq("id", contractId);
  let dealOwner: string | null = null;
  if (c.deal_id) {
    const { data: deal } = await sb.from("deals").select("*").eq("id", c.deal_id).single();
    if (deal) {
      dealOwner = deal.owner_id;
      if (deal.stage !== "won") await applyStageChange(deal, "won", { userId: opts.userId ?? null, position: await nextPosition("won") });
    }
  }
  if (c.company_id) {
    await ensureChecklist(c.company_id, c.deal_id);
    await completeItem(c.company_id, "contract_signed");
    if (!already) {
      await logActivity({
        type: "contract", direction: "in", company_id: c.company_id, deal_id: c.deal_id, user_id: opts.userId ?? null,
        subject: "Partner agreement signed", body: `${c.name} was completed${c.recipient_email ? ` by ${c.recipient_email}` : ""}.`, meta: { contract_id: c.id },
      });
      if (dealOwner) {
        await sb.from("tasks").insert({ title: "Kick off onboarding: contract signed", company_id: c.company_id, deal_id: c.deal_id, assignee_id: dealOwner, due_at: new Date(Date.now() + 864e5).toISOString() });
      }
    }
    try { await setupPayments(c.company_id); } catch (e) { console.error("setupPayments", e); }
  }
}

/** Reps may only touch their own (or unassigned) deals. */
async function loadDeal(profile: Profile, id: string) {
  const { data, error } = await db().from("deals").select("*").eq("id", id).single();
  if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
  if (!isAdmin(profile) && data.owner_id && data.owner_id !== profile.id) throw new TRPCError({ code: "FORBIDDEN", message: "This deal belongs to another rep." });
  return data;
}
async function loadContract(profile: Profile, id: string) {
  const { data } = await db().from("contracts").select("*").eq("id", id).single();
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
  if (data.deal_id) await loadDeal(profile, data.deal_id);
  return data;
}

const dealFields = z.object({
  name: z.string().min(1).optional(),
  company_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  est_cars_per_month: z.number().int().min(0).optional(),
  smog_price: z.number().min(0).nullable().optional(),
  value_monthly: z.number().min(0).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  expected_close: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
});

export const dealsRouter = router({
  list: protectedProcedure.input(z.object({
    stage: STAGE.optional(), owner: z.string().optional(), q: z.string().optional(), companyId: z.string().uuid().optional(),
  }).default({})).query(async ({ ctx, input }) => {
    let q = ctx.db.from("deals").select(DEAL_SELECT);
    if (input.stage) q = q.eq("stage", input.stage);
    if (input.companyId) q = q.eq("company_id", input.companyId);
    if (!isAdmin(ctx.profile) || input.owner === "me") q = q.eq("owner_id", ctx.profile.id);
    else if (input.owner === "unassigned") q = q.is("owner_id", null);
    else if (input.owner) q = q.eq("owner_id", input.owner);
    if (input.q?.trim()) {
      const raw = input.q.trim();
      const s = raw.replace(/[%,()]/g, " ");
      const ors = [`name.ilike.%${s}%`];
      const num = raw.replace(/^ns-?/i, "");
      if (/^\d+$/.test(num)) ors.push(`number.eq.${num}`);
      const cos = must(await ctx.db.from("companies").select("id").ilike("name", `%${s}%`).limit(200)) as any[];
      if (cos.length) ors.push(`company_id.in.(${cos.map((c) => c.id).join(",")})`);
      q = q.or(ors.join(","));
    }
    return must(await q.order("position").order("created_at", { ascending: false })) as any[];
  }),

  get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    await loadDeal(ctx.profile, input.id);
    const deal = must(await ctx.db.from("deals").select(DEAL_SELECT).eq("id", input.id).single()) as any;
    const [contracts, contacts] = await Promise.all([
      ctx.db.from("contracts").select("*").eq("deal_id", input.id).order("created_at", { ascending: false }),
      deal.company_id ? ctx.db.from("contacts").select("id,first_name,last_name,email,phone,title").eq("company_id", deal.company_id).order("created_at") : Promise.resolve({ data: [] as any[] }),
    ]);
    return { ...deal, contracts: contracts.data ?? [], company_contacts: contacts.data ?? [] };
  }),

  create: protectedProcedure.input(dealFields.extend({
    stage: STAGE.default("lead"),
    newCompany: z.object({
      name: z.string().min(1), kind: KIND.default("dealer"), phone: z.string().optional(), email: z.string().optional(), contact_name: z.string().optional(),
    }).optional(),
  })).mutation(async ({ ctx, input }) => {
    const { newCompany, stage, ...f } = input;
    if (stage === "lost" && !f.lost_reason?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A lost reason is required to mark a deal lost." });
    const owner = isAdmin(ctx.profile) ? (f.owner_id ?? ctx.profile.id) : ctx.profile.id;
    let companyId = f.company_id ?? null;
    let contactId = f.contact_id ?? null;
    let companyName: string | null = null;
    if (newCompany) {
      const email = newCompany.email?.trim() || null;
      const phone = toE164(newCompany.phone) ?? null;
      const co = must(await ctx.db.from("companies").insert({
        name: newCompany.name.trim(), kind: newCompany.kind, phone, email, contact_name: newCompany.contact_name?.trim() || null,
        status: "prospect", owner_id: owner, smog_price: f.smog_price ?? null,
      }).select().single()) as any;
      companyId = co.id; companyName = co.name;
      await logActivity({ type: "system", company_id: co.id, user_id: ctx.profile.id, subject: "Account created from new deal" });
      if (newCompany.contact_name?.trim()) {
        const { first, last } = splitName(newCompany.contact_name);
        const ct = must(await ctx.db.from("contacts").insert({
          first_name: first, last_name: last, email, phone, company_id: co.id, kind: "partner_contact", status: "lead", source: "deal", owner_id: owner,
        }).select().single()) as any;
        contactId = ct.id;
      }
    } else if (companyId) {
      const co = must(await ctx.db.from("companies").select("name, smog_price").eq("id", companyId).single()) as any;
      companyName = co.name;
      if (f.smog_price == null && co.smog_price != null) f.smog_price = Number(co.smog_price);
      if (!contactId) {
        const { data: ct } = await ctx.db.from("contacts").select("id").eq("company_id", companyId).order("created_at").limit(1);
        contactId = ct?.[0]?.id ?? null;
      }
    }
    const cars = f.est_cars_per_month ?? 0;
    const value = f.value_monthly ?? cars * Number(f.smog_price ?? 0);
    const deal = must(await ctx.db.from("deals").insert({
      name: f.name?.trim() || (companyName ? `${companyName} partner account` : "New partner deal"),
      company_id: companyId, contact_id: contactId, stage: stage === "won" || stage === "lost" ? "lead" : stage,
      est_cars_per_month: cars, smog_price: f.smog_price ?? null, value_monthly: Math.round(value * 100) / 100,
      owner_id: owner, expected_close: f.expected_close || null, position: await nextPosition(stage),
    }).select().single()) as any;
    await logActivity({ type: "system", deal_id: deal.id, company_id: companyId, contact_id: contactId, user_id: ctx.profile.id, subject: `Deal ${dealNo(deal.number)} created` });
    if (stage === "won" || stage === "lost") return applyStageChange(deal, stage, { userId: ctx.profile.id, lostReason: f.lost_reason });
    return deal;
  }),

  update: protectedProcedure.input(dealFields.extend({ id: z.string().uuid(), stage: STAGE.optional() })).mutation(async ({ ctx, input }) => {
    const { id, stage, ...patch } = input;
    const before = await loadDeal(ctx.profile, id);
    if (!isAdmin(ctx.profile) && patch.owner_id !== undefined && patch.owner_id !== ctx.profile.id) delete patch.owner_id;
    const p: Record<string, unknown> = { ...patch };
    if (p.expected_close === "") p.expected_close = null;
    // value_monthly auto-computes from cars × price unless it was overridden (didn't match the formula) or is set now
    if (patch.value_monthly === undefined && (patch.est_cars_per_month !== undefined || patch.smog_price !== undefined)) {
      const oldAuto = Number(before.est_cars_per_month) * Number(before.smog_price ?? 0);
      const overridden = Number(before.value_monthly) !== 0 && Math.abs(Number(before.value_monthly) - oldAuto) > 0.005;
      if (!overridden) {
        const cars = patch.est_cars_per_month ?? Number(before.est_cars_per_month);
        const price = patch.smog_price !== undefined ? Number(patch.smog_price ?? 0) : Number(before.smog_price ?? 0);
        p.value_monthly = Math.round(cars * price * 100) / 100;
      }
    }
    delete p.lost_reason;
    if (patch.lost_reason !== undefined && before.stage === "lost") p.lost_reason = patch.lost_reason;
    let after = before;
    if (Object.keys(p).length) after = must(await ctx.db.from("deals").update(p).eq("id", id).select().single());
    if (stage && stage !== before.stage) after = await applyStageChange(after, stage, { userId: ctx.profile.id, lostReason: patch.lost_reason, position: await nextPosition(stage) });
    return after;
  }),

  /** Kanban drag & drop. */
  move: protectedProcedure.input(z.object({ id: z.string().uuid(), stage: STAGE, position: z.number(), lost_reason: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const deal = await loadDeal(ctx.profile, input.id);
    return applyStageChange(deal, input.stage, { userId: ctx.profile.id, lostReason: input.lost_reason, position: input.position });
  }),

  delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await loadDeal(ctx.profile, input.id);
    must(await ctx.db.from("deals").delete().eq("id", input.id));
    return { ok: true };
  }),

  stats: protectedProcedure.input(z.object({ owner: z.string().optional() }).default({})).query(async ({ ctx, input }) => {
    let q = ctx.db.from("deals").select("stage, value_monthly, created_at, closed_at");
    if (!isAdmin(ctx.profile) || input.owner === "me") q = q.eq("owner_id", ctx.profile.id);
    else if (input.owner === "unassigned") q = q.is("owner_id", null);
    else if (input.owner) q = q.eq("owner_id", input.owner);
    const rows = must(await q) as any[];
    const byStage = Object.fromEntries(STAGES.map((s) => [s, { count: 0, value: 0 }])) as Record<Stage, { count: number; value: number }>;
    for (const r of rows) { const s = byStage[r.stage as Stage]; if (s) { s.count++; s.value += Number(r.value_monthly ?? 0); } }
    const won = rows.filter((r) => r.stage === "won");
    const closed = won.length + byStage.lost.count;
    const cycles = won.filter((r) => r.closed_at).map((r) => (new Date(r.closed_at).getTime() - new Date(r.created_at).getTime()) / 864e5);
    const openValue = (["lead", "qualified", "proposal", "contract_sent"] as Stage[]).reduce((s, k) => s + byStage[k].value, 0);
    return {
      byStage, total: rows.length, openValue, wonValue: byStage.won.value,
      winRate: closed ? won.length / closed : 0,
      avgCycleDays: cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 0,
    };
  }),

  timeline: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    await loadDeal(ctx.profile, input.id);
    return must(await ctx.db.from("activities").select("*, user:profiles(full_name,color)").eq("deal_id", input.id).order("created_at", { ascending: false }).limit(200)) as any[];
  }),

  /* ---------- contracts ---------- */
  sendContract: protectedProcedure.input(z.object({
    dealId: z.string().uuid(), recipientEmail: z.string().email().optional().or(z.literal("")), recipientName: z.string().optional(), message: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await loadDeal(ctx.profile, input.dealId);
    return sendContractForDeal(input.dealId, { recipientEmail: input.recipientEmail || null, recipientName: input.recipientName, message: input.message, userId: ctx.profile.id });
  }),

  contracts: protectedProcedure.input(z.object({ companyId: z.string().uuid().optional(), dealId: z.string().uuid().optional() })).query(async ({ ctx, input }) => {
    if (!input.companyId && !input.dealId) return [];
    let q = ctx.db.from("contracts").select("*, deal:deals(id,number,name,stage)").order("created_at", { ascending: false });
    if (input.dealId) q = q.eq("deal_id", input.dealId);
    else if (input.companyId) q = q.eq("company_id", input.companyId);
    return must(await q) as any[];
  }),

  resendContract: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const c = await loadContract(ctx.profile, input.id);
    if (c.pandadoc_id && ["sent", "viewed"].includes(c.status)) {
      await pandadoc.send(c.pandadoc_id);
      await ctx.db.from("contracts").update({ sent_at: new Date().toISOString() }).eq("id", c.id);
      await logActivity({ type: "contract", direction: "out", deal_id: c.deal_id, company_id: c.company_id, user_id: ctx.profile.id, subject: `Partner agreement re-sent to ${c.recipient_email ?? "recipient"}` });
      return c;
    }
    if (c.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "This contract is already signed." });
    if (!c.deal_id) throw new TRPCError({ code: "BAD_REQUEST", message: "This contract isn't linked to a deal; send a new one from the deal." });
    // error / voided / declined / draft: issue a fresh document
    if (c.status !== "error") await ctx.db.from("contracts").update({ status: "voided" }).eq("id", c.id);
    return sendContractForDeal(c.deal_id, { recipientEmail: c.recipient_email, recipientName: c.recipient_name, userId: ctx.profile.id });
  }),

  voidContract: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const c = await loadContract(ctx.profile, input.id);
    if (c.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "A signed contract can't be voided here." });
    must(await ctx.db.from("contracts").update({ status: "voided" }).eq("id", c.id));
    await logActivity({ type: "contract", deal_id: c.deal_id, company_id: c.company_id, user_id: ctx.profile.id, subject: "Contract voided", body: c.name });
    return { ok: true };
  }),

  signingLink: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const c = await loadContract(ctx.profile, input.id);
    if (!c.pandadoc_id) throw new TRPCError({ code: "BAD_REQUEST", message: "This contract was never created in PandaDoc." });
    if (!c.recipient_email) throw new TRPCError({ code: "BAD_REQUEST", message: "Contract has no recipient email." });
    return { url: await pandadoc.sessionLink(c.pandadoc_id, c.recipient_email) };
  }),

  refreshContract: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const c = await loadContract(ctx.profile, input.id);
    if (!c.pandadoc_id) throw new TRPCError({ code: "BAD_REQUEST", message: "This contract was never created in PandaDoc." });
    const raw = await pandadoc.status(c.pandadoc_id);
    const st = pandadoc.mapStatus(raw);
    if (!st) return { status: c.status, raw };
    if (st === "completed") { await handleContractCompleted(c.id, { userId: ctx.profile.id }); return { status: st, raw }; }
    const patch: Record<string, unknown> = { status: st };
    if (st === "viewed" && !c.viewed_at) patch.viewed_at = new Date().toISOString();
    must(await ctx.db.from("contracts").update(patch).eq("id", c.id));
    return { status: st, raw };
  }),
});
