import "server-only";
import { db } from "@/lib/supabase/admin";
import { chat, BUSINESS_CONTEXT } from "@/lib/integrations/openrouter";
import { fullName, money } from "@/lib/utils";

const SYSTEM = `${BUSINESS_CONTEXT}
You are the CRM's analyst. Write a client overview in Markdown with these sections:
**Snapshot** (2 sentences), **Relationship & value** (bullets with numbers), **Recent activity** (bullets), **Risks** (bullets), **Next best actions** (3 numbered, specific, with suggested message wording when useful).
Use only facts given. Keep it under 250 words.`;

export async function contactOverview(contactId: string) {
  const sb = db();
  const [{ data: c }, { data: acts }, { data: msgs }, { data: jobs }, { data: vehicles }, { data: events }] = await Promise.all([
    sb.from("contacts").select("*, company:companies(name)").eq("id", contactId).single(),
    sb.from("activities").select("type,direction,subject,body,created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(30),
    sb.from("messages").select("channel,direction,subject,body,created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20),
    sb.from("jobs").select("performed_at,price,cert_fee,result,description").eq("contact_id", contactId).order("performed_at", { ascending: false }).limit(20),
    sb.from("vehicles").select("year,make,model,category,last_smog_at,next_due_at").eq("contact_id", contactId),
    sb.from("events").select("title,start_at,status").eq("contact_id", contactId).order("start_at", { ascending: false }).limit(10),
  ]);
  if (!c) throw new Error("Contact not found");
  const facts = {
    name: fullName(c), status: c.status, source: c.source, company: c.company?.name, created: c.created_at, last_contacted: c.last_contacted_at, tags: c.tags, notes: c.notes,
    lifetime_spend: money((jobs ?? []).reduce((s, j: any) => s + Number(j.price) + Number(j.cert_fee), 0)),
    vehicles, jobs, appointments: events, messages: msgs, activities: acts,
  };
  const summary = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(facts) }]);
  await sb.from("contacts").update({ ai_summary: summary, ai_summary_at: new Date().toISOString() }).eq("id", contactId);
  return summary;
}

export async function companyOverview(companyId: string) {
  const sb = db();
  const since = new Date(Date.now() - 180 * 864e5).toISOString();
  const [{ data: co }, { data: jobs }, { data: invoices }, { data: deals }, { data: acts }, { data: contacts }] = await Promise.all([
    sb.from("companies").select("*").eq("id", companyId).single(),
    sb.from("jobs").select("performed_at,price,cert_fee,result").eq("company_id", companyId).gte("performed_at", since),
    sb.from("invoices").select("number,total,amount_paid,status,due_date,period_start").eq("company_id", companyId).order("issue_date", { ascending: false }).limit(12),
    sb.from("deals").select("number,name,stage,value_monthly,est_cars_per_month,closed_at").eq("company_id", companyId),
    sb.from("activities").select("type,direction,subject,body,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(30),
    sb.from("contacts").select("first_name,last_name,title,phone,email").eq("company_id", companyId),
  ]);
  if (!co) throw new Error("Account not found");
  const byMonth: Record<string, { cars: number; revenue: number; fails: number }> = {};
  for (const j of jobs ?? []) {
    const k = String(j.performed_at).slice(0, 7);
    byMonth[k] ??= { cars: 0, revenue: 0, fails: 0 };
    byMonth[k].cars++; byMonth[k].revenue += Number(j.price) + Number(j.cert_fee); if (j.result === "fail") byMonth[k].fails++;
  }
  const facts = { account: { name: co.name, kind: co.kind, status: co.status, smog_price: co.smog_price, billing: co.billing_method, notes: co.notes, since: co.created_at }, monthly_volume: byMonth, invoices, deals, contacts, activities: acts };
  const summary = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(facts) }]);
  await sb.from("companies").update({ ai_summary: summary, ai_summary_at: new Date().toISOString() }).eq("id", companyId);
  return summary;
}

export async function draftMessage(contactId: string, channel: "sms" | "email", goal: string) {
  const sb = db();
  const { data: c } = await sb.from("contacts").select("first_name,last_name,status,source,notes,company:companies(name)").eq("id", contactId).single();
  const { data: msgs } = await sb.from("messages").select("channel,direction,body,created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(8);
  const out = await chat([
    { role: "system", content: `${BUSINESS_CONTEXT}\nDraft a ${channel === "sms" ? "single SMS under 300 characters" : 'short email as JSON {"subject":"...","body":"..."}'} for the user to review. Plain text, no placeholders in brackets.` },
    { role: "user", content: `Goal: ${goal || "friendly follow-up"}\nContact: ${JSON.stringify(c)}\nRecent conversation (newest first): ${JSON.stringify(msgs)}` },
  ], { tier: "fast", json: channel === "email" });
  if (channel === "email") { try { return JSON.parse(out) as { subject: string; body: string }; } catch { return { subject: "Following up", body: out }; } }
  return { subject: "", body: out };
}

export async function businessInsights(metrics: unknown) {
  return chat([
    { role: "system", content: `${BUSINESS_CONTEXT}\nYou are the owner's CFO/COO advisor. Given KPIs, write 5 short, specific, numbered insights with a recommended action each. Markdown. Under 220 words.` },
    { role: "user", content: JSON.stringify(metrics) },
  ]);
}
