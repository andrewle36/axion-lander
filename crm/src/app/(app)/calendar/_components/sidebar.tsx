"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, MoreVertical, Plus, Search, Trash2, Pencil, Eye, CalendarPlus, X, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Input, Menu, MenuItem, Spinner, confirmAction, Avatar } from "@/components/ui";
import { cn, fmtPhone, fullName } from "@/lib/utils";
import { PALETTE, type Calendar } from "@/components/calendar/lib";
import { useDebounced } from "@/components/calendar/contact-picker";
import { MiniMonth } from "./mini-month";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Person = { id: string; first_name: string; last_name: string; phone?: string | null; email?: string | null };

export function CalSidebar({ date, onPick, highlight, calendars, hidden, setHidden, onCreateEvent, onCreateAppointment, person, setPerson, onBook, canEditShared }: {
  date: Date; onPick: (d: Date) => void; highlight: { start: Date; end: Date } | null;
  calendars: Calendar[]; hidden: Set<string>; setHidden: (s: Set<string>) => void;
  onCreateEvent: () => void; onCreateAppointment: () => void;
  person: Person | null; setPerson: (p: Person | null) => void; onBook: (p: Person) => void; canEditShared: boolean;
}) {
  const [month, setMonth] = useState(date);
  const [lastDate, setLastDate] = useState(date);
  if (lastDate.getTime() !== date.getTime()) { setLastDate(date); setMonth(date); }
  const [mineOpen, setMineOpen] = useState(true);
  const [adding, setAdding] = useState(false);

  return (
    <aside className="scroll-thin flex w-64 shrink-0 flex-col overflow-y-auto bg-bg pb-6">
      <div className="px-3 pb-3 pt-2">
        <Menu width={232} trigger={
          <button type="button" className="flex h-14 items-center gap-3 rounded-2xl bg-bg pl-4 pr-5 text-sm font-medium text-fg shadow-[0_1px_3px_rgb(0_0_0/0.2),0_4px_8px_rgb(0_0_0/0.08)] hover:bg-hover dark:bg-subtle">
            <Plus className="h-6 w-6 text-accent" strokeWidth={2.2} /> Create <ChevronDown className="h-4 w-4 text-muted" />
          </button>
        }>
          {(close) => <>
            <MenuItem icon={<CalendarPlus className="h-4 w-4" />} onClick={() => { close(); onCreateEvent(); }}>Event</MenuItem>
            <MenuItem icon={<UserRound className="h-4 w-4" />} onClick={() => { close(); onCreateAppointment(); }}>Appointment for contact</MenuItem>
          </>}
        </Menu>
      </div>

      <div className="px-3">
        <MiniMonth month={month} onMonth={setMonth} selected={date} range={highlight} onPick={onPick} />
      </div>

      <PeopleSearch person={person} setPerson={setPerson} onBook={onBook} />

      <div className="mt-2 px-1">
        <div className="flex h-9 items-center rounded-full pl-3 pr-1 hover:bg-hover">
          <button type="button" className="flex flex-1 items-center justify-between text-sm font-medium" onClick={() => setMineOpen((o) => !o)}>
            My calendars {mineOpen ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
          </button>
          <button type="button" aria-label="Add calendar" title="Add calendar" onClick={() => setAdding(true)} className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-fg"><Plus className="h-4 w-4" /></button>
        </div>
        {mineOpen && calendars.map((c) => (
          <CalendarRow key={c.id} cal={c} checked={!hidden.has(c.id)} canEdit={!!c.owner_id || canEditShared}
            onToggle={() => { const s = new Set(hidden); if (s.has(c.id)) s.delete(c.id); else s.add(c.id); setHidden(s); }}
            onOnly={() => setHidden(new Set(calendars.filter((x) => x.id !== c.id).map((x) => x.id)))} />
        ))}
        {mineOpen && (
          <button type="button" onClick={() => setAdding(true)} className="mt-1 flex h-8 w-full items-center gap-3 rounded-full pl-4 text-sm text-muted hover:bg-hover hover:text-fg">
            <Plus className="h-4 w-4" /> Add calendar
          </button>
        )}
      </div>
      <AddCalendarDialog open={adding} onClose={() => setAdding(false)} canShare={canEditShared} />
    </aside>
  );
}

function PeopleSearch({ person, setPerson, onBook }: { person: Person | null; setPerson: (p: Person | null) => void; onBook: (p: Person) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const res = trpc.calendar.people.useQuery({ q: dq }, { enabled: dq.trim().length > 0 });
  return (
    <div className="mt-3 px-3">
      {person ? (
        <div className="flex items-center gap-2 rounded-md bg-accent-soft px-2.5 py-2 text-sm">
          <Avatar name={fullName(person)} size={22} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{fullName(person)}</div>
            <div className="text-[11px] text-muted">Showing their appointments</div>
          </div>
          <button type="button" aria-label="Clear person filter" onClick={() => setPerson(null)} className="rounded-full p-1 text-muted hover:bg-hover"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for people"
            onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } }}
            className="h-9 w-full rounded-md bg-subtle pl-9 pr-3 text-sm text-fg placeholder:text-muted focus:bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30" />
          {dq.trim() && (
            <div className="absolute left-0 right-0 z-30 mt-1 rounded-md border border-border bg-bg p-1 shadow-pop">
              {res.isLoading ? <div className="flex items-center gap-2 p-2 text-sm text-faint"><Spinner />Searching…</div>
                : (res.data ?? []).length === 0 ? <div className="p-2 text-sm text-faint">No people found</div>
                : (res.data as Person[]).map((p) => (
                  <div key={p.id} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setPerson(p); setQ(""); }}>
                      <Avatar name={fullName(p)} size={22} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{fullName(p)}</span>
                        <span className="block truncate text-[11px] text-faint">{fmtPhone(p.phone) || p.email}</span>
                      </span>
                    </button>
                    <button type="button" title="Book appointment" aria-label="Book appointment" onClick={() => { onBook(p); setQ(""); }}
                      className="rounded-full p-1 text-muted opacity-0 hover:bg-subtle hover:text-fg group-hover:opacity-100"><CalendarPlus className="h-4 w-4" /></button>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarRow({ cal, checked, onToggle, onOnly, canEdit }: { cal: Calendar; checked: boolean; onToggle: () => void; onOnly: () => void; canEdit: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(cal.name);
  const upd = trpc.calendar.updateCalendar.useMutation();
  const del = trpc.calendar.deleteCalendar.useMutation();
  const commit = async () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== cal.name) await upd.mutateAsync({ id: cal.id, name: name.trim() });
    else setName(cal.name);
  };
  return (
    <div className="group flex h-8 items-center gap-3 rounded-full pl-4 pr-1 hover:bg-hover">
      <button type="button" role="checkbox" aria-checked={checked} aria-label={`Show ${cal.name}`} onClick={onToggle}
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-2"
        style={{ borderColor: cal.color, background: checked ? cal.color : "transparent" }}>
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
      </button>
      {renaming ? (
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") void commit(); if (e.key === "Escape") { setName(cal.name); setRenaming(false); } }} className="h-7" />
      ) : (
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-sm">{cal.name}</button>
      )}
      <Menu align="right" width={236} trigger={
        <button type="button" aria-label={`Options for ${cal.name}`} className="flex h-7 w-7 items-center justify-center rounded-full text-muted opacity-0 hover:bg-subtle hover:text-fg group-hover:opacity-100 focus:opacity-100"><MoreVertical className="h-4 w-4" /></button>
      }>
        {(close) => <>
          <MenuItem icon={<Eye className="h-4 w-4" />} onClick={() => { close(); onOnly(); }}>Display this only</MenuItem>
          {canEdit && <>
            <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { close(); setRenaming(true); }}>Rename</MenuItem>
            <div className="my-1 border-t border-border" />
            <div className="grid grid-cols-6 gap-1.5 px-2 py-1.5">
              {PALETTE.map((p) => (
                <button key={p.hex} type="button" title={p.name} aria-label={p.name}
                  onClick={async () => { close(); await upd.mutateAsync({ id: cal.id, color: p.hex }); }}
                  className="flex h-6 w-6 items-center justify-center rounded-full hover:scale-110" style={{ background: p.hex }}>
                  {cal.color.toLowerCase() === p.hex && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
            {cal.kind !== "appointments" && <>
              <div className="my-1 border-t border-border" />
              <MenuItem danger icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
                close();
                if (confirmAction(`Delete calendar “${cal.name}” and all its events?`)) { await del.mutateAsync({ id: cal.id }); toast.success("Calendar deleted"); }
              }}>Delete</MenuItem>
            </>}
          </>}
        </>}
      </Menu>
    </div>
  );
}

function AddCalendarDialog({ open, onClose, canShare }: { open: boolean; onClose: () => void; canShare: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[6]!.hex);
  const [shared, setShared] = useState(false);
  const create = trpc.calendar.createCalendar.useMutation();
  const save = async () => {
    if (!name.trim()) return toast.error("Name your calendar");
    await create.mutateAsync({ name: name.trim(), color, shared });
    toast.success("Calendar created"); setName(""); setShared(false); onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Create new calendar" width={420}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={save}>Create calendar</Button></>}>
      <div className="space-y-4">
        <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
        <div>
          <div className="mb-2 text-xs font-medium text-muted">Color</div>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((p) => (
              <button key={p.hex} type="button" title={p.name} onClick={() => setColor(p.hex)}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full")} style={{ background: p.hex }}>
                {color === p.hex && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
        {canShare && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Shared with the whole team
          </label>
        )}
      </div>
    </Dialog>
  );
}
