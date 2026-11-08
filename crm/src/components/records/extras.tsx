"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Car, Phone } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Badge, Button, Dialog, Field, Input, Loading, Markdown, Select, StatusBadge, Empty, confirmAction } from "@/components/ui";
import { fmtPhone, shortDate } from "@/lib/utils";

const CAT = [["passenger", "Passenger"], ["van", "Van"], ["exotic", "Exotic"], ["sprinter", "Sprinter"], ["old", "Old (pre-2000)"], ["old_luxury", "Old luxury"]];

export function VehicleRow({ v, onEdit }: { v: any; onEdit: () => void }) {
  const due = v.next_due_at ? new Date(v.next_due_at) : null;
  const soon = due && due.getTime() - Date.now() < 45 * 864e5;
  return (
    <button onClick={onEdit} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle">
      <Car className="h-4 w-4 text-muted" />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{[v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle"}</div>
        <div className="truncate text-xs text-muted">{v.vin ? `VIN ${v.vin}` : "No VIN"}{v.plate ? ` · ${v.plate}` : ""} · {v.category.replace("_", " ")}</div></div>
      {due && <Badge tone={soon ? "amber" : "gray"}>Smog due {shortDate(v.next_due_at)}</Badge>}
    </button>
  );
}
export function VehicleDialog({ v, contactId, companyId, onClose }: { v: any; contactId?: string; companyId?: string; onClose: () => void }) {
  const [f, setF] = useState({ year: v.year ?? "", make: v.make ?? "", model: v.model ?? "", vin: v.vin ?? "", plate: v.plate ?? "", category: v.category ?? "passenger", last_smog_at: v.last_smog_at ?? "", next_due_at: v.next_due_at ?? "", notes: v.notes ?? "" });
  const save = trpc.contacts.saveVehicle.useMutation({ onSuccess: () => { toast.success("Vehicle saved"); onClose(); } });
  const del = trpc.contacts.deleteVehicle.useMutation({ onSuccess: onClose });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onClose={onClose} title={v.id ? "Edit vehicle" : "Add vehicle"}
      footer={<>{v.id && <Button variant="ghost" className="mr-auto text-danger" onClick={() => confirmAction("Delete vehicle?") && del.mutate({ id: v.id })}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ id: v.id, contact_id: v.id ? undefined : contactId ?? null, company_id: v.id ? undefined : companyId ?? null,
          year: f.year ? Number(f.year) : null, make: f.make || null, model: f.model || null, vin: f.vin || null, plate: f.plate || null, category: f.category as any,
          last_smog_at: f.last_smog_at || null, next_due_at: f.next_due_at || null, notes: f.notes || null })}>Save</Button></>}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Year"><Input value={f.year} onChange={set("year")} inputMode="numeric" /></Field>
        <Field label="Make"><Input value={f.make} onChange={set("make")} /></Field>
        <Field label="Model"><Input value={f.model} onChange={set("model")} /></Field>
        <Field label="VIN" className="col-span-2"><Input value={f.vin} onChange={set("vin")} maxLength={17} className="font-mono uppercase" /></Field>
        <Field label="Plate"><Input value={f.plate} onChange={set("plate")} className="uppercase" /></Field>
        <Field label="Category" className="col-span-3"><Select value={f.category} onChange={set("category")}>{CAT.map(([v2, l]) => <option key={v2} value={v2}>{l}</option>)}</Select></Field>
        <Field label="Last smog"><Input type="date" value={f.last_smog_at} onChange={set("last_smog_at")} /></Field>
        <Field label="Next smog due" className="col-span-2" hint="Drives the 'smog due' reminder automation"><Input type="date" value={f.next_due_at} onChange={set("next_due_at")} /></Field>
      </div>
    </Dialog>
  );
}
export function CallsTable({ contactId, companyId }: { contactId?: string; companyId?: string }) {
  const calls = trpc.comms.calls.useQuery({ contact_id: contactId, company_id: companyId, limit: 100 });
  if (calls.isLoading) return <Loading />;
  if (!calls.data?.length) return <Empty icon={<Phone className="h-6 w-6" />} title="No calls yet" body="Calls placed or received from the dialer are logged here with notes and AI summaries." />;
  return (
    <div className="divide-y divide-border">
      {calls.data.map((cl: any) => (
        <div key={cl.id} className="px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Phone className={`h-3.5 w-3.5 ${cl.direction === "in" ? "text-success" : "text-accent"}`} />
            <span className="font-medium">{cl.direction === "in" ? "Inbound" : "Outbound"}</span>
            <span className="text-muted">{fmtPhone(cl.direction === "in" ? cl.from_number : cl.to_number)}</span>
            <StatusBadge status={cl.status} />
            <span className="text-muted">{Math.floor(cl.duration_sec / 60)}m {cl.duration_sec % 60}s</span>
            <span className="ml-auto text-xs text-faint">{cl.user?.full_name} · {shortDate(cl.started_at)}</span>
          </div>
          {cl.ai_summary && <div className="mt-2 rounded bg-purple-500/5 p-2 text-sm"><Markdown text={cl.ai_summary} /></div>}
          {!cl.ai_summary && cl.notes && <div className="mt-1 whitespace-pre-wrap text-sm text-muted">{cl.notes}</div>}
          {cl.recording_url && <audio controls src={cl.recording_url} className="mt-2 h-8 w-full" />}
        </div>
      ))}
    </div>
  );
}
