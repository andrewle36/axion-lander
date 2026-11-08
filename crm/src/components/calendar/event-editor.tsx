"use client";
import { useEffect, useMemo, useState } from "react";
import { addDays, addMinutes, format, parse, startOfDay } from "date-fns";
import { AlignLeft, CalendarDays, Car, Clock, MapPin, Palette, Trash2, User, Video, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Select, Textarea, Checkbox, confirmAction } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ContactPicker, type PickedContact } from "./contact-picker";
import { PALETTE, STATUS_LABEL, asCalendars, minutesOf, vehicleLabel, type Draft } from "./lib";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DAY_FMT = "yyyy-MM-dd";
const toDate = (s: string) => parse(s, DAY_FMT, new Date());
const label = (min: number) => { const d = addMinutes(startOfDay(new Date()), min); return format(d, "h:mm") + format(d, "a").toLowerCase(); };
const dur = (m: number) => (m < 60 ? `${m} mins` : m % 60 === 0 ? `${m / 60} hr${m === 60 ? "" : "s"}` : `${(m / 60).toFixed(1).replace(/\.0$/, "")} hrs`);

export function TimeSelect({ value, onChange, from, className }: { value: number; onChange: (m: number) => void; from?: number; className?: string }) {
  const opts = useMemo(() => {
    const o: number[] = [];
    for (let m = from != null ? from + 15 : 0; m <= (from != null ? 1440 : 1425); m += 15) o.push(m);
    if (!o.includes(value)) o.push(value);
    return o.sort((a, b) => a - b);
  }, [from, value]);
  return (
    <Select className={cn("w-36", className)} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {opts.map((m) => <option key={m} value={m}>{m === 1440 ? "12:00am" : label(m)}{from != null ? ` (${dur(m - from)})` : ""}</option>)}
    </Select>
  );
}

export function EventEditorDialog({ open, onClose, draft, mode = "event" }: { open: boolean; onClose: () => void; draft: Draft | null; mode?: "event" | "appointment" }) {
  const cals = asCalendars(trpc.calendar.calendars.useQuery(undefined, { enabled: open }).data);
  const create = trpc.calendar.create.useMutation();
  const update = trpc.calendar.update.useMutation();
  const del = trpc.calendar.delete.useMutation();

  const [title, setTitle] = useState("");
  const [sDate, setSDate] = useState(""); const [eDate, setEDate] = useState("");
  const [sMin, setSMin] = useState(540); const [eMin, setEMin] = useState(600);
  const [allDay, setAllDay] = useState(false);
  const [calendarId, setCalendarId] = useState<string>("");
  const [color, setColor] = useState<string | null>(null);
  const [location, setLocation] = useState(""); const [meetingUrl, setMeetingUrl] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState<PickedContact | null>(null);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [status, setStatus] = useState<string>("confirmed");

  useEffect(() => {
    if (!open || !draft) return;
    const s = new Date(draft.start_at), e = new Date(draft.end_at);
    setTitle(draft.title && draft.title !== "(No title)" ? draft.title : "");
    setAllDay(!!draft.all_day);
    setSDate(format(s, DAY_FMT));
    setEDate(format(draft.all_day ? addDays(e, -1) < s ? s : addDays(e, -1) : e, DAY_FMT));
    setSMin(minutesOf(s)); setEMin(draft.all_day ? minutesOf(s) + 60 : minutesOf(e) || (format(e, DAY_FMT) !== format(s, DAY_FMT) ? 1440 : 0));
    setCalendarId(draft.calendar_id ?? "");
    setColor(draft.color ?? null);
    setLocation(draft.location ?? ""); setMeetingUrl(draft.meeting_url ?? "");
    setDescription(draft.description ?? "");
    setContact(draft.contact ? { ...draft.contact } : null);
    setVehicleId(draft.vehicle_id ?? "");
    setStatus(draft.status ?? "confirmed");
  }, [open, draft]);

  // default calendar once calendars load
  useEffect(() => {
    if (!open || calendarId || !cals.length) return;
    const pref = mode === "appointment" || contact ? cals.find((c) => c.kind === "appointments") : cals.find((c) => c.kind === "personal");
    setCalendarId((pref ?? cals[0]!).id);
  }, [open, cals, calendarId, mode, contact]);

  const vehicles = trpc.calendar.vehicles.useQuery({ contactId: contact?.id ?? "" }, { enabled: open && !!contact?.id });
  const isNew = !draft?.id;
  const cal = cals.find((c) => c.id === calendarId);
  const shown = color ?? cal?.color ?? "#039be5";

  const save = async () => {
    if (!sDate) return toast.error("Pick a date");
    const sd = toDate(sDate), ed = toDate(eDate || sDate);
    let start: Date, end: Date;
    if (allDay) { start = startOfDay(sd); end = addDays(startOfDay(ed < sd ? sd : ed), 1); }
    else {
      start = addMinutes(startOfDay(sd), sMin);
      end = addMinutes(startOfDay(ed), eMin);
      if (end <= start) end = addMinutes(start, 30);
    }
    const payload = {
      title: title.trim() || "(No title)", start_at: start.toISOString(), end_at: end.toISOString(), all_day: allDay,
      calendar_id: calendarId || null, color, location: location || null, description: description || null, meeting_url: meetingUrl || null,
      contact_id: contact?.id ?? null, company_id: contact ? (contact.company_id ?? draft?.company_id ?? null) : (draft?.company_id ?? null),
      vehicle_id: contact && vehicleId ? vehicleId : null, status: status as any,
    };
    if (isNew) { await create.mutateAsync(payload); toast.success(contact ? "Appointment booked" : "Event saved"); }
    else { await update.mutateAsync({ id: draft!.id!, ...payload }); toast.success("Event updated"); }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} width={720} title={isNew ? (mode === "appointment" ? "Book appointment" : "New event") : "Edit event"}
      footer={<>
        {!isNew && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} loading={del.isPending}
          onClick={async () => { if (confirmAction("Delete this event?")) { await del.mutateAsync({ id: draft!.id! }); toast.success("Event deleted"); onClose(); } }}>Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={create.isPending || update.isPending}>Save</Button>
      </>}>
      <div className="space-y-4">
        <input autoFocus={mode !== "appointment"} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add title"
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          className="w-full border-0 border-b-2 border-border bg-transparent pb-1.5 text-[22px] text-fg placeholder:text-faint focus:border-accent focus:outline-none" />

        <Row icon={<Clock className="h-4 w-4" />}>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={sDate} onChange={(e) => { const v = e.target.value; setSDate(v); if (!eDate || toDate(eDate) < toDate(v) || !allDay) setEDate(v); }}
              className="h-8 rounded border border-border bg-bg px-2 text-sm text-fg focus:border-accent focus:outline-none" />
            {!allDay && <>
              <TimeSelect value={sMin} onChange={(m) => { const d = eMin - sMin; setSMin(m); if (sDate === eDate) setEMin(Math.min(1440, m + Math.max(15, d))); }} />
              <span className="text-muted">–</span>
              <TimeSelect value={eMin} onChange={setEMin} from={sDate === eDate ? sMin : undefined} />
            </>}
            {(allDay || eDate !== sDate) && <>
              {allDay && <span className="text-muted">–</span>}
              <input type="date" value={eDate} min={sDate} onChange={(e) => setEDate(e.target.value)}
                className="h-8 rounded border border-border bg-bg px-2 text-sm text-fg focus:border-accent focus:outline-none" />
            </>}
          </div>
          <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={allDay} onChange={setAllDay} /> All day
          </label>
        </Row>

        <Row icon={<User className="h-4 w-4" />}>
          <ContactPicker value={contact} autoFocus={mode === "appointment" && !contact} placeholder="Link a contact (search name, phone, email)"
            onChange={(c) => { setContact(c); setVehicleId(""); if (c && isNew) { const appt = cals.find((x) => x.kind === "appointments"); if (appt) setCalendarId(appt.id); } }} />
        </Row>
        {contact && (
          <Row icon={<Car className="h-4 w-4" />}>
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">{vehicles.isLoading ? "Loading vehicles…" : (vehicles.data ?? []).length ? "No vehicle" : "Contact has no vehicles"}</option>
              {(vehicles.data ?? []).map((v: any) => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
            </Select>
          </Row>
        )}

        <Row icon={<MapPin className="h-4 w-4" />}>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Add location"
            className="h-8 w-full rounded border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none" />
        </Row>
        <Row icon={<Video className="h-4 w-4" />}>
          <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="Add video call link"
            className="h-8 w-full rounded border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none" />
        </Row>

        <Row icon={<CalendarDays className="h-4 w-4" />}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: cal?.color ?? "#039be5" }} />
            <Select className="w-52" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {cals.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <span className="ml-2 inline-flex items-center gap-1.5 text-muted"><Palette className="h-4 w-4" /></span>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" title="Calendar color" onClick={() => setColor(null)}
                className={cn("h-5 w-5 rounded-full ring-offset-2 ring-offset-bg", color == null && "ring-2 ring-fg/60")} style={{ background: cal?.color ?? "#039be5" }} />
              {PALETTE.map((p) => (
                <button key={p.hex} type="button" title={p.name} onClick={() => setColor(p.hex)}
                  className={cn("h-5 w-5 rounded-full ring-offset-2 ring-offset-bg", color === p.hex && "ring-2 ring-fg/60")} style={{ background: p.hex }} />
              ))}
            </div>
          </div>
        </Row>

        <Row icon={<CircleCheck className="h-4 w-4" />}>
          <Select className="w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Row>

        <Row icon={<AlignLeft className="h-4 w-4" />}>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add description" />
        </Row>
        <div className="flex items-center gap-2 pl-8 text-xs text-faint"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: shown }} />Shown in {color ? PALETTE.find((p) => p.hex === color)?.name : "calendar color"}</div>
      </div>
    </Dialog>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-start gap-4"><span className="mt-2 text-muted">{icon}</span><div className="min-w-0 flex-1">{children}</div></div>;
}
