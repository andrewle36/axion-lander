"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startOfDay } from "date-fns";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Loading } from "@/components/ui";
import { EventEditorDialog } from "@/components/calendar/event-editor";
import { BookAppointmentDialog } from "@/components/calendar/book-appointment";
import {
  asCalendars, asEvents, defaultDraft, eventColor, periodTitle, rangeFor, readLocal, step, writeLocal,
  type CalEvent, type Calendar, type Draft, type View,
} from "@/components/calendar/lib";
import { TopBar } from "./_components/top-bar";
import { CalSidebar, type Person } from "./_components/sidebar";
import { TimeGrid } from "./_components/time-grid";
import { MonthView, DayList } from "./_components/month-view";
import { YearView } from "./_components/year-view";
import { ScheduleView } from "./_components/schedule-view";
import { AnchoredPopover, toRect, type Rect } from "./_components/popover";
import { EventDetail } from "./_components/event-detail";
import { QuickCreate } from "./_components/quick-create";

type Pop =
  | { kind: "event"; ev: CalEvent; rect: Rect }
  | { kind: "quick"; draft: Draft; rect: Rect }
  | { kind: "more"; day: Date; rect: Rect }
  | null;

const KEY_VIEW: Record<string, View> = { d: "day", w: "week", m: "month", y: "year", a: "schedule", x: "4day", "1": "day", "2": "week", "3": "month", "4": "year", "5": "schedule", "6": "4day" };

export default function CalendarPage() {
  const [view, setViewState] = useState<View>("week");
  const [date, setDate] = useState(() => startOfDay(new Date()));
  const [sidebar, setSidebar] = useState(true);
  const [hidden, setHiddenState] = useState<Set<string>>(new Set());
  const [pop, setPop] = useState<Pop>(null);
  const [editor, setEditor] = useState<{ draft: Draft; mode: "event" | "appointment" } | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [bookFor, setBookFor] = useState<Person | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(0);

  // restore per-viewer prefs
  useEffect(() => {
    setViewState(readLocal<View>("cal.view", "week"));
    setSidebar(readLocal<boolean>("cal.sidebar", true));
    setHiddenState(new Set(readLocal<string[]>("cal.hidden", [])));
  }, []);
  const setView = useCallback((v: View) => { setViewState(v); writeLocal("cal.view", v); setPop(null); }, []);
  const setHidden = (s: Set<string>) => { setHiddenState(s); writeLocal("cal.hidden", Array.from(s)); };
  const toggleSidebar = () => setSidebar((o) => { writeLocal("cal.sidebar", !o); return !o; });

  const me = trpc.team.me.useQuery();
  const calsQ = trpc.calendar.calendars.useQuery();
  const calendars = asCalendars(calsQ.data);
  const calMap = useMemo(() => Object.fromEntries(calendars.map((c) => [c.id, c])) as Record<string, Calendar>, [calendars]);
  const visibleIds = useMemo(() => calendars.filter((c) => !hidden.has(c.id)).map((c) => c.id), [calendars, hidden]);

  const { start, end, days } = useMemo(() => rangeFor(view, date), [view, date]);
  const rangeInput = useMemo(() => ({ start: start.toISOString(), end: end.toISOString(), calendarIds: visibleIds }), [start, end, visibleIds]);
  const utils = trpc.useUtils();
  const eventsQ = trpc.calendar.range.useQuery(rangeInput, { enabled: calsQ.isSuccess, placeholderData: (prev) => prev });
  const searchQ = trpc.calendar.search.useQuery({ q: search ?? "", calendarIds: visibleIds }, { enabled: !!search && calsQ.isSuccess });

  const events = useMemo(() => {
    let list = asEvents(eventsQ.data).filter((e) => !e.calendar_id || !hidden.has(e.calendar_id));
    if (person) list = list.filter((e) => e.contact_id === person.id);
    return list;
  }, [eventsQ.data, hidden, person]);

  const move = trpc.calendar.move.useMutation({ meta: { keepCache: true }, onSettled: () => utils.calendar.invalidate() });
  const onMove = useCallback((ev: CalEvent, s: Date, e: Date, allDay?: boolean) => {
    utils.calendar.range.setData(rangeInput, (old) => (old as CalEvent[] | undefined)?.map((x) => (x.id === ev.id ? { ...x, start_at: s.toISOString(), end_at: e.toISOString() } : x)) as typeof old);
    move.mutate({ id: ev.id, start_at: s.toISOString(), end_at: e.toISOString(), ...(allDay !== undefined ? { all_day: allDay } : {}) },
      { onError: () => toast.error("Couldn't move event") });
    setPop(null);
  }, [move, rangeInput, utils]);

  const openEvent = useCallback((ev: CalEvent, rect: Rect) => setPop({ kind: "event", ev, rect: toRect(rect) }), []);
  const onSelect = useCallback((s: Date, e: Date, allDay: boolean, rect: Rect) => {
    setPop({ kind: "quick", draft: { title: "", start_at: s.toISOString(), end_at: e.toISOString(), all_day: allDay, calendar_id: null, status: "confirmed" }, rect: toRect(rect) });
  }, []);
  const goDay = useCallback((d: Date) => { setDate(startOfDay(d)); setView("day"); setSearch(null); }, [setView]);
  const newEvent = useCallback(() => { setPop(null); setEditor({ draft: defaultDraft(date), mode: "event" }); }, [date]);
  const newAppointment = () => { setPop(null); setEditor({ draft: defaultDraft(date), mode: "appointment" }); };

  // keyboard shortcuts (Google Calendar)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (editor || bookFor || document.querySelector(".fixed.inset-0.z-50")) return;
      const k = e.key.toLowerCase();
      if (KEY_VIEW[k] && !e.shiftKey) { e.preventDefault(); setView(KEY_VIEW[k]!); setSearch(null); return; }
      if (k === "t") { e.preventDefault(); setDate(startOfDay(new Date())); setPop(null); return; }
      if (k === "j" || k === "n" || e.key === "ArrowRight") { e.preventDefault(); setDate((d) => step(view, d, 1)); setPop(null); return; }
      if (k === "k" || k === "p" || e.key === "ArrowLeft") { e.preventDefault(); setDate((d) => step(view, d, -1)); setPop(null); return; }
      if (k === "c") { e.preventDefault(); newEvent(); return; }
      if (k === "/") { e.preventDefault(); setSearchFocus((n) => n + 1); return; }
      if (k === "e" && pop?.kind === "event") { e.preventDefault(); setEditor({ draft: pop.ev, mode: "event" }); setPop(null); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [view, editor, bookFor, pop, newEvent, setView]);

  const ghost = pop?.kind === "quick"
    ? { start: new Date(pop.draft.start_at), end: new Date(pop.draft.end_at), allDay: !!pop.draft.all_day, title: pop.draft.title }
    : null;
  const ghostCal = (pop?.kind === "quick" && pop.draft.calendar_id && calMap[pop.draft.calendar_id]) || calendars.find((c) => c.kind === "personal") || calendars[0];
  const ghostColor = ghostCal?.color ?? "#039be5";
  const highlight = view === "week" || view === "4day" ? { start, end } : null;

  let body: React.ReactNode;
  if (calsQ.isLoading) body = <Loading label="Loading calendars…" />;
  else if (calsQ.error) body = <div className="p-10 text-center text-sm text-danger">{calsQ.error.message}</div>;
  else if (search) body = searchQ.isLoading ? <Loading label="Searching…" /> : (
    <ScheduleView events={asEvents(searchQ.data)} cals={calMap} onEventClick={openEvent} onDayClick={goDay} emptyText={`No events match “${search}”`} />
  );
  else if (view === "month") body = <MonthView days={days} anchor={date} events={events} cals={calMap} onEventClick={openEvent} onSelect={onSelect} onMove={onMove} onDayClick={goDay} onMore={(d, r) => setPop({ kind: "more", day: d, rect: toRect(r) })} />;
  else if (view === "year") body = <YearView date={date} events={events} onDayClick={goDay} />;
  else if (view === "schedule") body = <ScheduleView events={events} cals={calMap} from={start} onEventClick={openEvent} onDayClick={goDay} onCreate={newEvent} />;
  else body = <TimeGrid days={days} events={events} cals={calMap} ghost={ghost} ghostColor={ghostColor} onEventClick={openEvent} onSelect={onSelect} onMove={onMove} onDayClick={goDay} />;

  return (
    <div className="flex h-full flex-col bg-bg">
      <TopBar onToggleSidebar={toggleSidebar} view={view} setView={(v) => { setView(v); setSearch(null); }} title={periodTitle(view, date)}
        onToday={() => { setDate(startOfDay(new Date())); setPop(null); }} onPrev={() => { setDate((d) => step(view, d, -1)); setPop(null); }} onNext={() => { setDate((d) => step(view, d, 1)); setPop(null); }}
        search={search} setSearch={(q) => { setSearch(q); setPop(null); }} searchFocusKey={searchFocus} />
      <div className="flex min-h-0 flex-1">
        {sidebar && (
          <CalSidebar date={date} onPick={(d) => { setDate(startOfDay(d)); setPop(null); setSearch(null); if (view === "year") setView("day"); }} highlight={highlight}
            calendars={calendars} hidden={hidden} setHidden={setHidden} onCreateEvent={newEvent} onCreateAppointment={newAppointment}
            person={person} setPerson={(p) => { setPerson(p); if (p && view !== "schedule") setView("schedule"); }} onBook={setBookFor}
            canEditShared={!!me.data && me.data.role !== "rep"} />
        )}
        <div className="relative min-w-0 flex-1 overflow-hidden border-l border-border">
          {eventsQ.isFetching && !eventsQ.isLoading && <div className="absolute inset-x-0 top-0 z-30 h-0.5 animate-pulse bg-accent/60" />}
          {body}
        </div>
      </div>

      {pop?.kind === "event" && (
        <AnchoredPopover rect={pop.rect} onClose={() => setPop(null)}>
          <EventDetail ev={pop.ev} color={eventColor(pop.ev, calMap)} calendarName={(pop.ev.calendar_id && calMap[pop.ev.calendar_id]?.name) || pop.ev.calendar?.name || "Calendar"}
            onClose={() => setPop(null)} onEdit={() => { setEditor({ draft: pop.ev, mode: "event" }); setPop(null); }} />
        </AnchoredPopover>
      )}
      {pop?.kind === "quick" && (
        <AnchoredPopover rect={pop.rect} onClose={() => setPop(null)} width={448}>
          <QuickCreate draft={pop.draft} setDraft={(d) => setPop({ ...pop, draft: d })} calendars={calendars} onClose={() => setPop(null)}
            onMore={(d) => { setPop(null); setEditor({ draft: d, mode: d.contact_id ? "appointment" : "event" }); }} />
        </AnchoredPopover>
      )}
      {pop?.kind === "more" && (
        <AnchoredPopover rect={pop.rect} onClose={() => setPop(null)} width={224}>
          <DayList day={pop.day} events={events} cals={calMap} onClose={() => setPop(null)} onDayClick={goDay} onEventClick={openEvent} />
        </AnchoredPopover>
      )}

      <EventEditorDialog open={!!editor} onClose={() => setEditor(null)} draft={editor?.draft ?? null} mode={editor?.mode} />
      <BookAppointmentDialog open={!!bookFor} onClose={() => setBookFor(null)} contactId={bookFor?.id} />
    </div>
  );
}
