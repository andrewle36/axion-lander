import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { verifyPandadoc, mapStatus } from "@/lib/integrations/pandadoc";
import { handleContractCompleted } from "@/server/routers/deals";
import { logActivity } from "@/server/services/comms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PdEvent = { event?: string; data?: { id?: string; status?: string; name?: string; metadata?: Record<string, string>; date_completed?: string } };

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = new URL(req.url).searchParams.get("signature");
  if (!verifyPandadoc(raw, signature)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let events: PdEvent[] = [];
  try {
    const body = JSON.parse(raw);
    events = Array.isArray(body) ? body : [body];
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sb = db();
  for (const ev of events) {
    const { data: logged } = await sb.from("webhook_events").insert({ provider: "pandadoc", event_type: ev.event ?? null, payload: ev as any }).select("id").single();
    try {
      await processEvent(ev);
      if (logged) await sb.from("webhook_events").update({ processed: true }).eq("id", logged.id);
    } catch (e) {
      console.error("pandadoc webhook", e);
      if (logged) await sb.from("webhook_events").update({ error: (e as Error).message }).eq("id", logged.id);
    }
  }
  return NextResponse.json({ ok: true });
}

async function findContract(ev: PdEvent) {
  const sb = db();
  const id = ev.data?.id;
  if (id) {
    const { data } = await sb.from("contracts").select("*").eq("pandadoc_id", id).maybeSingle();
    if (data) return data;
  }
  // Fall back to metadata: the contract row may have been created with a different id (e.g. a retry).
  const dealId = ev.data?.metadata?.deal_id;
  if (dealId && id) {
    const { data } = await sb.from("contracts").select("*").eq("deal_id", dealId).is("pandadoc_id", null).order("created_at", { ascending: false }).limit(1);
    if (data?.[0]) { await sb.from("contracts").update({ pandadoc_id: id }).eq("id", data[0].id); return { ...data[0], pandadoc_id: id }; }
  }
  return null;
}

async function processEvent(ev: PdEvent) {
  const sb = db();
  const type = ev.event ?? "";
  const c = await findContract(ev);
  if (!c) return;
  const st = ev.data?.status ? mapStatus(ev.data.status) : null;
  const completed = type === "document.completed" || type === "document_completed" || st === "completed";

  if (completed) {
    await handleContractCompleted(c.id);
    return;
  }
  if (type === "document_state_changed" || st) {
    if (!st || st === c.status || c.status === "completed") return;
    const patch: Record<string, unknown> = { status: st };
    if (st === "viewed" && !c.viewed_at) patch.viewed_at = new Date().toISOString();
    await sb.from("contracts").update(patch).eq("id", c.id);
    if (st === "viewed" || st === "declined") {
      await logActivity({
        type: "contract", direction: "in", company_id: c.company_id, deal_id: c.deal_id,
        subject: st === "viewed" ? "Partner agreement viewed" : "Partner agreement declined", body: c.name, meta: { contract_id: c.id },
      });
    }
  }
}
