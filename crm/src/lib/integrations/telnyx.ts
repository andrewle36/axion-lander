import "server-only";
import crypto from "node:crypto";
import { env, requireKey } from "@/lib/env";
import { api } from "./http";
const BASE = "https://api.telnyx.com/v2";
const auth = () => ({ Authorization: `Bearer ${requireKey("Telnyx", env.telnyxKey, "TELNYX_API_KEY")}` });

export async function sendSms(to: string, text: string, from = env.telnyxNumber) {
  requireKey("Telnyx", from, "TELNYX_PHONE_NUMBER");
  const body: Record<string, unknown> = { from, to, text, webhook_url: `${env.appUrl}/api/webhooks/telnyx` };
  if (env.telnyxMessagingProfile) body.messaging_profile_id = env.telnyxMessagingProfile;
  const r = await api<{ data: { id: string } }>("Telnyx", `${BASE}/messages`, { method: "POST", headers: auth(), json: body });
  return r.data.id;
}

/** Create (once) a telephony credential for a user and return a short-lived WebRTC JWT. */
export async function webrtcToken(existingCredentialId: string | null, name: string) {
  requireKey("Telnyx", env.telnyxCredConnection, "TELNYX_CREDENTIAL_CONNECTION_ID");
  let credId = existingCredentialId;
  if (!credId) {
    const c = await api<{ data: { id: string } }>("Telnyx", `${BASE}/telephony_credentials`, {
      method: "POST", headers: auth(), json: { connection_id: env.telnyxCredConnection, name },
    });
    credId = c.data.id;
  }
  const res = await fetch(`${BASE}/telephony_credentials/${credId}/token`, { method: "POST", headers: auth(), cache: "no-store" });
  if (!res.ok) throw new Error(`Telnyx token ${res.status}: ${await res.text()}`);
  return { credentialId: credId, token: await res.text() };
}

export async function listNumbers() {
  const r = await api<{ data: Array<{ phone_number: string; status: string }> }>("Telnyx", `${BASE}/phone_numbers?page[size]=50`, { headers: auth() });
  return r.data;
}

/** Verify ed25519 webhook signature (skipped when TELNYX_PUBLIC_KEY is not set). */
export function verifyTelnyx(raw: string, sig: string | null, ts: string | null) {
  if (!env.telnyxPublicKey) return true;
  if (!sig || !ts) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(env.telnyxPublicKey, "base64")]), format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(`${ts}|${raw}`), key, Buffer.from(sig, "base64"));
  } catch { return false; }
}
