import "server-only";
import { NextResponse, type NextRequest } from "next/server";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}
export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** Loose in-memory fixed-window rate limiter (per server instance). */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return false; }
  b.n++;
  return b.n > max;
}

/** Parse JSON, form-encoded, multipart, or text/plain (sendBeacon) bodies into a flat string map. */
export async function readBody(req: NextRequest): Promise<{ data: Record<string, any>; isForm: boolean }> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const data: Record<string, string> = {};
    fd.forEach((v, k) => { if (typeof v === "string") data[k] = v; });
    return { data, isForm: true };
  }
  const text = await req.text();
  try { const j = JSON.parse(text || "{}"); return { data: j && typeof j === "object" ? j : {}, isForm: false }; }
  catch { return { data: Object.fromEntries(new URLSearchParams(text)), isForm: false }; }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
