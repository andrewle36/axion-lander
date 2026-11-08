import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { verifyCalendly } from "@/lib/integrations/calendly";
import { upsertCalendlyEvent, type CalendlyEvent, type CalendlyInvitee } from "@/server/routers/calendar";
import { fireTrigger } from "@/server/services/automations";
import { logActivity } from "@/server/services/comms";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCalendly(raw, req.headers.get("calendly-webhook-signature"))) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 }); }

  const sb = db();
  const type: string = body?.event ?? "unknown";
  const { data: log } = await sb.from("webhook_events").insert({ provider: "calendly", event_type: type, payload: body }).select("id").single();

  try {
    const p = body?.payload ?? {};
    const se = p.scheduled_event ?? {};
    const ev: CalendlyEvent = {
      uri: se.uri ?? p.event, name: se.name ?? "Appointment", start_time: se.start_time, end_time: se.end_time, status: se.status, location: se.location ?? null,
    };
    const invitee: CalendlyInvitee = { name: p.name, email: p.email, text_reminder_number: p.text_reminder_number, questions_and_answers: p.questions_and_answers };

    if (type === "invitee.created") {
      if (!ev.uri || !ev.start_time || !ev.end_time) throw new Error("Missing scheduled_event data");
      const r = await upsertCalendlyEvent(ev, [invitee]);
      if (r.event.contact_id && (r.created || r.wasCancelled)) {
        if (!r.created) await sb.from("events").update({ status: "confirmed" }).eq("id", r.event.id);
        await logActivity({ type: "meeting", contact_id: r.event.contact_id, company_id: r.event.company_id, subject: `Calendly booking: ${ev.name}`, body: new Date(ev.start_time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }), meta: { event_id: r.event.id, source: "calendly" } });
        const { data: c } = await sb.from("contacts").select("status").eq("id", r.event.contact_id).single();
        if (c && (c.status === "lead" || c.status === "contacted")) await sb.from("contacts").update({ status: "booked" }).eq("id", r.event.contact_id);
        await fireTrigger("appointment_booked", r.event.contact_id, { event_id: r.event.id, source: "calendly", start_at: ev.start_time });
      }
    } else if (type === "invitee.canceled") {
      const uri = ev.uri;
      const { data: existing } = await sb.from("events").select("*").eq("calendly_uri", uri).maybeSingle();
      let row: any = existing;
      if (!existing && ev.start_time && ev.end_time) row = (await upsertCalendlyEvent(ev, [invitee], { cancelled: true })).event;
      else if (existing) row = (await sb.from("events").update({ status: "cancelled" }).eq("id", existing.id).select().single()).data;
      if (row?.contact_id && existing?.status !== "cancelled") {
        await logActivity({ type: "meeting", contact_id: row.contact_id, company_id: row.company_id, subject: `Calendly cancellation: ${ev.name}`, body: p.cancellation?.reason ?? null, meta: { event_id: row.id, source: "calendly" } });
        await fireTrigger("appointment_cancelled", row.contact_id, { event_id: row.id, source: "calendly", reason: p.cancellation?.reason });
      }
    }
    if (log) await sb.from("webhook_events").update({ processed: true }).eq("id", log.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (log) await sb.from("webhook_events").update({ error: (e as Error).message }).eq("id", log.id);
    console.error("calendly webhook", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
  }
}
