import "server-only";
import { db } from "@/lib/supabase/admin";
import { sendSmsToContact, sendEmailToContact, logActivity, contactVars } from "./comms";
import { chat, BUSINESS_CONTEXT } from "@/lib/integrations/openrouter";
import { renderTemplate } from "@/lib/utils";

export type FlowNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, any> };
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };
export type Graph = { nodes: FlowNode[]; edges: FlowEdge[] };

export const TRIGGERS: Record<string, { label: string; description: string }> = {
  lead_created: { label: "New lead created", description: "Any new lead from a form, Calendly, call or manual entry" },
  form_submitted: { label: "Landing page form submitted", description: "A visitor submits a specific landing page form" },
  appointment_booked: { label: "Appointment booked", description: "Calendly booking or calendar appointment created" },
  appointment_cancelled: { label: "Appointment cancelled", description: "Calendly cancellation" },
  job_completed: { label: "Smog job completed", description: "A smog / DMV job is logged (great for review requests)" },
  smog_due: { label: "Vehicle smog due soon", description: "Vehicle next smog due within N days (checked daily)" },
  tag_added: { label: "Tag added", description: "A tag is added to a contact" },
  deal_stage_changed: { label: "Deal stage changed", description: "Partner deal moves to a stage" },
  inbound_sms: { label: "Inbound SMS received", description: "Contact texts in (optional keyword)" },
  invoice_overdue: { label: "Invoice overdue", description: "Partner invoice passes its due date" },
  manual: { label: "Manual enroll", description: "Enroll contacts by hand from a profile or list" },
};

function matches(a: any, payload: Record<string, any>) {
  const c = a.trigger_config ?? {};
  if (c.landing_page_id && c.landing_page_id !== payload.landing_page_id) return false;
  if (c.source && c.source !== payload.source) return false;
  if (c.tag && c.tag !== payload.tag) return false;
  if (c.stage && c.stage !== payload.stage) return false;
  if (c.keyword && !String(payload.text ?? "").toLowerCase().includes(String(c.keyword).toLowerCase())) return false;
  return true;
}

/** Enroll a contact in every active automation listening to this trigger. */
export async function fireTrigger(trigger: string, contactId: string, payload: Record<string, any> = {}) {
  try {
    const { data: autos } = await db().from("automations").select("*").eq("status", "active").eq("trigger_type", trigger);
    for (const a of autos ?? []) {
      if (!matches(a, payload)) continue;
      await enroll(a.id, contactId, payload);
    }
  } catch (e) { console.error("fireTrigger", trigger, e); }
}

export async function enroll(automationId: string, contactId: string, payload: Record<string, any> = {}, opts: { force?: boolean; test?: boolean } = {}) {
  const sb = db();
  const { data: a } = await sb.from("automations").select("*").eq("id", automationId).single();
  if (!a) throw new Error("Automation not found");
  if (!opts.force && !a.trigger_config?.allow_reentry) {
    const { count } = await sb.from("automation_runs").select("id", { count: "exact", head: true })
      .eq("automation_id", automationId).eq("contact_id", contactId).in("status", ["running", "waiting"]);
    if (count) return null;
  }
  const g = (a.graph ?? { nodes: [], edges: [] }) as Graph;
  const trig = g.nodes.find((n) => n.type === "trigger");
  const first = trig ? nextOf(g, trig.id) : g.nodes[0]?.id;
  const { data: run } = await sb.from("automation_runs").insert({
    automation_id: automationId, contact_id: contactId, current_node: first ?? null, status: first ? "running" : "completed",
    context: { payload, enrolled_at: new Date().toISOString(), ...(opts.test ? { test: true } : {}) },
    log: [{ at: new Date().toISOString(), node: g.nodes.find((n) => n.type === "trigger")?.id ?? "trigger", msg: opts.test ? "Test run started" : `Enrolled (${TRIGGERS[a.trigger_type]?.label ?? a.trigger_type})`, ok: true }],
  }).select().single();
  if (run && first) await processRun(run.id);
  return run;
}

function nextOf(g: Graph, nodeId: string, handle?: string) {
  const edges = g.edges.filter((e) => e.source === nodeId);
  const e = handle ? edges.find((x) => x.sourceHandle === handle) : edges.find((x) => !x.sourceHandle || x.sourceHandle === "out") ?? edges[0];
  return e?.target ?? null;
}
const unitMs: Record<string, number> = { minutes: 6e4, hours: 36e5, days: 864e5 };

export async function processRun(runId: string) {
  const sb = db();
  const { data: run } = await sb.from("automation_runs").select("*, automation:automations(*)").eq("id", runId).single();
  if (!run || !["running", "waiting"].includes(run.status)) return;
  const g = run.automation.graph as Graph;
  const log: any[] = Array.isArray(run.log) ? run.log : [];
  let nodeId: string | null = run.current_node;
  const push = (node: string, msg: string, ok = true) => log.push({ at: new Date().toISOString(), node, msg, ok });
  // Safety net in case the inbound webhook did not call stopOnReply().
  if (run.status === "waiting" && run.automation.trigger_config?.stop_on_reply !== false && run.contact_id) {
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("contact_id", run.contact_id).eq("direction", "in").gte("created_at", run.created_at);
    if (count) {
      push(nodeId ?? "trigger", "Stopped: contact replied");
      await sb.from("automation_runs").update({ status: "stopped", error: "Contact replied", log, updated_at: new Date().toISOString() }).eq("id", runId);
      return;
    }
  }
  // Extra template vars from the trigger payload (e.g. {{vehicle}}, {{due_date}} for smog_due).
  const extra: Record<string, unknown> = { ...((run.context?.payload?.vars as Record<string, unknown>) ?? {}) };
  const fill = (t: string) => String(t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k: string) => (k in extra && extra[k] != null ? String(extra[k]) : m));
  for (let step = 0; step < 30 && nodeId; step++) {
    const node = g.nodes.find((n) => n.id === nodeId);
    if (!node) { nodeId = null; break; }
    const d = node.data ?? {};
    try {
      switch (node.type) {
        case "sms": await sendSmsToContact(run.contact_id, fill(d.body ?? ""), { runId }); push(node.id, "SMS sent"); nodeId = nextOf(g, node.id); break;
        case "email": await sendEmailToContact(run.contact_id, fill(d.subject ?? ""), fill(d.body ?? ""), { runId }); push(node.id, "Email sent"); nodeId = nextOf(g, node.id); break;
        case "ai_sms":
        case "ai_email": {
          const { vars, contact } = await contactVars(run.contact_id);
          const isSms = node.type === "ai_sms";
          const out = await chat([
            { role: "system", content: `${BUSINESS_CONTEXT}\nWrite a single ${isSms ? "SMS under 300 characters, no emojis unless natural" : "short email. Reply as JSON {\"subject\":\"...\",\"body\":\"...\"}"}. Sign as ${vars.rep_name}.` },
            { role: "user", content: `Goal: ${renderTemplate(fill(d.prompt || "Follow up and invite them to book a smog check"), vars)}\nContact: ${JSON.stringify({ name: vars.name, source: contact.source, status: contact.status, notes: contact.notes })}` },
          ], { tier: "fast", json: !isSms });
          if (isSms) await sendSmsToContact(run.contact_id, out, { runId });
          else { const j = JSON.parse(out); await sendEmailToContact(run.contact_id, j.subject, j.body, { runId }); }
          push(node.id, `AI ${isSms ? "SMS" : "email"} sent`); nodeId = nextOf(g, node.id); break;
        }
        case "wait": {
          const next = nextOf(g, node.id);
          const ms = Number(d.amount ?? 1) * (unitMs[d.unit ?? "hours"] ?? 36e5);
          push(node.id, `Waiting ${d.amount ?? 1} ${d.unit ?? "hours"}`);
          await sb.from("automation_runs").update({ status: next ? "waiting" : "completed", current_node: next, next_run_at: new Date(Date.now() + ms).toISOString(), log, error: null, updated_at: new Date().toISOString() }).eq("id", runId);
          return;
        }
        case "condition": {
          const ok = await evalCondition(run, d);
          push(node.id, `Condition "${d.check}" → ${ok ? "yes" : "no"}`);
          nodeId = nextOf(g, node.id, ok ? "yes" : "no"); break;
        }
        case "assign": {
          const { pickRep } = await import("./routing");
          const rep = d.rep_id || (await pickRep(d.landing_page_id ?? null));
          if (rep) await sb.from("contacts").update({ owner_id: rep }).eq("id", run.contact_id);
          push(node.id, rep ? "Assigned rep" : "No rep available"); nodeId = nextOf(g, node.id); break;
        }
        case "update": {
          const patch: Record<string, any> = {};
          if (d.status) patch.status = d.status;
          if (d.add_tag) {
            const { data: c } = await sb.from("contacts").select("tags").eq("id", run.contact_id).single();
            patch.tags = Array.from(new Set([...(c?.tags ?? []), d.add_tag]));
          }
          if (Object.keys(patch).length) await sb.from("contacts").update(patch).eq("id", run.contact_id);
          push(node.id, `Updated contact ${JSON.stringify(patch)}`); nodeId = nextOf(g, node.id); break;
        }
        case "task": {
          const { data: c } = await sb.from("contacts").select("owner_id").eq("id", run.contact_id).single();
          const { vars } = await contactVars(run.contact_id);
          await sb.from("tasks").insert({ title: renderTemplate(fill(d.title || "Follow up"), vars), contact_id: run.contact_id, assignee_id: c?.owner_id ?? null, due_at: new Date(Date.now() + Number(d.due_hours ?? 24) * 36e5).toISOString() });
          push(node.id, "Task created"); nodeId = nextOf(g, node.id); break;
        }
        case "notify": {
          const { vars } = await contactVars(run.contact_id);
          await logActivity({ type: "system", contact_id: run.contact_id, subject: `Automation alert: ${run.automation.name}`, body: renderTemplate(fill(d.message || "Automation notification"), vars) });
          push(node.id, "Team notified"); nodeId = nextOf(g, node.id); break;
        }
        case "webhook": {
          if (!d.url) throw new Error("Webhook URL is empty");
          const { contact } = await contactVars(run.contact_id);
          const r = await fetch(d.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact, run_id: runId }) });
          push(node.id, `Webhook ${r.status}`, r.ok); nodeId = nextOf(g, node.id); break;
        }
        case "end": push(node.id, "Sequence ended"); nodeId = null; break;
        default: nodeId = nextOf(g, node.id);
      }
    } catch (e) {
      push(node.id, (e as Error).message, false);
      if (d.continue_on_error) { nodeId = nextOf(g, node.id); continue; }
      await sb.from("automation_runs").update({ status: "failed", error: (e as Error).message, log, current_node: node.id, updated_at: new Date().toISOString() }).eq("id", runId);
      return;
    }
  }
  if (nodeId) {
    // Step cap reached (likely a loop): park the run and let the next tick continue it.
    push(nodeId, "Step limit reached, continuing on next tick");
    await sb.from("automation_runs").update({ status: "running", current_node: nodeId, next_run_at: new Date(Date.now() + 6e4).toISOString(), log, updated_at: new Date().toISOString() }).eq("id", runId);
    return;
  }
  await sb.from("automation_runs").update({ status: "completed", current_node: null, log, error: null, updated_at: new Date().toISOString() }).eq("id", runId);
}

async function evalCondition(run: any, d: Record<string, any>) {
  const sb = db();
  const since = run.created_at;
  switch (d.check) {
    case "replied": {
      const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("contact_id", run.contact_id).eq("direction", "in").gte("created_at", since);
      return (count ?? 0) > 0;
    }
    case "booked": {
      const { count } = await sb.from("events").select("id", { count: "exact", head: true }).eq("contact_id", run.contact_id).gte("created_at", since).neq("status", "cancelled");
      return (count ?? 0) > 0;
    }
    case "has_tag": { const { data } = await sb.from("contacts").select("tags").eq("id", run.contact_id).single(); return (data?.tags ?? []).includes(d.value); }
    case "status_is": { const { data } = await sb.from("contacts").select("status").eq("id", run.contact_id).single(); return data?.status === d.value; }
    case "has_email": { const { data } = await sb.from("contacts").select("email").eq("id", run.contact_id).single(); return !!data?.email; }
    case "has_phone": { const { data } = await sb.from("contacts").select("phone").eq("id", run.contact_id).single(); return !!data?.phone; }
    case "email_opened": {
      const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("contact_id", run.contact_id).eq("channel", "email").in("status", ["opened", "clicked"]).gte("created_at", since);
      return (count ?? 0) > 0;
    }
    default: return false;
  }
}

/** Called by cron: process due waiting runs. */
export async function processDue(limit = 50) {
  const { data } = await db().from("automation_runs").select("id").in("status", ["waiting", "running"]).lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(limit);
  for (const r of data ?? []) await processRun(r.id);
  return data?.length ?? 0;
}

/** Stop runs whose automation says stop_on_reply when a contact replies. */
export async function stopOnReply(contactId: string) {
  const { data } = await db().from("automation_runs").select("id, automation:automations(trigger_config)").eq("contact_id", contactId).in("status", ["running", "waiting"]);
  for (const r of (data ?? []) as any[]) {
    if (r.automation?.trigger_config?.stop_on_reply !== false) await db().from("automation_runs").update({ status: "stopped", error: "Contact replied", updated_at: new Date().toISOString() }).eq("id", r.id);
  }
}

/* ---------------- validation ---------------- */

/** Returns human-readable problems; empty array means the graph can be activated. */
export function validateGraph(g: Graph): string[] {
  const errs: string[] = [];
  const nodes = g?.nodes ?? [], edges = g?.edges ?? [];
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) errs.push("Add a trigger node");
  if (triggers.length > 1) errs.push("Only one trigger node is allowed");
  if (nodes.filter((n) => n.type !== "trigger").length === 0) errs.push("Add at least one step after the trigger");
  if (triggers.length === 1) {
    const seen = new Set<string>([triggers[0]!.id]);
    const queue = [triggers[0]!.id];
    while (queue.length) {
      const id = queue.shift()!;
      for (const e of edges) if (e.source === id && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target); }
    }
    const orphans = nodes.filter((n) => n.type !== "end" && !seen.has(n.id));
    if (orphans.length) errs.push(`Not connected to the trigger: ${orphans.map((n) => n.data?.label || n.type).join(", ")}`);
  }
  for (const n of nodes) {
    const d = n.data ?? {}, name = d.label || n.type;
    if (n.type === "sms" && !String(d.body ?? "").trim()) errs.push(`${name}: message is empty`);
    if (n.type === "email" && (!String(d.subject ?? "").trim() || !String(d.body ?? "").trim())) errs.push(`${name}: subject and body are required`);
    if (n.type === "webhook" && !/^https?:\/\//.test(String(d.url ?? ""))) errs.push(`${name}: webhook URL must start with http(s)://`);
    if (n.type === "condition" && !d.check) errs.push(`${name}: pick a condition`);
  }
  return errs;
}

/* ---------------- templates ---------------- */

type Step = { type: string; data: Record<string, any>; yesEnd?: string };
let _seq = 0;
const nid = (t: string) => `${t}_${(++_seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Build a left-to-right graph. A condition with `yesEnd` routes "yes" to an End node and continues the chain on "no". */
export function buildChain(triggerType: string, steps: Step[]): Graph {
  const nodes: FlowNode[] = [], edges: FlowEdge[] = [];
  const trig: FlowNode = { id: nid("trigger"), type: "trigger", position: { x: 0, y: 0 }, data: { trigger_type: triggerType } };
  nodes.push(trig);
  let prev = trig.id, prevHandle: string | null = null, x = 0;
  const link = (source: string, target: string, sourceHandle: string | null) =>
    edges.push({ id: `e_${source}_${sourceHandle ?? "out"}_${target}`, source, target, sourceHandle });
  for (const s of [...steps, { type: "end", data: { label: "End" } }]) {
    x += 300;
    const n: FlowNode = { id: nid(s.type), type: s.type, position: { x, y: 0 }, data: s.data };
    nodes.push(n);
    link(prev, n.id, prevHandle);
    prev = n.id; prevHandle = null;
    if (s.type === "condition") {
      const end: FlowNode = { id: nid("end"), type: "end", position: { x: x + 300, y: -170 }, data: { label: s.yesEnd ?? "End" } };
      nodes.push(end);
      link(n.id, end.id, "yes");
      prevHandle = "no";
    }
  }
  return { nodes, edges };
}

export function blankGraph(triggerType = "lead_created"): Graph {
  return { nodes: [{ id: nid("trigger"), type: "trigger", position: { x: 0, y: 0 }, data: { trigger_type: triggerType } }], edges: [] };
}

export type AutomationTemplate = { id: string; name: string; description: string; trigger_type: string; trigger_config: Record<string, any>; build: () => Graph };

export const TEMPLATES: AutomationTemplate[] = [
  {
    id: "speed_to_lead", name: "New lead speed-to-lead",
    description: "Instant text, email if no reply after 5 minutes, AI follow-up next day if not booked, final nudge and a call task for the rep.",
    trigger_type: "lead_created", trigger_config: { stop_on_reply: true, allow_reentry: false },
    build: () => buildChain("lead_created", [
      { type: "sms", data: { label: "Instant SMS", body: "Hi {{first_name}}, this is {{rep_name}} at Newport Smog. Thanks for reaching out! We can usually get you in today, no appointment needed. Book a time here: {{booking_link}} or call {{business_phone}}." } },
      { type: "wait", data: { label: "Wait 5 min", amount: 5, unit: "minutes" } },
      { type: "condition", data: { label: "Replied?", check: "replied" }, yesEnd: "Replied, rep takes over" },
      { type: "email", data: { label: "Intro email", subject: "Your smog check at Newport Smog", body: "Hi {{first_name}},\n\nThanks for your interest in Newport Smog & Auto Registration. We're a STAR certified test-only station, so we just test (no repair upsell), and most checks take about 15 minutes.\n\nPassenger cars are $73 + $8.25 certificate. Grab a time that works for you: {{booking_link}}\n\nWe're at {{address}}. Questions? Call or text {{business_phone}}.\n\n{{rep_name}}\nNewport Smog" } },
      { type: "wait", data: { label: "Wait 1 day", amount: 1, unit: "days" } },
      { type: "condition", data: { label: "Booked?", check: "booked" }, yesEnd: "Booked" },
      { type: "ai_sms", data: { label: "AI follow-up SMS", prompt: "Friendly second follow-up for {{first_name}} who asked about a smog check yesterday but has not booked. Mention we take walk-ins and include the booking link {{booking_link}}." } },
      { type: "wait", data: { label: "Wait 2 days", amount: 2, unit: "days" } },
      { type: "sms", data: { label: "Final SMS", body: "Hi {{first_name}}, last check-in from {{rep_name}} at Newport Smog. If you still need a smog, walk in anytime at {{address}} or book here: {{booking_link}}. Reply STOP to opt out." } },
      { type: "task", data: { label: "Call task for rep", title: "Call {{first_name}}: new lead has not booked", due_hours: 4 } },
    ]),
  },
  {
    id: "smog_due", name: "Smog due reminder",
    description: "Text 30 days before a vehicle's smog is due, email two weeks later, and a last text before the deadline.",
    trigger_type: "smog_due", trigger_config: { days_before: 30, stop_on_reply: true, allow_reentry: false },
    build: () => buildChain("smog_due", [
      { type: "sms", data: { label: "30-day reminder", body: "Hi {{first_name}}, friendly reminder from Newport Smog: your {{vehicle}} smog check is due by {{due_date}}. Walk in anytime or book here: {{booking_link}}." } },
      { type: "wait", data: { label: "Wait 14 days", amount: 14, unit: "days" } },
      { type: "email", data: { label: "Reminder email", subject: "Your smog check is due soon", body: "Hi {{first_name}},\n\nJust a reminder that your {{vehicle}} is due for its smog check by {{due_date}}. Avoid DMV late fees and get it done in about 15 minutes at {{address}}.\n\nBook online: {{booking_link}}\nOr call {{business_phone}}.\n\nNewport Smog & Auto Registration" } },
      { type: "wait", data: { label: "Wait 10 days", amount: 10, unit: "days" } },
      { type: "sms", data: { label: "Last reminder", body: "Hi {{first_name}}, your smog is due {{due_date}}. We're open Mon-Fri 8-6, Sat 8-4 at {{address}}. Book: {{booking_link}} or call {{business_phone}}." } },
    ]),
  },
  {
    id: "review_request", name: "Review request after smog",
    description: "Two hours after a completed job, ask for a Google or Yelp review with the shop's $5 / $10 discount offer, then email if no reply.",
    trigger_type: "job_completed", trigger_config: { stop_on_reply: false, allow_reentry: true },
    build: () => buildChain("job_completed", [
      { type: "wait", data: { label: "Wait 2 hours", amount: 2, unit: "hours" } },
      { type: "sms", data: { label: "Review request SMS", body: "Hi {{first_name}}, thanks for visiting Newport Smog today! If you have a minute, a quick review helps our small shop a lot. Leave us a Google review and get $5 off your next visit, or a Yelp review for $10 off. Just show it at the counter. Thank you! - {{rep_name}}" } },
      { type: "wait", data: { label: "Wait 2 days", amount: 2, unit: "days" } },
      { type: "condition", data: { label: "Replied?", check: "replied" }, yesEnd: "Replied" },
      { type: "email", data: { label: "Review email", subject: "How did we do, {{first_name}}?", body: "Hi {{first_name}},\n\nThanks again for choosing Newport Smog & Auto Registration. We'd love to hear how it went.\n\nAs a thank you, show us your review at your next visit:\n- Google review: $5 off\n- Yelp review: $10 off\n\nJust search \"Newport Smog Costa Mesa\" on Google or Yelp.\n\nSee you next time,\n{{rep_name}}\n{{business_phone}}" } },
    ]),
  },
  {
    id: "partner_nurture", name: "Partner prospect nurture",
    description: "When a lead is tagged partner: fleet/partner pricing email, call task after 3 days, AI-written follow-up email after 4 more.",
    trigger_type: "tag_added", trigger_config: { tag: "partner", stop_on_reply: true, allow_reentry: false },
    build: () => buildChain("tag_added", [
      { type: "email", data: { label: "Partner pricing email", subject: "Partner pricing for {{company}}", body: "Hi {{first_name}},\n\nThanks for your interest in working with Newport Smog. We help dealers, rental fleets and repair/exotic shops in Orange County keep vehicles compliant with:\n\n- Partner pricing well below retail\n- One month-end invoice instead of per-car payments\n- Fast turnaround, test-only (no repair upsell)\n- DMV registration help\n\nCould we set up a quick call this week? Pick a time here: {{booking_link}} or call me at {{business_phone}}.\n\n{{rep_name}}\nNewport Smog & Auto Registration\n{{address}}" } },
      { type: "wait", data: { label: "Wait 3 days", amount: 3, unit: "days" } },
      { type: "task", data: { label: "Call task", title: "Call {{first_name}} ({{company}}) about partner pricing", due_hours: 24 } },
      { type: "wait", data: { label: "Wait 4 days", amount: 4, unit: "days" } },
      { type: "ai_email", data: { label: "AI follow-up email", prompt: "Follow up with {{first_name}} at {{company}} about becoming a partner account (dealer/fleet pricing, month-end billing). Keep it short, reference the earlier email, and suggest a 10 minute call via {{booking_link}}." } },
    ]),
  },
  {
    id: "missed_appointment", name: "Missed appointment",
    description: "When an appointment is cancelled, text a rebooking link right away and email the next day if they have not rebooked.",
    trigger_type: "appointment_cancelled", trigger_config: { stop_on_reply: true, allow_reentry: true },
    build: () => buildChain("appointment_cancelled", [
      { type: "sms", data: { label: "Rebook SMS", body: "Hi {{first_name}}, sorry we missed you at Newport Smog! Want to pick a new time? Rebook here: {{booking_link}} or just walk in at {{address}}. - {{rep_name}}" } },
      { type: "wait", data: { label: "Wait 1 day", amount: 1, unit: "days" } },
      { type: "condition", data: { label: "Rebooked?", check: "booked" }, yesEnd: "Rebooked" },
      { type: "email", data: { label: "Rebook email", subject: "Let's get your smog check rescheduled", body: "Hi {{first_name}},\n\nWe noticed your appointment was cancelled. No problem, it only takes a couple of clicks to pick a new time: {{booking_link}}\n\nWalk-ins are welcome too, Mon-Fri 8-6 and Sat 8-4 at {{address}}.\n\nQuestions? Call or text {{business_phone}}.\n\n{{rep_name}}\nNewport Smog" } },
    ]),
  },
];

/* ---------------- daily smog_due scan ---------------- */

/** Enroll contacts whose vehicle smog is due within each active smog_due automation's window. */
export async function fireSmogDue() {
  const sb = db();
  const { data: autos } = await sb.from("automations").select("id, trigger_config").eq("status", "active").eq("trigger_type", "smog_due");
  let enrolled = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const a of autos ?? []) {
    const days = Number(a.trigger_config?.days_before ?? 30) || 30;
    const until = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    const { data: vehicles } = await sb.from("vehicles").select("id, contact_id, year, make, model, next_due_at")
      .not("contact_id", "is", null).gte("next_due_at", today).lte("next_due_at", until).limit(500);
    for (const v of vehicles ?? []) {
      const { count } = await sb.from("automation_runs").select("id", { count: "exact", head: true })
        .eq("automation_id", a.id).eq("contact_id", v.contact_id!).eq("context->payload->>vehicle_id", v.id).eq("context->payload->>due", v.next_due_at!);
      if (count) continue;
      const vehicle = [v.year, v.make, v.model].filter(Boolean).join(" ") || "vehicle";
      const due = new Date(`${v.next_due_at}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      try {
        const run = await enroll(a.id, v.contact_id!, { vehicle_id: v.id, due: v.next_due_at, vars: { vehicle, due_date: due } });
        if (run) enrolled++;
      } catch (e) { console.error("fireSmogDue", e); }
    }
  }
  return enrolled;
}
