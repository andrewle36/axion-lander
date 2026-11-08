import "server-only";
import crypto from "node:crypto";
import { env, requireKey } from "@/lib/env";
import { api } from "./http";
const BASE = "https://api.calendly.com";
const auth = () => ({ Authorization: `Bearer ${requireKey("Calendly", env.calendlyToken, "CALENDLY_TOKEN")}` });

export async function me() {
  const r = await api<{ resource: { uri: string; name: string; scheduling_url: string; current_organization: string } }>("Calendly", `${BASE}/users/me`, { headers: auth() });
  return r.resource;
}
export async function eventTypes() {
  const u = await me();
  const r = await api<{ collection: Array<{ uri: string; name: string; scheduling_url: string; duration: number; active: boolean; color: string }> }>(
    "Calendly", `${BASE}/event_types?user=${encodeURIComponent(u.uri)}&count=50`, { headers: auth() });
  return r.collection;
}
export async function listWebhooks() {
  const u = await me();
  const r = await api<{ collection: Array<{ uri: string; callback_url: string; state: string; events: string[] }> }>(
    "Calendly", `${BASE}/webhook_subscriptions?organization=${encodeURIComponent(u.current_organization)}&user=${encodeURIComponent(u.uri)}&scope=user`, { headers: auth() });
  return r.collection;
}
export async function ensureWebhook() {
  const url = `${env.appUrl}/api/webhooks/calendly`;
  const existing = await listWebhooks();
  const found = existing.find((w) => w.callback_url === url);
  if (found) return found;
  const u = await me();
  const r = await api<{ resource: { uri: string; callback_url: string; state: string; events: string[] } }>("Calendly", `${BASE}/webhook_subscriptions`, {
    method: "POST", headers: auth(),
    json: { url, events: ["invitee.created", "invitee.canceled"], organization: u.current_organization, user: u.uri, scope: "user", ...(env.calendlySigningKey ? { signing_key: env.calendlySigningKey } : {}) },
  });
  return r.resource;
}
export async function scheduledEvents(minStart: string) {
  const u = await me();
  const r = await api<{ collection: Array<{ uri: string; name: string; start_time: string; end_time: string; status: string; location?: { location?: string; join_url?: string } }> }>(
    "Calendly", `${BASE}/scheduled_events?user=${encodeURIComponent(u.uri)}&min_start_time=${encodeURIComponent(minStart)}&count=100&sort=start_time:asc`, { headers: auth() });
  return r.collection;
}
export async function eventInvitees(eventUri: string) {
  const r = await api<{ collection: Array<{ email: string; name: string; text_reminder_number?: string; questions_and_answers?: { question: string; answer: string }[] }> }>(
    "Calendly", `${eventUri}/invitees?count=10`, { headers: auth() });
  return r.collection;
}
export function verifyCalendly(raw: string, header: string | null) {
  if (!env.calendlySigningKey) return true;
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const expected = crypto.createHmac("sha256", env.calendlySigningKey).update(`${parts.t}.${raw}`).digest("hex");
  return expected === parts.v1;
}
