import type { LucideIcon } from "lucide-react";
import { Zap, MessageSquare, Mail, Sparkles, Clock, GitBranch, UserPlus, UserPen, ListTodo, Bell, Webhook, OctagonX } from "lucide-react";

export type NodeGroup = "Triggers" | "Messaging" | "AI" | "Flow" | "CRM actions";
export type NodeData = Record<string, any>;

export type NodeMeta = {
  label: string; icon: LucideIcon; color: string; group: NodeGroup; description: string;
  defaults: () => NodeData;
};

export const NODE_META: Record<string, NodeMeta> = {
  trigger: { label: "Trigger", icon: Zap, color: "#f97316", group: "Triggers", description: "Starts the sequence", defaults: () => ({ trigger_type: "lead_created" }) },
  sms: { label: "Send SMS", icon: MessageSquare, color: "#16a34a", group: "Messaging", description: "Text the contact from the shop number", defaults: () => ({ body: "Hi {{first_name}}, this is {{rep_name}} at Newport Smog. " }) },
  email: { label: "Send email", icon: Mail, color: "#2563eb", group: "Messaging", description: "Email the contact", defaults: () => ({ subject: "", body: "Hi {{first_name}},\n\n\n\n{{rep_name}}\nNewport Smog" }) },
  ai_sms: { label: "AI SMS", icon: Sparkles, color: "#9333ea", group: "AI", description: "AI writes a personalised text from your goal", defaults: () => ({ prompt: "Follow up with {{first_name}} and invite them to book a smog check at {{booking_link}}" }) },
  ai_email: { label: "AI email", icon: Sparkles, color: "#9333ea", group: "AI", description: "AI writes a personalised email from your goal", defaults: () => ({ prompt: "Follow up with {{first_name}} and invite them to book a smog check at {{booking_link}}" }) },
  wait: { label: "Wait", icon: Clock, color: "#6b7280", group: "Flow", description: "Pause before the next step", defaults: () => ({ amount: 1, unit: "days" }) },
  condition: { label: "If / else", icon: GitBranch, color: "#ca8a04", group: "Flow", description: "Branch on replies, bookings, tags, status", defaults: () => ({ check: "replied" }) },
  end: { label: "End", icon: OctagonX, color: "#ef4444", group: "Flow", description: "Stop the sequence here", defaults: () => ({}) },
  assign: { label: "Assign rep", icon: UserPlus, color: "#0891b2", group: "CRM actions", description: "Set the contact owner", defaults: () => ({ rep_id: null }) },
  update: { label: "Update contact", icon: UserPen, color: "#0d9488", group: "CRM actions", description: "Change status or add a tag", defaults: () => ({ status: "", add_tag: "" }) },
  task: { label: "Create task", icon: ListTodo, color: "#db2777", group: "CRM actions", description: "Create a task for the contact owner", defaults: () => ({ title: "Call {{first_name}}", due_hours: 24 }) },
  notify: { label: "Notify team", icon: Bell, color: "#d97706", group: "CRM actions", description: "Post an alert on the contact timeline", defaults: () => ({ message: "{{first_name}} reached this step" }) },
  webhook: { label: "Webhook", icon: Webhook, color: "#4f46e5", group: "CRM actions", description: "POST the contact to a URL (Zapier, Make, n8n)", defaults: () => ({ url: "" }) },
};

export const GROUPS: NodeGroup[] = ["Triggers", "Messaging", "AI", "Flow", "CRM actions"];

export const CONDITIONS: { id: string; label: string; needsValue?: "tag" | "status" }[] = [
  { id: "replied", label: "Contact replied" },
  { id: "booked", label: "Appointment booked" },
  { id: "email_opened", label: "Email opened" },
  { id: "has_tag", label: "Has tag", needsValue: "tag" },
  { id: "status_is", label: "Status is", needsValue: "status" },
  { id: "has_email", label: "Has email address" },
  { id: "has_phone", label: "Has phone number" },
];
export const CONTACT_STATUSES = ["lead", "contacted", "booked", "customer", "lost"];
export const DEAL_STAGES = ["lead", "qualified", "proposal", "contract_sent", "won", "lost"];

export const VARIABLES = [
  { key: "first_name", sample: "Maria" },
  { key: "last_name", sample: "Lopez" },
  { key: "rep_name", sample: "Andrew Le" },
  { key: "business_phone", sample: "(714) 436-1700" },
  { key: "booking_link", sample: "https://crm.newportsmog.com/book" },
  { key: "address", sample: "375 Bristol St Unit 80, Costa Mesa" },
  { key: "company", sample: "OC Motors" },
  { key: "vehicle", sample: "2018 Honda Civic" },
  { key: "due_date", sample: "Dec 12, 2026" },
];
export const sampleVars = Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));

export function metaFor(type: string): NodeMeta {
  return NODE_META[type] ?? { label: type, icon: Zap, color: "#6b7280", group: "Flow", description: "", defaults: () => ({}) };
}

const clip = (s: string, n = 60) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const plural = (n: number, u: string) => `${n} ${n === 1 ? u.replace(/s$/, "") : u}`;

/** One-line summary shown under the node title. */
export function summarize(type: string, d: NodeData, triggerLabels: Record<string, string> = {}): string {
  switch (type) {
    case "trigger": {
      const c = d.config ?? {};
      const base = triggerLabels[d.trigger_type] ?? d.trigger_type ?? "Pick a trigger";
      if (d.trigger_type === "tag_added" && c.tag) return `${base}: "${c.tag}"`;
      if (d.trigger_type === "smog_due") return `Smog due within ${c.days_before ?? 30} days`;
      if (d.trigger_type === "inbound_sms" && c.keyword) return `${base} containing "${c.keyword}"`;
      if (d.trigger_type === "deal_stage_changed" && c.stage) return `Deal moves to ${String(c.stage).replace(/_/g, " ")}`;
      return base;
    }
    case "sms": return d.body ? clip(d.body) : "No message yet";
    case "email": return d.subject ? clip(d.subject) : "No subject yet";
    case "ai_sms": case "ai_email": return d.prompt ? clip(d.prompt) : "No goal yet";
    case "wait": return `Wait ${plural(Number(d.amount ?? 1), d.unit ?? "hours")}`;
    case "condition": {
      const c = CONDITIONS.find((x) => x.id === d.check);
      return c ? `${c.label}${c.needsValue && d.value ? `: ${d.value}` : ""}?` : "Pick a condition";
    }
    case "assign": return d.rep_name ? `Assign to ${d.rep_name}` : "Round-robin to next rep";
    case "update": {
      const parts = [d.status && `Status → ${d.status}`, d.add_tag && `Tag +${d.add_tag}`].filter(Boolean);
      return parts.length ? parts.join(", ") : "Nothing to update";
    }
    case "task": return d.title ? `${clip(d.title, 40)} (due ${d.due_hours ?? 24}h)` : "Untitled task";
    case "notify": return d.message ? clip(d.message) : "Timeline alert";
    case "webhook": return d.url ? clip(d.url.replace(/^https?:\/\//, ""), 40) : "No URL";
    case "end": return "Sequence ends";
    default: return "";
  }
}

/** SMS character / segment counter (GSM-7 vs UCS-2). */
export function smsSegments(text: string) {
  const gsm = /^[\n\r @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/.test(text);
  const len = Array.from(text).length;
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { len, segments, encoding: gsm ? "GSM-7" : "Unicode" };
}

export type GraphLike = { nodes: { id: string; type?: string; data: NodeData }[]; edges: { source: string; target: string; sourceHandle?: string | null }[] };

/** Client-side mirror of the server validation (exactly one trigger, every non-end node reachable). */
export function validate(g: GraphLike): string[] {
  const errs: string[] = [];
  const triggers = g.nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) errs.push("Add a trigger node");
  if (triggers.length > 1) errs.push("Only one trigger node is allowed");
  if (!g.nodes.some((n) => n.type !== "trigger")) errs.push("Add at least one step after the trigger");
  if (triggers.length === 1) {
    const seen = new Set([triggers[0]!.id]); const q = [triggers[0]!.id];
    while (q.length) { const id = q.shift()!; for (const e of g.edges) if (e.source === id && !seen.has(e.target)) { seen.add(e.target); q.push(e.target); } }
    const orphans = g.nodes.filter((n) => n.type !== "end" && !seen.has(n.id));
    if (orphans.length) errs.push(`Not connected to the trigger: ${orphans.map((n) => n.data?.label || metaFor(n.type ?? "").label).join(", ")}`);
  }
  for (const n of g.nodes) {
    const name = n.data?.label || metaFor(n.type ?? "").label;
    for (const p of nodeIssues(n.type ?? "", n.data ?? {})) errs.push(`${name}: ${p}`);
  }
  return errs;
}

/** Field-level problems for a single node. */
export function nodeIssues(type: string, d: NodeData): string[] {
  const out: string[] = [];
  if (type === "sms" && !String(d.body ?? "").trim()) out.push("message is empty");
  if (type === "email" && (!String(d.subject ?? "").trim() || !String(d.body ?? "").trim())) out.push("subject and body are required");
  if (type === "webhook" && !/^https?:\/\//.test(String(d.url ?? ""))) out.push("webhook URL must start with http(s)://");
  if (type === "condition" && !d.check) out.push("pick a condition");
  if (type === "condition" && (d.check === "has_tag" || d.check === "status_is") && !d.value) out.push("enter a value to compare");
  return out;
}
