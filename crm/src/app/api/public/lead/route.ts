import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase/admin";
import { createLead } from "@/server/services/leads";
import { json, preflight, readBody, rateLimited, clientIp, UUID_RE, s, CORS_HEADERS } from "@/components/landing/public-api";

export const dynamic = "force-dynamic";

export function OPTIONS() { return preflight(); }

function parseVehicle(d: Record<string, any>) {
  let year = Number(s(d.vehicle_year)) || undefined;
  let make = s(d.vehicle_make, 60) || undefined;
  let model = s(d.vehicle_model, 80) || undefined;
  const free = s(d.vehicle, 120);
  if (free && !make && !model) {
    const m = free.match(/^\s*((?:19|20)\d{2})?\s*([^\s]+)?\s*(.*)$/);
    if (m) { year = year ?? (m[1] ? Number(m[1]) : undefined); make = m[2] || undefined; model = m[3]?.trim() || undefined; }
  }
  if (year && (year < 1900 || year > new Date().getFullYear() + 2)) year = undefined;
  return make || model ? { year, make, model } : null;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (rateLimited(`lead:${ip}`, 8, 10 * 60_000)) return json({ ok: false, error: "Too many submissions. Please call us at (714) 436-1700." }, 429);

  let body: Awaited<ReturnType<typeof readBody>>;
  try { body = await readBody(req); } catch { return json({ ok: false, error: "Invalid request body" }, 400); }
  const { data: d, isForm } = body;
  const wantsRedirect = isForm && !(req.headers.get("accept") ?? "").includes("application/json");

  const finish = (payload: { ok: boolean; contact_id?: string | null; message?: string | null; redirect_url?: string | null; error?: string }, status = 200) => {
    if (wantsRedirect && payload.ok) {
      const target = s(d._redirect, 1000) || payload.redirect_url || req.headers.get("referer");
      if (target && /^https?:\/\//.test(target)) {
        const u = new URL(target); if (!payload.redirect_url && !d._redirect) u.searchParams.set("ns_submitted", "1");
        return NextResponse.redirect(u.toString(), { status: 303, headers: CORS_HEADERS });
      }
    }
    return json(payload, status);
  };

  // Honeypot / too-fast bots: pretend success, store nothing.
  const elapsed = Number(d.elapsed_ms);
  if (s(d.hp) || s(d.website_url) || (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 1200)) return finish({ ok: true, contact_id: null });

  const phone = s(d.phone, 40), email = s(d.email, 200).toLowerCase();
  if (!phone && !email) return json({ ok: false, error: "Please include a phone number or email." }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "That email address doesn't look right." }, 400);
  if (phone && phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "Please enter a 10-digit phone number." }, 400);

  const sb = db();
  const pageId = UUID_RE.test(s(d.page_id)) ? s(d.page_id) : null;
  let page: { id: string; slug: string; status: string; thank_you_message: string | null; redirect_url: string | null } | null = null;
  if (pageId) page = (await sb.from("landing_pages").select("id, slug, status, thank_you_message, redirect_url").eq("id", pageId).maybeSingle()).data as any;
  let variantId: string | null = null;
  if (page && UUID_RE.test(s(d.variant_id))) {
    const { data: v } = await sb.from("landing_variants").select("id").eq("id", s(d.variant_id)).eq("page_id", page.id).maybeSingle();
    variantId = v?.id ?? null;
  }

  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) if ((/^utm_/.test(k) || k === "gclid" || k === "fbclid") && s(v)) utm[k] = s(v, 200);
  if (s(d.referrer)) utm.referrer = s(d.referrer, 500);
  if (s(d.source_url)) utm.source_url = s(d.source_url, 500);

  const vehicle = parseVehicle(d);
  const message = s(d.message, 4000);
  const vehicleText = s(d.vehicle, 120);
  const notes = [message, vehicleText && !vehicle ? `Vehicle: ${vehicleText}` : ""].filter(Boolean).join("\n") || null;
  const visitorId = s(d.visitor_id, 100) || null;

  try {
    const { contact, created } = await createLead({
      name: s(d.name, 120) || undefined, first_name: s(d.first_name, 60) || undefined, last_name: s(d.last_name, 60) || undefined,
      phone: phone || null, email: email || null, notes, vehicle,
      source: page ? `landing:${page.slug}` : s(d.source, 60) || "website",
      landing_page_id: page?.id ?? null, variant_id: variantId, utm,
    });
    if (page) {
      await sb.from("page_events").insert({ page_id: page.id, variant_id: variantId, visitor_id: visitorId, type: "submit", meta: { contact_id: contact.id, created, ip_hash: hash(ip) } });
    }
    return finish({ ok: true, contact_id: contact.id, message: page?.thank_you_message ?? null, redirect_url: page?.redirect_url ?? null });
  } catch (e) {
    console.error("public lead failed", e);
    return json({ ok: false, error: "We couldn't save your request. Please call (714) 436-1700." }, 500);
  }
}

function hash(v: string) { let h = 0; for (const c of v) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); }
