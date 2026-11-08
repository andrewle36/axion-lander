import { NextResponse } from "next/server";
import { db } from "@/lib/supabase/admin";
import { verifyResend, getReceivedEmail } from "@/lib/integrations/resend";
import { findContact, logActivity } from "@/server/services/comms";
import { createLead } from "@/server/services/leads";
import { stopOnReply } from "@/server/services/automations";

const STATUS: Record<string, string> = {
  "email.sent": "sent", "email.delivered": "delivered", "email.opened": "opened", "email.clicked": "clicked",
  "email.bounced": "failed", "email.complained": "complained", "email.delivery_delayed": "delayed",
};
const RANK = ["queued", "sent", "delayed", "delivered", "opened", "clicked"];
const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyResend(raw, req.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  const body = JSON.parse(raw);
  const type: string = body?.type ?? "unknown";
  const d = body?.data ?? {};
  const sb = db();
  const { data: log } = await sb.from("webhook_events").insert({ provider: "resend", event_type: type, payload: body }).select("id").single();
  try {
    if (STATUS[type] && d.email_id) {
      const { data: m } = await sb.from("messages").select("id, status, contact_id").eq("provider_id", d.email_id).maybeSingle();
      if (m) {
        const next = STATUS[type]!;
        if (next === "failed" || next === "complained" || RANK.indexOf(next) > RANK.indexOf(m.status)) await sb.from("messages").update({ status: next, error: next === "failed" ? d.bounce?.message ?? "bounced" : null }).eq("id", m.id);
        if (next === "complained" && m.contact_id) await sb.from("contacts").update({ dnd_email: true }).eq("id", m.contact_id);
      }
    } else if (type === "email.received") {
      const from = addr(String(d.from ?? ""));
      let text: string = d.text ?? "", html: string = d.html ?? "", subject: string = d.subject ?? "(no subject)";
      if (!text && !html && d.email_id) { try { const full = await getReceivedEmail(d.email_id); text = full.text ?? ""; html = full.html ?? ""; subject = full.subject ?? subject; } catch { /* keep metadata */ } }
      if (!text && html) text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      text = text.split(/\nOn .+wrote:\n/)[0]!.trim();
      let contact = await findContact({ email: from });
      if (!contact) contact = (await createLead({ email: from, name: String(d.from ?? "").replace(/<.*>/, "").trim() || from.split("@")[0], source: "email" })).contact;
      await sb.from("messages").insert({ channel: "email", direction: "in", contact_id: contact.id, company_id: contact.company_id, from_addr: from, to_addr: Array.isArray(d.to) ? d.to.join(", ") : d.to, subject, body: text, html: html || null, status: "received", provider_id: d.email_id });
      await logActivity({ type: "email", direction: "in", contact_id: contact.id, company_id: contact.company_id, subject, body: text.slice(0, 2000) });
      await stopOnReply(contact.id);
    }
    await sb.from("webhook_events").update({ processed: true }).eq("id", log!.id);
  } catch (e) {
    await sb.from("webhook_events").update({ error: (e as Error).message }).eq("id", log!.id);
  }
  return NextResponse.json({ ok: true });
}
