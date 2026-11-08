import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/supabase/admin";
import { syncMercury, markOverdue } from "@/server/services/billing";

export const maxDuration = 60;

/** Optional HMAC check: set MERCURY_WEBHOOK_SECRET to the webhook's signing secret. Header: `Mercury-Signature: t=<ts>,v1=<hex>`. */
function verify(raw: string, headers: Headers) {
  const secret = process.env.MERCURY_WEBHOOK_SECRET;
  if (!secret) return true;
  const h = headers.get("mercury-signature") ?? "";
  const parts = Object.fromEntries(h.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); } catch { return false; }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let body: any;
  try { body = JSON.parse(raw); } catch { body = { raw }; }
  const type = String(body?.type ?? body?.eventType ?? [body?.resourceType, body?.operationType].filter(Boolean).join(".") ?? "unknown") || "unknown";
  const sb = db();
  const { data: log } = await sb.from("webhook_events").insert({ provider: "mercury", event_type: type, payload: body }).select("id").single();
  try {
    if (/transaction|invoice|payment/i.test(type) || /transaction/i.test(String(body?.resourceType ?? ""))) {
      const r = await syncMercury(7);
      await markOverdue();
      if (log) await sb.from("webhook_events").update({ processed: true, error: null, payload: { ...body, _sync: r } }).eq("id", log.id);
    } else if (log) await sb.from("webhook_events").update({ processed: true }).eq("id", log.id);
  } catch (e) {
    if (log) await sb.from("webhook_events").update({ error: (e as Error).message }).eq("id", log.id);
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, provider: "mercury" });
}
