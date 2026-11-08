"use client";
import { useEffect, useRef, useState } from "react";
import { addDays, addMinutes, format, parse, startOfDay } from "date-fns";
import { CalendarDays, Clock, X, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Checkbox, IconButton, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { TimeSelect } from "@/components/calendar/event-editor";
import { ContactPicker, type PickedContact } from "@/components/calendar/contact-picker";
import { minutesOf, type Calendar, type Draft } from "@/components/calendar/lib";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function QuickCreate({ draft, setDraft, calendars, onClose, onMore }: {
  draft: Draft; setDraft: (d: Draft) => void; calendars: Calendar[]; onClose: () => void; onMore: (d: Draft) => void;
}) {
  const [tab, setTab] = useState<"event" | "appointment">(draft.contact ? "appointment" : "event");
  const [contact, setContact] = useState<PickedContact | null>((draft.contact as any) ?? null);
  const titleRef = useRef<HTMLInputElement>(null);
  const create = trpc.calendar.create.useMutation();
  const quick = trpc.calendar.quickCreate.useMutation();
  useEffect(() => { titleRef.current?.focus(); }, []);

  const s = new Date(draft.start_at), e = new Date(draft.end_at);
  const appts = calendars.find((c) => c.kind === "appointments");
  const personal = calendars.find((c) => c.kind === "personal");
  const calId = draft.calendar_id ?? (tab === "appointment" ? appts?.id : personal?.id) ?? calendars[0]?.id ?? "";
  const sMin = minutesOf(s);
  const eMin = draft.all_day ? sMin + 60 : (format(e, "yyyy-MM-dd") !== format(s, "yyyy-MM-dd") ? 1440 : minutesOf(e));

  const setDay = (v: string) => {
    if (!v) return;
    const d = parse(v, "yyyy-MM-dd", new Date());
    const len = e.getTime() - s.getTime();
    const ns = draft.all_day ? startOfDay(d) : addMinutes(startOfDay(d), sMin);
    setDraft({ ...draft, start_at: ns.toISOString(), end_at: new Date(ns.getTime() + len).toISOString() });
  };
  const setTimes = (a: number, b: number) => {
    const day = startOfDay(s);
    setDraft({ ...draft, start_at: addMinutes(day, a).toISOString(), end_at: addMinutes(day, Math.max(a + 15, b)).toISOString() });
  };
  const toggleAllDay = (v: boolean) => {
    const day = startOfDay(s);
    if (v) setDraft({ ...draft, all_day: true, start_at: day.toISOString(), end_at: addDays(day, 1).toISOString() });
    else { const st = addMinutes(day, 9 * 60); setDraft({ ...draft, all_day: false, start_at: st.toISOString(), end_at: addMinutes(st, 60).toISOString() }); }
  };

  const full = (): Draft => ({ ...draft, calendar_id: calId || null, contact: contact as any, contact_id: contact?.id ?? null });

  const save = async () => {
    const title = (draft.title ?? "").trim() || "(No title)";
    if (contact) await create.mutateAsync({ title, start_at: draft.start_at, end_at: draft.end_at, all_day: !!draft.all_day, calendar_id: calId || null, contact_id: contact.id });
    else await quick.mutateAsync({ title, start_at: draft.start_at, end_at: draft.end_at, all_day: !!draft.all_day, calendar_id: calId || null });
    toast.success(contact ? "Appointment booked" : "Event saved");
    onClose();
  };

  return (
    <div className="pb-3">
      <div className="flex h-9 items-center justify-end rounded-t-lg bg-subtle px-1.5">
        <IconButton label="Close" className="rounded-full" onClick={onClose}><X className="h-4 w-4" /></IconButton>
      </div>
      <div className="space-y-3 px-5 pt-3">
        <input ref={titleRef} value={draft.title ?? ""} onChange={(ev) => setDraft({ ...draft, title: ev.target.value })} placeholder="Add title"
          onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void save(); } }}
          className="ml-9 w-[calc(100%-36px)] border-0 border-b-2 border-border bg-transparent pb-1 text-[22px] text-fg placeholder:text-faint focus:border-accent focus:outline-none" />
        <div className="ml-9 flex gap-1">
          {(["event", "appointment"] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setTab(t); if (t === "event") setContact(null); setDraft({ ...draft, calendar_id: null }); }}
              className={cn("h-8 rounded px-3 text-sm font-medium", tab === t ? "bg-accent-soft text-accent" : "text-muted hover:bg-hover")}>
              {t === "event" ? "Event" : "Appointment"}
            </button>
          ))}
        </div>
        <div className="flex items-start gap-4">
          <Clock className="mt-2 h-4 w-4 shrink-0 text-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <input type="date" value={format(s, "yyyy-MM-dd")} onChange={(ev) => setDay(ev.target.value)}
                className="h-8 rounded border border-border bg-bg px-2 text-sm text-fg focus:border-accent focus:outline-none" />
              {!draft.all_day && <>
                <TimeSelect className="w-28" value={sMin} onChange={(m) => setTimes(m, m + (eMin - sMin))} />
                <span className="text-muted">–</span>
                <TimeSelect className="w-40" value={eMin} from={sMin} onChange={(m) => setTimes(sMin, m)} />
              </>}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm"><Checkbox checked={!!draft.all_day} onChange={toggleAllDay} />All day</label>
          </div>
        </div>
        {tab === "appointment" && (
          <div className="flex items-start gap-4">
            <UserRound className="mt-2 h-4 w-4 shrink-0 text-muted" />
            <ContactPicker className="flex-1" value={contact} onChange={(c) => { setContact(c); if (c && !(draft.title ?? "").trim()) setDraft({ ...draft, title: `Smog appointment – ${[c.first_name, c.last_name].filter(Boolean).join(" ")}` }); }} placeholder="Search contacts" />
          </div>
        )}
        <div className="flex items-center gap-4">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: calendars.find((c) => c.id === calId)?.color ?? "#039be5" }} />
          <Select className="flex-1" value={calId} onChange={(ev) => setDraft({ ...draft, calendar_id: ev.target.value })}>
            {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2 px-5">
        <Button variant="ghost" className="text-accent hover:text-accent" onClick={() => onMore(full())}>More options</Button>
        <Button variant="primary" className="rounded-full px-6" onClick={save} loading={create.isPending || quick.isPending}>Save</Button>
      </div>
    </div>
  );
}
