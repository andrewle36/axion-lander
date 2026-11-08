import "server-only";
import crypto from "node:crypto";
import { env, requireKey } from "@/lib/env";
import { api } from "./http";
const BASE = "https://api.pandadoc.com/public/v1";
const auth = () => ({ Authorization: `API-Key ${requireKey("PandaDoc", env.pandadocKey, "PANDADOC_API_KEY")}` });

export async function createAndSend(opts: {
  name: string; templateId?: string; recipient: { email: string; first_name: string; last_name: string; role?: string };
  tokens: Record<string, string>; metadata?: Record<string, string>; message?: string; subject?: string;
}) {
  const template = opts.templateId || requireKey("PandaDoc", env.pandadocTemplate, "PANDADOC_TEMPLATE_ID");
  const doc = await api<{ id: string; status: string }>("PandaDoc", `${BASE}/documents`, {
    method: "POST", headers: auth(),
    json: {
      name: opts.name, template_uuid: template,
      recipients: [{ ...opts.recipient, role: opts.recipient.role ?? "Client" }],
      tokens: Object.entries(opts.tokens).map(([name, value]) => ({ name, value })),
      metadata: opts.metadata ?? {},
    },
  });
  // PandaDoc processes asynchronously: wait for document.draft before sending.
  for (let i = 0; i < 12; i++) {
    const s = await status(doc.id);
    if (s === "document.draft") break;
    if (i === 11) throw new Error("PandaDoc document did not finish processing; try Send again in a minute.");
    await new Promise((r) => setTimeout(r, 1500));
  }
  await send(doc.id, opts.message, opts.subject);
  return doc.id;
}
export async function send(id: string, message?: string, subject?: string) {
  return api("PandaDoc", `${BASE}/documents/${id}/send`, { method: "POST", headers: auth(), json: { message: message ?? "Please review and sign your Newport Smog partner agreement.", subject: subject ?? "Your Newport Smog partner agreement", silent: false } });
}
export async function status(id: string) {
  const r = await api<{ status: string }>("PandaDoc", `${BASE}/documents/${id}`, { headers: auth() });
  return r.status;
}
export async function sessionLink(id: string, email: string) {
  const r = await api<{ id: string }>("PandaDoc", `${BASE}/documents/${id}/session`, { method: "POST", headers: auth(), json: { recipient: email, lifetime: 3600 } });
  return `https://app.pandadoc.com/s/${r.id}`;
}
export async function download(id: string) {
  const res = await fetch(`${BASE}/documents/${id}/download`, { headers: auth(), cache: "no-store" });
  if (!res.ok) throw new Error(`PandaDoc download ${res.status}`);
  return res;
}
export async function templates() {
  const r = await api<{ results: Array<{ id: string; name: string }> }>("PandaDoc", `${BASE}/templates?count=50`, { headers: auth() });
  return r.results;
}
export function verifyPandadoc(raw: string, signature: string | null) {
  if (!env.pandadocWebhookKey) return true;
  if (!signature) return false;
  return crypto.createHmac("sha256", env.pandadocWebhookKey).update(raw).digest("hex") === signature;
}
export const mapStatus = (s: string) => {
  const m: Record<string, string> = {
    "document.sent": "sent", "document.viewed": "viewed", "document.completed": "completed",
    "document.declined": "declined", "document.voided": "voided", "document.draft": "draft",
  };
  return m[s] ?? null;
};
