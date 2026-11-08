"use client";
import { useMemo } from "react";
import { addDays, format, isToday, startOfDay } from "date-fns";
import { CalendarSearch, Check } from "lucide-react";
import { cn, fullName } from "@/lib/utils";
import { eventColor, fmtRange, isAllDayish, type CalEvent, type Calendar } from "@/components/calendar/lib";
import type { Rect } from "./popover";

/** Agenda list grouped by day. If `from` is given, only days >= from are listed (schedule view). */
export function ScheduleView({ events, cals, from, onEventClick, onDayClick, emptyText, onCreate }: {
  events: CalEvent[]; cals: Record<string, Calendar>; from?: Date; onEventClick: (ev: CalEvent, rect: Rect) => void; onDayClick: (d: Date) => void;
  emptyText?: string; onCreate?: () => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, { day: Date; items: CalEvent[] }>();
    for (const e of events) {
      let d = startOfDay(new Date(e.start_at));
      const end = new Date(e.end_at);
      if (from && d < from) d = startOfDay(from);
      let guard = 0;
      do {
        const k = format(d, "yyyy-MM-dd");
        if (!m.has(k)) m.set(k, { day: d, items: [] });
        m.get(k)!.items.push(e);
        d = addDays(d, 1);
      } while (d < end && ++guard < 62);
    }
    const out = Array.from(m.values()).sort((a, b) => a.day.getTime() - b.day.getTime());
    for (const g of out) g.items.sort((a, b) => Number(isAllDayish(b)) - Number(isAllDayish(a)) || a.start_at.localeCompare(b.start_at));
    return out;
  }, [events, from]);

  if (!groups.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
        <CalendarSearch className="h-16 w-16 text-faint" strokeWidth={1.2} />
        <div className="text-sm">{emptyText ?? "Nothing planned. Enjoy the free time!"}</div>
        {onCreate && <button type="button" onClick={onCreate} className="text-sm font-medium text-accent hover:underline">Create an event</button>}
      </div>
    );
  }
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      {groups.map(({ day, items }) => (
        <div key={day.toISOString()} className="flex border-b border-border px-4 py-2">
          <button type="button" onClick={() => onDayClick(day)} className="flex w-28 shrink-0 items-start gap-2 pt-0.5 text-left">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none", isToday(day) ? "bg-accent text-accent-fg" : "text-fg hover:bg-hover")}>{format(day, "d")}</span>
            <span className={cn("pt-2 text-[11px] font-medium uppercase", isToday(day) ? "text-accent" : "text-muted")}>{format(day, "MMM, EEE")}</span>
          </button>
          <div className="min-w-0 flex-1">
            {items.map((ev) => {
              const s = new Date(ev.start_at), e = new Date(ev.end_at);
              return (
                <button key={ev.id + day.toISOString()} type="button" onClick={(x) => onEventClick(ev, x.currentTarget.getBoundingClientRect())}
                  className="flex h-9 w-full items-center gap-4 rounded px-2 text-left text-sm hover:bg-hover">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: eventColor(ev, cals) }} />
                  <span className="w-40 shrink-0 text-muted">{isAllDayish(ev) ? "All day" : fmtRange(s, e)}</span>
                  <span className={cn("min-w-0 flex-1 truncate font-medium", ev.status === "cancelled" && "line-through text-muted")}>
                    {ev.status === "completed" && <Check className="mr-1 inline h-3.5 w-3.5 text-success" />}{ev.title}
                    {ev.contact && <span className="ml-2 font-normal text-muted">{fullName(ev.contact)}</span>}
                  </span>
                  {ev.status !== "confirmed" && <span className="shrink-0 text-xs text-faint">{ev.status.replace("_", "-")}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
