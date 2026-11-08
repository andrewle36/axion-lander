import "server-only";
import { db } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/integrations/telnyx";
import { sendEmail, textToHtml } from "@/lib/integrations/resend";
import { toE164, renderTemplate, fullName } from "@/lib/utils";
import { env } from "@/lib/env";

export async function logActivity(a: {
  type: string; direction?: "in" | "out" | null; contact_id?: string | null; company_id?: string | null; deal_id?: string | null;
  user_id?: string | null; subject?: string | null; body?: string | null; meta?: Record<string, unknown>;
}) {
  await db().from("activities").insert({ ...a, meta: a.meta ?? {} });
}

export async function contactVars(contactId: string) {
  const { data: c } = await db().from("contacts").select("*, company:companies(name), owner:profiles!contacts_owner_id_fkey(full_name,email,phone)").eq("id", contactId).single();
  if (!c) throw new Error("Contact not found");
  return {
    contact: c,
    vars: {
      first_name: c.first_name || "there", last_name: c.last_name, name: fullName(c), email: c.email, phone: c.phone,
      company: c.company?.name ?? "", rep_name: c.owner?.full_name ?? "the Newport Smog team",
      business_name: "Newport Smog", business_phone: "(714) 436-1700", booking_link: `${env.appUrl}/book`,
      address: "375 Bristol St Unit 80, Costa Mesa",
    },
  };
}

export async function sendSmsToContact(contactId: string, body: string, opts: { userId?: string | null; runId?: string | null } = {}) {
  const { contact, vars } = await contactVars(contactId);
  const to = toE164(contact.phone);
  if (!to) throw new Error("Contact has no phone number");
  if (contact.dnd_sms) throw new Error("Contact opted out of SMS (STOP)");
  const text = renderTemplate(body, vars);
  const { data: msg } = await db().from("messages").insert({
    channel: "sms", direction: "out", contact_id: contactId, company_id: contact.company_id, from_addr: env.telnyxNumber, to_addr: to,
    body: text, status: "queued", user_id: opts.userId ?? null, automation_run_id: opts.runId ?? null,
  }).select().single();
  try {
    const providerId = await sendSms(to, text);
    await db().from("messages").update({ status: "sent", provider_id: providerId }).eq("id", msg!.id);
  } catch (e) {
    await db().from("messages").update({ status: "failed", error: (e as Error).message }).eq("id", msg!.id);
    throw e;
  }
  await db().from("contacts").update({ last_contacted_at: new Date().toISOString(), status: contact.status === "lead" ? "contacted" : contact.status }).eq("id", contactId);
  await logActivity({ type: "sms", direction: "out", contact_id: contactId, company_id: contact.company_id, user_id: opts.userId, body: text, meta: { automation_run_id: opts.runId } });
  return msg!.id as string;
}

export async function sendEmailToContact(contactId: string, subject: string, body: string, opts: { userId?: string | null; runId?: string | null; html?: string } = {}) {
  const { contact, vars } = await contactVars(contactId);
  if (!contact.email) throw new Error("Contact has no email address");
  if (contact.dnd_email) throw new Error("Contact unsubscribed from email");
  const subj = renderTemplate(subject, vars);
  const text = renderTemplate(body, vars);
  const html = opts.html ? renderTemplate(opts.html, vars) : textToHtml(text);
  const { data: msg } = await db().from("messages").insert({
    channel: "email", direction: "out", contact_id: contactId, company_id: contact.company_id, from_addr: env.resendFrom, to_addr: contact.email,
    subject: subj, body: text, html, status: "queued", user_id: opts.userId ?? null, automation_run_id: opts.runId ?? null,
  }).select().single();
  try {
    const providerId = await sendEmail({ to: contact.email, subject: subj, html, text, tags: [{ name: "message_id", value: msg!.id }] });
    await db().from("messages").update({ status: "sent", provider_id: providerId }).eq("id", msg!.id);
  } catch (e) {
    await db().from("messages").update({ status: "failed", error: (e as Error).message }).eq("id", msg!.id);
    throw e;
  }
  await db().from("contacts").update({ last_contacted_at: new Date().toISOString(), status: contact.status === "lead" ? "contacted" : contact.status }).eq("id", contactId);
  await logActivity({ type: "email", direction: "out", contact_id: contactId, company_id: contact.company_id, user_id: opts.userId, subject: subj, body: text });
  return msg!.id as string;
}

/** Find contact by phone or email; used by inbound webhooks. */
export async function findContact({ phone, email }: { phone?: string | null; email?: string | null }) {
  const p = toE164(phone);
  if (p) {
    const digits = p.slice(-10);
    const { data } = await db().from("contacts").select("*").ilike("phone", `%${digits.slice(0, 3)}%${digits.slice(3, 6)}%${digits.slice(6)}`).limit(1);
    if (data?.[0]) return data[0];
  }
  if (email) {
    const { data } = await db().from("contacts").select("*").ilike("email", email.trim()).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}
