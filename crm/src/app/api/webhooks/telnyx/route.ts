import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { verifyTelnyx } from "@/lib/integrations/telnyx";
import { findContact, logActivity } from "@/server/services/comms";
import { createLead } from "@/server/services/leads";
import { fireTrigger, stopOnReply } from "@/server/services/automations";
import { toE164 } from "@/lib/utils";

const STOP = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
const START = /^\s*(start|unstop|yes)\s*$/i;

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyTelnyx(raw, req.headers.get("telnyx-signature-ed25519"), req.headers.get("telnyx-timestamp"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  const body = JSON.parse(raw);
  const type: string = body?.data?.event_type ?? "unknown";
  const p = body?.data?.payload ?? {};
  const sb = db();
  const { data: log } = await sb.from("webhook_events").insert({ provider: "telnyx", event_type: type, payload: body }).select("id").single();
  try {
    if (type === "message.received") {
      const from = toE164(p.from?.phone_number);
      const text: string = p.text ?? "";
      let contact = await findContact({ phone: from });
      if (!contact) contact = (await createLead({ phone: from, first_name: "", last_name: "", source: "sms", notes: `First text: ${text}` })).contact;
      await sb.from("messages").insert({ channel: "sms", direction: "in", contact_id: contact.id, company_id: contact.company_id, from_addr: from, to_addr: p.to?.[0]?.phone_number, body: text, status: "received", provider_id: p.id });
      await logActivity({ type: "sms", direction: "in", contact_id: contact.id, company_id: contact.company_id, body: text });
      if (STOP.test(text)) { await sb.from("contacts").update({ dnd_sms: true }).eq("id", contact.id); await sb.from("automation_runs").update({ status: "stopped", error: "STOP" }).eq("contact_id", contact.id).in("status", ["running", "waiting"]); }
      else if (START.test(text)) await sb.from("contacts").update({ dnd_sms: false }).eq("id", contact.id);
      else { await stopOnReply(contact.id); await fireTrigger("inbound_sms", contact.id, { text }); }
    } else if (type === "message.sent" || type === "message.finalized") {
      const st = p.to?.[0]?.status as string | undefined;
      const status = st === "delivered" ? "delivered" : st?.includes("fail") ? "failed" : "sent";
      await sb.from("messages").update({ status, error: status === "failed" ? JSON.stringify(p.errors ?? st) : null }).eq("provider_id", p.id);
    } else if (type.startsWith("call.")) {
      let callId: string | null = null;
      try { callId = p.client_state ? Buffer.from(p.client_state, "base64").toString() : null; } catch { /* ignore */ }
      if (callId && /^[0-9a-f-]{36}$/.test(callId)) {
        if (type === "call.recording.saved") await sb.from("calls").update({ recording_url: p.recording_urls?.mp3 ?? p.public_recording_urls?.mp3 ?? null }).eq("id", callId);
        if (type === "call.hangup") await sb.from("calls").update({ telnyx_call_id: p.call_control_id ?? p.call_session_id ?? null }).eq("id", callId);
      }
    }
    await sb.from("webhook_events").update({ processed: true }).eq("id", log!.id);
  } catch (e) {
    await sb.from("webhook_events").update({ error: (e as Error).message }).eq("id", log!.id);
  }
  return NextResponse.json({ ok: true });
}
