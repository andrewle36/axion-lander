"use client";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { EventEditorDialog } from "./event-editor";
import { defaultDraft, type Draft } from "./lib";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Book an appointment, prefilled with a contact and/or company. */
export function BookAppointmentDialog({ open, onClose, contactId, companyId, start, title }: {
  open: boolean; onClose: () => void; contactId?: string | null; companyId?: string | null; start?: Date; title?: string;
}) {
  const contact = trpc.contacts.get.useQuery({ id: contactId ?? "" }, { enabled: open && !!contactId });
  const ready = !contactId || !!contact.data;
  const draft = useMemo<Draft | null>(() => {
    if (!open || !ready) return null;
    const c: any = contact.data;
    const base = defaultDraft(start ?? new Date(), { company_id: companyId ?? c?.company_id ?? null });
    return {
      ...base,
      title: title ?? (c ? `Smog appointment – ${[c.first_name, c.last_name].filter(Boolean).join(" ")}` : "Appointment"),
      contact: c ? { id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, status: c.status, company_id: c.company_id } as any : null,
      contact_id: c?.id ?? null,
      vehicle_id: c?.vehicles?.[0]?.id ?? null,
      location: "Newport Smog, 375 Bristol St Unit 80, Costa Mesa",
    };
  }, [open, ready, contact.data, companyId, start, title]);
  return <EventEditorDialog open={open && !!draft} onClose={onClose} draft={draft} mode="appointment" />;
}
