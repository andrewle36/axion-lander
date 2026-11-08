"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";

export function NewContactDialog({ open, onClose, companyId, kind = "driver" }: { open: boolean; onClose: () => void; companyId?: string; kind?: "driver" | "partner_contact" | "lead" }) {
  const router = useRouter();
  const team = trpc.team.list.useQuery();
  const companies = trpc.companies.options.useQuery();
  const [f, setF] = useState({ first_name: "", last_name: "", phone: "", email: "", source: "walk-in", status: "lead", owner_id: "", company_id: companyId ?? "", kind, title: "", notes: "", year: "", make: "", model: "" });
  const create = trpc.contacts.create.useMutation({
    onSuccess: (c) => { toast.success("Contact created"); onClose(); router.push(`/contacts/${c.id}`); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    if (!f.first_name) return toast.error("First name is required");
    if (!f.phone && !f.email) return toast.error("Add a phone or email");
    create.mutate({
      first_name: f.first_name, last_name: f.last_name, phone: f.phone || null, email: f.email || null, source: f.source, status: f.status as any,
      owner_id: f.owner_id || undefined, company_id: f.company_id || null, kind: f.kind as any, title: f.title || null, notes: f.notes || null,
      vehicle: f.make || f.model ? { year: f.year ? Number(f.year) : undefined, make: f.make, model: f.model } : undefined,
    });
  };
  return (
    <Dialog open={open} onClose={onClose} title="New contact" width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create contact</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input autoFocus value={f.first_name} onChange={set("first_name")} /></Field>
        <Field label="Last name"><Input value={f.last_name} onChange={set("last_name")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} placeholder="(714) 555-0100" /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={set("kind")}><option value="driver">Retail driver</option><option value="partner_contact">Partner contact</option><option value="lead">Lead</option></Select></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{["lead", "contacted", "booked", "customer", "lost"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Source"><Select value={f.source} onChange={set("source")}>{["walk-in", "phone", "google", "yelp", "referral", "dealer", "website", "facebook", "manual"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label="Owner"><Select value={f.owner_id} onChange={set("owner_id")}><option value="">Me</option>{team.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name ?? t.email}</option>)}</Select></Field>
        <Field label="Partner account" className="col-span-2"><Select value={f.company_id} onChange={set("company_id")}><option value="">None (retail)</option>{companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        {f.company_id && <Field label="Title" className="col-span-2"><Input value={f.title} onChange={set("title")} placeholder="Sales manager, porter…" /></Field>}
        <div className="col-span-2 grid grid-cols-3 gap-3">
          <Field label="Vehicle year"><Input value={f.year} onChange={set("year")} inputMode="numeric" /></Field>
          <Field label="Make"><Input value={f.make} onChange={set("make")} /></Field>
          <Field label="Model"><Input value={f.model} onChange={set("model")} /></Field>
        </div>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={f.notes} onChange={set("notes")} /></Field>
      </div>
    </Dialog>
  );
}
