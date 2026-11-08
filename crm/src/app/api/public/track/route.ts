import type { NextRequest } from "next/server";
import { db } from "@/lib/supabase/admin";
import { json, preflight, readBody, rateLimited, clientIp, UUID_RE, s } from "@/components/landing/public-api";

export const dynamic = "force-dynamic";
const TYPES = new Set(["view", "cta_click", "call_click"]);

export function OPTIONS() { return preflight(); }

export async function POST(req: NextRequest) {
  if (rateLimited(`track:${clientIp(req)}`, 120, 60_000)) return json({ ok: false, error: "rate limited" }, 429);
  let d: Record<string, any>;
  try { d = (await readBody(req)).data; } catch { return json({ ok: false, error: "bad body" }, 400); }
  const type = s(d.type, 20);
  const pageId = s(d.page_id);
  if (!TYPES.has(type) || !UUID_RE.test(pageId)) return json({ ok: false, error: "invalid event" }, 400);
  const sb = db();
  const { data: page } = await sb.from("landing_pages").select("id, status").eq("id", pageId).maybeSingle();
  if (!page || page.status !== "published") return json({ ok: true, skipped: "not published" });

  let variantId: string | null = null;
  if (UUID_RE.test(s(d.variant_id))) {
    const { data: v } = await sb.from("landing_variants").select("id").eq("id", s(d.variant_id)).eq("page_id", pageId).maybeSingle();
    variantId = v?.id ?? null;
  }
  const visitorId = s(d.visitor_id, 100) || null;

  // Dedupe: one view per visitor per page per (UTC) day; clicks deduped within 10s.
  if (visitorId) {
    const since = type === "view" ? new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString() : new Date(Date.now() - 10_000).toISOString();
    const { count } = await sb.from("page_events").select("id", { count: "exact", head: true })
      .eq("page_id", pageId).eq("visitor_id", visitorId).eq("type", type).gte("created_at", since);
    if ((count ?? 0) > 0) return json({ ok: true, deduped: true });
  }

  const meta: Record<string, string> = {};
  if (d.meta && typeof d.meta === "object") for (const [k, v] of Object.entries(d.meta).slice(0, 20)) if (s(v)) meta[k.slice(0, 40)] = s(v, 300);
  const ua = req.headers.get("user-agent"); if (ua) meta.ua = ua.slice(0, 200);
  const { error } = await sb.from("page_events").insert({ page_id: pageId, variant_id: variantId, visitor_id: visitorId, type, meta });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}
