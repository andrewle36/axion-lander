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

export async function enroll(automationId: string, contactId: string, payload: Record<string, any> = {}) {
  const sb = db();
  const { data: a } = await sb.from("automations").select("*").eq("id", automationId).single();
  if (!a) throw new Error("Automation not found");
  if (!a.trigger_config?.allow_reentry) {
    const { count } = await sb.from("automation_runs").select("id", { count: "exact", head: true })
      .eq("automation_id", automationId).eq("contact_id", contactId).in("status", ["running", "waiting"]);
    if (count) return null;
  }
  const g = a.graph as Graph;
  const trig = g.nodes.find((n) => n.type === "trigger");
  const first = trig ? nextOf(g, trig.id) : g.nodes[0]?.id;
  const { data: run } = await sb.from("automation_runs").insert({
    automation_id: automationId, contact_id: contactId, current_node: first ?? null, status: first ? "running" : "completed",
    context: { payload, enrolled_at: new Date().toISOString() }, log: [{ at: new Date().toISOString(), node: "trigger", msg: `Enrolled (${a.trigger_type})` }],
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
  for (let step = 0; step < 30 && nodeId; step++) {
    const node = g.nodes.find((n) => n.id === nodeId);
    if (!node) { nodeId = null; break; }
    const d = node.data ?? {};
    try {
      switch (node.type) {
        case "sms": await sendSmsToContact(run.contact_id, d.body ?? "", { runId }); push(node.id, "SMS sent"); nodeId = nextOf(g, node.id); break;
        case "email": await sendEmailToContact(run.contact_id, d.subject ?? "", d.body ?? "", { runId }); push(node.id, "Email sent"); nodeId = nextOf(g, node.id); break;
        case "ai_sms":
        case "ai_email": {
          const { vars, contact } = await contactVars(run.contact_id);
          const isSms = node.type === "ai_sms";
          const out = await chat([
            { role: "system", content: `${BUSINESS_CONTEXT}\nWrite a single ${isSms ? "SMS under 300 characters, no emojis unless natural" : "short email. Reply as JSON {\"subject\":\"...\",\"body\":\"...\"}"}. Sign as ${vars.rep_name}.` },
            { role: "user", content: `Goal: ${renderTemplate(d.prompt ?? "Follow up and invite them to book a smog check", vars)}\nContact: ${JSON.stringify({ name: vars.name, source: contact.source, status: contact.status, notes: contact.notes })}` },
          ], { tier: "fast", json: !isSms });
          if (isSms) await sendSmsToContact(run.contact_id, out, { runId });
          else { const j = JSON.parse(out); await sendEmailToContact(run.contact_id, j.subject, j.body, { runId }); }
          push(node.id, `AI ${isSms ? "SMS" : "email"} sent`); nodeId = nextOf(g, node.id); break;
        }
        case "wait": {
          const next = nextOf(g, node.id);
          const ms = Number(d.amount ?? 1) * (unitMs[d.unit ?? "hours"] ?? 36e5);
          push(node.id, `Waiting ${d.amount ?? 1} ${d.unit ?? "hours"}`);
          await sb.from("automation_runs").update({ status: next ? "waiting" : "completed", current_node: next, next_run_at: new Date(Date.now() + ms).toISOString(), log }).eq("id", runId);
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
          await sb.from("tasks").insert({ title: d.title ?? "Follow up", contact_id: run.contact_id, assignee_id: c?.owner_id ?? null, due_at: new Date(Date.now() + Number(d.due_hours ?? 24) * 36e5).toISOString() });
          push(node.id, "Task created"); nodeId = nextOf(g, node.id); break;
        }
        case "notify": {
          await logActivity({ type: "system", contact_id: run.contact_id, subject: "Automation alert", body: d.message ?? "Automation notification" });
          push(node.id, "Team notified"); nodeId = nextOf(g, node.id); break;
        }
        case "webhook": {
          const { contact } = await contactVars(run.contact_id);
          const r = await fetch(d.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact, run_id: runId }) });
          push(node.id, `Webhook ${r.status}`, r.ok); nodeId = nextOf(g, node.id); break;
        }
        case "end": nodeId = null; break;
        default: nodeId = nextOf(g, node.id);
      }
    } catch (e) {
      push(node.id, (e as Error).message, false);
      if (d.continue_on_error) { nodeId = nextOf(g, node.id); continue; }
      await sb.from("automation_runs").update({ status: "failed", error: (e as Error).message, log, current_node: node.id }).eq("id", runId);
      return;
    }
  }
  await sb.from("automation_runs").update({ status: "completed", current_node: null, log }).eq("id", runId);
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
    if (r.automation?.trigger_config?.stop_on_reply !== false) await db().from("automation_runs").update({ status: "stopped", error: "Contact replied" }).eq("id", r.id);
  }
}
