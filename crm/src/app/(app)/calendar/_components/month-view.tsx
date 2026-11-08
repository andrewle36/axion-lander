"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, isSameMonth, isToday, parseISO, startOfDay } from "date-fns";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventColor, fmtTime, isAllDayish, layoutLanes, spanIn, type CalEvent, type Calendar } from "@/components/calendar/lib";
import type { Rect } from "./popover";

const LANE = 22;
const HEAD = 28;

type Props = {
  days: Date[]; anchor: Date; events: CalEvent[]; cals: Record<string, Calendar>;
  onEventClick: (ev: CalEvent, rect: Rect) => void;
  onSelect: (start: Date, end: Date, allDay: boolean, rect: Rect) => void;
  onMove: (ev: CalEvent, start: Date, end: Date, allDay?: boolean) => void;
  onDayClick: (d: Date) => void;
  onMore: (d: Date, rect: Rect) => void;
};

export function MonthView({ days, anchor, events, cals, onEventClick, onSelect, onMove, onDayClick, onMore }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(120);
  useEffect(() => {
    const el = rowRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setRowH(el.clientHeight));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const maxLanes = Math.max(1, Math.floor((rowH - HEAD - 4) / LANE));

  const [drag, setDrag] = useState<{ ev: CalEvent; from: string; over: string | null; x0: number; y0: number; moved: boolean; el: HTMLElement } | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;

  const startDrag = (e: React.PointerEvent, ev: CalEvent, dayKey: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    setDrag({ ev, from: dayKey, over: dayKey, x0: e.clientX, y0: e.clientY, moved: false, el });
    document.body.style.userSelect = "none";
    const mv = (pe: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const moved = d.moved || Math.abs(pe.clientX - d.x0) + Math.abs(pe.clientY - d.y0) > 4;
      const cell = (document.elementFromPoint(pe.clientX, pe.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-day]");
      setDrag({ ...d, moved, over: cell?.dataset.day ?? d.over });
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      const d = dragRef.current; setDrag(null);
      if (!d) return;
      if (!d.moved) { onEventClick(d.ev, d.el.getBoundingClientRect()); return; }
      if (d.over && d.over !== d.from) {
        const delta = differenceInCalendarDays(parseISO(d.over), parseISO(d.from));
        onMove(d.ev, addDays(new Date(d.ev.start_at), delta), addDays(new Date(d.ev.end_at), delta), d.ev.all_day);
      }
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  const weeks = useMemo(() => Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7)), [days]);

  const rows = useMemo(() => weeks.map((wk) => {
    const items = events
      .map((ev) => { const sp = spanIn(ev, wk[0]!, 7); return sp ? { ev, ...sp, multi: isAllDayish(ev) } : null; })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => x.a - y.a || Number(y.multi) - Number(x.multi) || (y.b - y.a) - (x.b - x.a) || x.ev.start_at.localeCompare(y.ev.start_at));
    const laid = layoutLanes(items);
    const count = Array.from({ length: 7 }, (_, d) => laid.filter((i) => i.a <= d && i.b >= d).length);
    const limit = count.map((c) => (c > maxLanes ? maxLanes - 1 : maxLanes));
    const visible = laid.filter((i) => { for (let d = i.a; d <= i.b; d++) if (i.lane >= limit[d]!) return false; return true; });
    const hidden = count.map((c, d) => c - visible.filter((i) => i.a <= d && i.b >= d).length);
    return { wk, visible, hidden };
  }), [weeks, events, maxLanes]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {weeks[0]?.map((d) => <div key={d.toISOString()} className="border-l border-border pt-1.5 text-center text-[11px] font-medium uppercase text-muted first:border-l-0">{format(d, "EEE")}</div>)}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {rows.map(({ wk, visible, hidden }, wi) => (
          <div key={wi} ref={wi === 0 ? rowRef : undefined} className="relative min-h-0 flex-1 border-b border-border last:border-b-0">
            <div className="absolute inset-0 grid grid-cols-7">
              {wk.map((d, di) => {
                const key = format(d, "yyyy-MM-dd");
                const out = !isSameMonth(d, anchor);
                const over = drag?.moved && drag.over === key;
                return (
                  <div key={key} data-day={key}
                    className={cn("relative border-l border-border first:border-l-0", over && "bg-accent-soft")}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || e.target !== e.currentTarget) return;
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      onSelect(startOfDay(d), addDays(startOfDay(d), 1), true, r);
                    }}>
                    <div className="flex justify-center pt-1">
                      <button type="button" onClick={() => onDayClick(d)}
                        className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                          isToday(d) ? "bg-accent text-accent-fg" : out ? "text-faint hover:bg-hover" : "text-fg hover:bg-hover")}>
                        {d.getDate() === 1 ? format(d, "MMM d") : format(d, "d")}
                      </button>
                    </div>
                    {hidden[di]! > 0 && (
                      <button type="button" onClick={(e) => onMore(d, (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect())}
                        className="absolute left-1 right-1 rounded px-1.5 text-left text-xs font-medium text-fg hover:bg-hover"
                        style={{ top: HEAD + (maxLanes - 1) * LANE, height: LANE - 2 }}>
                        {hidden[di]} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {visible.map(({ ev, a, b, lane, multi, clippedLeft, clippedRight }) => {
              const color = eventColor(ev, cals);
              const s = new Date(ev.start_at);
              const dragging = drag?.moved && drag.ev.id === ev.id;
              const style = { left: `calc(${(a / 7) * 100}% + 4px)`, width: `calc(${((b - a + 1) / 7) * 100}% - 8px)`, top: HEAD + lane * LANE, height: LANE - 2 };
              return multi ? (
                <div key={ev.id} onPointerDown={(e) => startDrag(e, ev, format(wk[a]!, "yyyy-MM-dd"))} style={{ ...style, background: color }}
                  className={cn("absolute z-10 flex cursor-pointer items-center truncate px-2 text-xs font-medium text-white hover:brightness-95",
                    clippedLeft ? "rounded-l-none" : "rounded-l", clippedRight ? "rounded-r-none" : "rounded-r",
                    ev.status === "cancelled" && "line-through opacity-60", dragging && "opacity-50")}>
                  {ev.status === "completed" && <Check className="mr-1 h-3 w-3 shrink-0" />}<span className="truncate">{ev.title}</span>
                </div>
              ) : (
                <div key={ev.id} onPointerDown={(e) => startDrag(e, ev, format(wk[a]!, "yyyy-MM-dd"))} style={style}
                  className={cn("absolute z-10 flex cursor-pointer items-center gap-1.5 truncate rounded px-1.5 text-xs text-fg hover:bg-hover",
                    ev.status === "cancelled" && "line-through opacity-60", dragging && "opacity-50")}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="shrink-0 text-muted">{fmtTime(s)}</span>
                  <span className="truncate font-medium">{ev.title}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Content of the "+N more" popover: all events of a single day. */
export function DayList({ day, events, cals, onEventClick, onClose, onDayClick }: {
  day: Date; events: CalEvent[]; cals: Record<string, Calendar>; onEventClick: (ev: CalEvent, rect: Rect) => void; onClose: () => void; onDayClick: (d: Date) => void;
}) {
  const ds = startOfDay(day), de = addDays(ds, 1);
  const list = events.filter((e) => new Date(e.start_at) < de && new Date(e.end_at) > ds)
    .sort((a, b) => Number(isAllDayish(b)) - Number(isAllDayish(a)) || a.start_at.localeCompare(b.start_at));
  return (
    <div className="p-3">
      <div className="flex items-start justify-between">
        <div className="w-full text-center">
          <div className="text-[11px] font-medium uppercase text-muted">{format(day, "EEE")}</div>
          <button type="button" onClick={() => { onDayClick(day); onClose(); }}
            className={cn("mx-auto mt-0.5 flex h-11 w-11 items-center justify-center rounded-full text-[24px]", isToday(day) ? "bg-accent text-accent-fg" : "hover:bg-hover")}>{format(day, "d")}</button>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2 top-2 rounded-full p-1.5 text-muted hover:bg-hover">✕</button>
      </div>
      <div className="mt-2 space-y-0.5">
        {list.map((ev) => {
          const color = eventColor(ev, cals);
          return isAllDayish(ev) ? (
            <button key={ev.id} type="button" onClick={(e) => onEventClick(ev, e.currentTarget.getBoundingClientRect())}
              className={cn("block w-full truncate rounded px-2 py-0.5 text-left text-xs font-medium text-white", ev.status === "cancelled" && "line-through opacity-60")} style={{ background: color }}>{ev.title}</button>
          ) : (
            <button key={ev.id} type="button" onClick={(e) => onEventClick(ev, e.currentTarget.getBoundingClientRect())}
              className={cn("flex w-full items-center gap-1.5 truncate rounded px-2 py-0.5 text-left text-xs hover:bg-hover", ev.status === "cancelled" && "line-through opacity-60")}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="text-muted">{fmtTime(new Date(ev.start_at))}</span><span className="truncate font-medium">{ev.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
