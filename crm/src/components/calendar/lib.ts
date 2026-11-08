import {
  addDays, addMinutes, differenceInCalendarDays, endOfDay, format, isSameDay, isSameMonth, isSameYear, startOfDay, startOfMonth,
  startOfWeek, startOfYear, addMonths, addYears, addWeeks,
} from "date-fns";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Attendee = { name?: string; email?: string; phone?: string };
export type CalEvent = {
  id: string; calendar_id: string | null; title: string; description: string | null; location: string | null;
  start_at: string; end_at: string; all_day: boolean; color: string | null;
  contact_id: string | null; company_id: string | null; vehicle_id: string | null;
  status: "confirmed" | "tentative" | "cancelled" | "no_show" | "completed"; source: string;
  calendly_uri: string | null; meeting_url: string | null; attendees: Attendee[];
  calendar?: { id: string; name: string; color: string; kind: string } | null;
  contact?: { id: string; first_name: string; last_name: string; phone: string | null; email: string | null; status: string } | null;
  company?: { id: string; name: string } | null;
  vehicle?: { id: string; year: number | null; make: string | null; model: string | null; plate?: string | null } | null;
};
export type Calendar = { id: string; name: string; color: string; kind: string; owner_id: string | null; sort: number };
/** A new or existing event being edited. */
export type Draft = Partial<CalEvent> & { start_at: string; end_at: string };

export type View = "day" | "week" | "month" | "year" | "schedule" | "4day";
export const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "day", label: "Day", key: "D" },
  { id: "week", label: "Week", key: "W" },
  { id: "month", label: "Month", key: "M" },
  { id: "year", label: "Year", key: "Y" },
  { id: "schedule", label: "Schedule", key: "A" },
  { id: "4day", label: "4 days", key: "X" },
];

export const PALETTE: { name: string; hex: string }[] = [
  { name: "Tomato", hex: "#d50000" }, { name: "Flamingo", hex: "#e67c73" }, { name: "Tangerine", hex: "#f4511e" },
  { name: "Banana", hex: "#f6bf26" }, { name: "Sage", hex: "#33b679" }, { name: "Basil", hex: "#0b8043" },
  { name: "Peacock", hex: "#039be5" }, { name: "Blueberry", hex: "#3f51b5" }, { name: "Lavender", hex: "#7986cb" },
  { name: "Grape", hex: "#8e24aa" }, { name: "Graphite", hex: "#616161" },
];
export const colorName = (hex: string | null | undefined) => PALETTE.find((p) => p.hex.toLowerCase() === (hex ?? "").toLowerCase())?.name ?? hex ?? "";

export const STATUS_LABEL: Record<string, string> = { confirmed: "Confirmed", tentative: "Tentative", cancelled: "Cancelled", no_show: "No-show", completed: "Completed" };

export const HOUR = 48; // px per hour
export const SNAP = 15; // minutes

export const WEEK_OPTS = { weekStartsOn: 0 as const };

export function rangeFor(view: View, date: Date): { start: Date; end: Date; days: Date[] } {
  let start: Date, n: number;
  switch (view) {
    case "day": start = startOfDay(date); n = 1; break;
    case "4day": start = startOfDay(date); n = 4; break;
    case "week": start = startOfWeek(date, WEEK_OPTS); n = 7; break;
    case "month": start = startOfWeek(startOfMonth(date), WEEK_OPTS); n = 42; break;
    case "year": { start = startOfYear(date); const end = addYears(start, 1); return { start, end, days: [] }; }
    case "schedule": start = startOfDay(date); n = 60; break;
  }
  const days = Array.from({ length: n }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, n), days };
}

export function step(view: View, date: Date, dir: 1 | -1): Date {
  switch (view) {
    case "day": return addDays(date, dir);
    case "4day": return addDays(date, 4 * dir);
    case "week": return addWeeks(date, dir);
    case "month": return addMonths(date, dir);
    case "year": return addYears(date, dir);
    case "schedule": return addDays(date, 30 * dir);
  }
}

export function periodTitle(view: View, date: Date): string {
  if (view === "day") return format(date, "MMMM d, yyyy");
  if (view === "month") return format(date, "MMMM yyyy");
  if (view === "year") return format(date, "yyyy");
  const { start, end } = rangeFor(view, date);
  const last = addDays(end, -1);
  if (isSameMonth(start, last)) return format(start, "MMMM yyyy");
  if (isSameYear(start, last)) return `${format(start, "MMM")} – ${format(last, "MMM yyyy")}`;
  return `${format(start, "MMM yyyy")} – ${format(last, "MMM yyyy")}`;
}

export function gmtLabel(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const m = Math.abs(off) % 60;
  return `GMT${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

/** "10am", "10:30am" */
export function fmtTime(d: Date) {
  return (d.getMinutes() ? format(d, "h:mm") : format(d, "h")) + format(d, "a").toLowerCase();
}
/** "10:00 – 11:00am", "11:30am – 1:00pm" */
export function fmtRange(s: Date, e: Date) {
  const sameMer = format(s, "a") === format(e, "a");
  return `${format(s, "h:mm")}${sameMer ? "" : format(s, "a").toLowerCase()} – ${format(e, "h:mm")}${format(e, "a").toLowerCase()}`;
}
/** Google-style detail line, e.g. "Sunday, November 8 ⋅ 10:00 – 11:00am" */
export function fmtWhen(ev: { start_at: string; end_at: string; all_day?: boolean | null }) {
  const s = new Date(ev.start_at), e = new Date(ev.end_at);
  if (ev.all_day) {
    const last = addDays(e, -1);
    return isSameDay(s, last) || last < s ? format(s, "EEEE, MMMM d") : `${format(s, "MMMM d")} – ${format(last, "MMMM d, yyyy")}`;
  }
  if (isSameDay(s, e) || (e.getHours() === 0 && e.getMinutes() === 0 && differenceInCalendarDays(e, s) === 1)) return `${format(s, "EEEE, MMMM d")} ⋅ ${fmtRange(s, e)}`;
  return `${format(s, "MMMM d, yyyy, h:mma").replace(/(AM|PM)$/, (m) => m.toLowerCase())} – ${format(e, "MMMM d, yyyy, h:mma").replace(/(AM|PM)$/, (m) => m.toLowerCase())}`;
}

export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const snap = (min: number, to = SNAP) => Math.round(min / to) * to;
export const snapDown = (min: number, to = SNAP) => Math.floor(min / to) * to;
export const atMinutes = (day: Date, min: number) => addMinutes(startOfDay(day), min);

/** Events that render in the all-day strip (all_day or 24h+). */
export function isAllDayish(ev: CalEvent) {
  return ev.all_day || new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime() >= 86400000;
}

export function eventColor(ev: Pick<CalEvent, "color" | "calendar_id" | "calendar">, cals: Record<string, Calendar | undefined>) {
  return ev.color || (ev.calendar_id ? cals[ev.calendar_id]?.color : undefined) || ev.calendar?.color || "#039be5";
}

/** Timed-event segments for a day (clipped). */
export function segmentsForDay(events: CalEvent[], day: Date) {
  const ds = startOfDay(day), de = endOfDay(day);
  const out: { ev: CalEvent; start: Date; end: Date }[] = [];
  for (const ev of events) {
    if (isAllDayish(ev)) continue;
    const s = new Date(ev.start_at), e = new Date(ev.end_at);
    if (e <= ds || s > de) continue;
    out.push({ ev, start: s < ds ? ds : s, end: e > de ? addDays(ds, 1) : e });
  }
  return out;
}

/** Side-by-side layout of overlapping segments. */
export function layoutOverlaps<T extends { start: Date; end: Date }>(segs: T[]): (T & { col: number; cols: number })[] {
  const sorted = [...segs].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: (T & { col: number; cols: number })[] = [];
  let cluster: (T & { col: number; cols: number })[] = [];
  let colsEnd: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => { const n = colsEnd.length; for (const c of cluster) c.cols = n; out.push(...cluster); cluster = []; colsEnd = []; };
  for (const s of sorted) {
    const st = s.start.getTime();
    const en = Math.max(s.end.getTime(), st + 15 * 60000); // min visual height
    if (st >= clusterEnd && cluster.length) flush();
    let col = colsEnd.findIndex((end) => end <= st);
    if (col === -1) { col = colsEnd.length; colsEnd.push(en); } else colsEnd[col] = en;
    cluster.push({ ...s, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd === -Infinity ? en : clusterEnd, en);
  }
  if (cluster.length) flush();
  return out;
}

/** Lane layout for items spanning day indexes [a, b] inclusive within a row of days. */
export function layoutLanes<T extends { a: number; b: number }>(items: T[]): (T & { lane: number })[] {
  const lanes: number[][] = [];
  return items.map((it) => {
    let lane = lanes.findIndex((occ) => occ.every((d) => d < it.a || d > it.b));
    if (lane === -1) { lane = lanes.length; lanes.push([]); }
    for (let d = it.a; d <= it.b; d++) lanes[lane]!.push(d);
    return { ...it, lane };
  });
}

/** Map an event onto day indexes of a visible row. */
export function spanIn(ev: CalEvent, rowStart: Date, n: number) {
  const s = new Date(ev.start_at), e = new Date(ev.end_at);
  const lastMoment = new Date(Math.max(s.getTime(), e.getTime() - 1));
  let a = differenceInCalendarDays(s, rowStart), b = differenceInCalendarDays(lastMoment, rowStart);
  if (b < 0 || a > n - 1) return null;
  const clippedLeft = a < 0, clippedRight = b > n - 1;
  a = Math.max(0, a); b = Math.min(n - 1, b);
  return { a, b, clippedLeft, clippedRight };
}

export function nextHalfHour(d = new Date()) {
  const m = minutesOf(d);
  return atMinutes(d, Math.ceil((m + 1) / 30) * 30);
}

export function defaultDraft(date: Date, extra: Partial<Draft> = {}): Draft {
  const base = isSameDay(date, new Date()) ? nextHalfHour() : atMinutes(date, 9 * 60);
  return { title: "", start_at: base.toISOString(), end_at: addMinutes(base, 60).toISOString(), all_day: false, status: "confirmed", ...extra };
}

export function vehicleLabel(v: { year?: number | null; make?: string | null; model?: string | null; plate?: string | null } | null | undefined) {
  if (!v) return "";
  return [v.year, v.make, v.model].filter(Boolean).join(" ") + (v.plate ? ` · ${v.plate}` : "") || "Vehicle";
}

export function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = window.localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function writeLocal(key: string, v: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}
export const asEvents = (x: unknown) => (x ?? []) as CalEvent[];
export const asCalendars = (x: unknown) => (x ?? []) as Calendar[];
export type AnyRec = Record<string, any>;
