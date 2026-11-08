import "server-only";
import { db } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/utils";
import { pickRep } from "./routing";
import { logActivity, findContact } from "./comms";
import { fireTrigger } from "./automations";

export async function createLead(input: {
  first_name?: string; last_name?: string; name?: string; email?: string | null; phone?: string | null;
  source?: string; notes?: string | null; landing_page_id?: string | null; variant_id?: string | null;
  utm?: Record<string, string>; vehicle?: { year?: number; make?: string; model?: string } | null; owner_id?: string | null;
  kind?: "driver" | "partner_contact" | "lead"; company_id?: string | null;
}) {
  const sb = db();
  let first = input.first_name ?? "", last = input.last_name ?? "";
  if (!first && input.name) { const [f, ...rest] = input.name.trim().split(/\s+/); first = f ?? ""; last = rest.join(" "); }
  const phone = toE164(input.phone);
  const existing = await findContact({ phone, email: input.email });
  if (existing) {
    await logActivity({ type: "system", contact_id: existing.id, subject: "Submitted again", body: `Re-submitted via ${input.source ?? "form"}`, meta: { utm: input.utm } });
    await fireTrigger("form_submitted", existing.id, { landing_page_id: input.landing_page_id, source: input.source });
    return { contact: existing, created: false };
  }
  const owner = input.owner_id ?? (await pickRep(input.landing_page_id ?? null));
  const { data: contact, error } = await sb.from("contacts").insert({
    first_name: first, last_name: last, email: input.email || null, phone, source: input.source ?? "manual",
    notes: input.notes ?? null, landing_page_id: input.landing_page_id ?? null, variant_id: input.variant_id ?? null,
    utm: input.utm ?? {}, owner_id: owner, kind: input.kind ?? "lead", company_id: input.company_id ?? null, status: "lead",
  }).select().single();
  if (error) throw new Error(error.message);
  if (input.vehicle && (input.vehicle.make || input.vehicle.model)) {
    await sb.from("vehicles").insert({ contact_id: contact.id, year: input.vehicle.year ?? null, make: input.vehicle.make ?? null, model: input.vehicle.model ?? null });
  }
  await logActivity({ type: "system", contact_id: contact.id, subject: "Lead created", body: `Source: ${input.source ?? "manual"}`, meta: { owner_id: owner, utm: input.utm } });
  await fireTrigger("lead_created", contact.id, { landing_page_id: input.landing_page_id, source: input.source });
  if (input.landing_page_id) await fireTrigger("form_submitted", contact.id, { landing_page_id: input.landing_page_id, source: input.source });
  return { contact, created: true };
}
