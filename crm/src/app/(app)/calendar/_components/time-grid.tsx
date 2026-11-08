"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMinutes, differenceInMinutes, format, isSameDay, isToday, startOfDay } from "date-fns";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HOUR, atMinutes, eventColor, fmtRange, fmtTime, gmtLabel, isAllDayish, layoutLanes, layoutOverlaps, minutesOf, segmentsForDay, snap, snapDown, spanIn,
  type CalEvent, type Calendar,
} from "@/components/calendar/lib";
import type { Rect } from "./popover";

export type Ghost = { start: Date; end: Date; allDay: boolean; title?: string } | null;
type Props = {
  days: Date[]; events: CalEvent[]; cals: Record<string, Calendar>; ghost: Ghost; ghostColor: string;
  onEventClick: (ev: CalEvent, rect: Rect) => void;
  onSelect: (start: Date, end: Date, allDay: boolean, rect: Rect) => void;
  onMove: (ev: CalEvent, start: Date, end: Date, allDay?: boolean) => void;
  onDayClick: (d: Date) => void;
};
type Drag =
  | { kind: "create"; idx: number; a: number; b: number }
  | { kind: "move"; ev: CalEvent; offset: number; dur: number; x0: number; y0: number; moved: boolean; el: HTMLElement; start: Date; end: Date }
  | { kind: "resize"; ev: CalEvent; dayIdx: number; start: Date; end: Date }
  | { kind: "allCreate"; a: number; b: number }
  | { kind: "allMove"; ev: CalEvent; idx0: number; delta: number; x0: number; moved: boolean; el: HTMLElement };

const GUTTER = 64;
const LANE = 24;

export function TimeGrid({ days, events, cals, ghost, ghostColor, onEventClick, onSelect, onMove, onDayClick }: Props) {
  const n = days.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const allRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);

  // initial scroll: a bit before now if today is visible, else 7am
  const firstKey = days[0]?.toDateString();
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const showsToday = days.some((d) => isToday(d));
    el.scrollTop = showsToday ? Math.max(0, (minutesOf(new Date()) / 60 - 2) * HOUR) : 7 * HOUR;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, n]);

  const set = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  const posTimed = (x: number, y: number) => {
    const r = colsRef.current!.getBoundingClientRect();
    const idx = Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)));
    const min = Math.max(0, Math.min(1440, ((y - r.top) / HOUR) * 60));
    return { idx, min, r };
  };
  const posAll = (x: number) => {
    const r = allRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((x - r.left) / r.width) * n)));
  };

  const listen = (onMoveFn: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) => {
    document.body.style.userSelect = "none";
    const mv = (e: PointerEvent) => onMoveFn(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      onUp(e);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };

  /* ----- timed: create ----- */
  const startCreate = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const { idx, min } = posTimed(e.clientX, e.clientY);
    const a = Math.min(1425, snapDown(min));
    set({ kind: "create", idx, a, b: a });
    listen((ev) => {
      const d = dragRef.current; if (d?.kind !== "create") return;
      const p = posTimed(ev.clientX, ev.clientY);
      set({ ...d, b: Math.min(1425, snapDown(p.min)) });
    }, () => {
      const d = dragRef.current; set(null);
      if (d?.kind !== "create") return;
      const r = colsRef.current!.getBoundingClientRect();
      let s: number, en: number;
      if (d.a === d.b) { s = snapDown(d.a, 30); en = Math.min(1440, s + 60); }
      else { s = Math.min(d.a, d.b); en = Math.min(1440, Math.max(d.a, d.b) + 15); }
      const colW = r.width / n;
      onSelect(atMinutes(days[d.idx]!, s), atMinutes(days[d.idx]!, en), false,
        { left: r.left + d.idx * colW, top: r.top + (s / 60) * HOUR, width: colW, height: ((en - s) / 60) * HOUR });
    });
  };

  /* ----- timed: move ----- */
  const startMove = (e: React.PointerEvent, ev: CalEvent, segDay: Date) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const s = new Date(ev.start_at), en = new Date(ev.end_at);
    const { min } = posTimed(e.clientX, e.clientY);
    const startMin = differenceInMinutes(s, startOfDay(segDay));
    set({ kind: "move", ev, offset: min - startMin, dur: differenceInMinutes(en, s), x0: e.clientX, y0: e.clientY, moved: false, el, start: s, end: en });
    listen((pe) => {
      const d = dragRef.current; if (d?.kind !== "move") return;
      const moved = d.moved || Math.abs(pe.clientX - d.x0) + Math.abs(pe.clientY - d.y0) > 4;
      if (!moved) return;
      const p = posTimed(pe.clientX, pe.clientY);
      const sm = Math.max(0, Math.min(1440 - 15, snap(p.min - d.offset)));
      const ns = atMinutes(days[p.idx]!, sm);
      set({ ...d, moved, start: ns, end: addMinutes(ns, d.dur) });
    }, () => {
      const d = dragRef.current; set(null);
      if (d?.kind !== "move") return;
      if (!d.moved) { onEventClick(d.ev, d.el.getBoundingClientRect()); return; }
      if (d.start.getTime() !== new Date(d.ev.start_at).getTime()) onMove(d.ev, d.start, d.end);
    });
  };

  /* ----- timed: resize ----- */
  const startResize = (e: React.PointerEvent, ev: CalEvent, dayIdx: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = new Date(ev.start_at);
    set({ kind: "resize", ev, dayIdx, start: s, end: new Date(ev.end_at) });
    listen((pe) => {
      const d = dragRef.current; if (d?.kind !== "resize") return;
      const p = posTimed(pe.clientX, pe.clientY);
      let end = atMinutes(days[d.dayIdx]!, snap(p.min));
      if (end.getTime() - d.start.getTime() < 15 * 60000) end = addMinutes(d.start, 15);
      set({ ...d, end });
    }, () => {
      const d = dragRef.current; set(null);
      if (d?.kind !== "resize") return;
      if (d.end.getTime() !== new Date(d.ev.end_at).getTime()) onMove(d.ev, d.start, d.end);
    });
  };

  /* ----- all-day row ----- */
  const startAllCreate = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const idx = posAll(e.clientX);
    set({ kind: "allCreate", a: idx, b: idx });
    listen((pe) => { const d = dragRef.current; if (d?.kind === "allCreate") set({ ...d, b: posAll(pe.clientX) }); }, () => {
      const d = dragRef.current; set(null);
      if (d?.kind !== "allCreate") return;
      const a = Math.min(d.a, d.b), b = Math.max(d.a, d.b);
      const r = allRef.current!.getBoundingClientRect(); const colW = r.width / n;
      onSelect(startOfDay(days[a]!), addDays(startOfDay(days[b]!), 1), true, { left: r.left + a * colW, top: r.top, width: (b - a + 1) * colW, height: LANE });
    });
  };
  const startAllMove = (e: React.PointerEvent, ev: CalEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const idx0 = posAll(e.clientX);
    set({ kind: "allMove", ev, idx0, delta: 0, x0: e.clientX, moved: false, el });
    listen((pe) => {
      const d = dragRef.current; if (d?.kind !== "allMove") return;
      const moved = d.moved || Math.abs(pe.clientX - d.x0) > 4;
      set({ ...d, moved, delta: posAll(pe.clientX) - d.idx0 });
    }, () => {
      const d = dragRef.current; set(null);
      if (d?.kind !== "allMove") return;
      if (!d.moved) { onEventClick(d.ev, d.el.getBoundingClientRect()); return; }
      if (d.delta) onMove(d.ev, addDays(new Date(d.ev.start_at), d.delta), addDays(new Date(d.ev.end_at), d.delta), d.ev.all_day);
    });
  };

  /* ----- derived (apply drag previews) ----- */
  const shown = useMemo(() => {
    if (!drag) return events;
    if (drag.kind === "move" && drag.moved) return events.map((e) => (e.id === drag.ev.id ? { ...e, start_at: drag.start.toISOString(), end_at: drag.end.toISOString() } : e));
    if (drag.kind === "resize") return events.map((e) => (e.id === drag.ev.id ? { ...e, end_at: drag.end.toISOString() } : e));
    if (drag.kind === "allMove" && drag.delta) return events.map((e) => (e.id === drag.ev.id ? { ...e, start_at: addDays(new Date(e.start_at), drag.delta).toISOString(), end_at: addDays(new Date(e.end_at), drag.delta).toISOString() } : e));
    return events;
  }, [events, drag]);

  const allDayItems = useMemo(() => {
    const items = shown.filter(isAllDayish)
      .map((ev) => { const sp = spanIn(ev, days[0]!, n); return sp ? { ev, ...sp } : null; })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));
    return layoutLanes(items);
  }, [shown, days, n]);
  const ghostAll = ghost?.allDay ? spanIn({ start_at: ghost.start.toISOString(), end_at: ghost.end.toISOString() } as CalEvent, days[0]!, n) : null;
  const allCreate = drag?.kind === "allCreate" ? { a: Math.min(drag.a, drag.b), b: Math.max(drag.a, drag.b) } : null;
  const lanes = Math.max(1, ...allDayItems.map((i) => i.lane + 1)) + (ghostAll || allCreate ? 1 : 0);

  const perDay = useMemo(() => days.map((d) => layoutOverlaps(segmentsForDay(shown, d))), [shown, days]);

  const gridCols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const big = n === 1;

  return (
    <div ref={scrollRef} className="scroll-thin relative h-full overflow-y-auto">
      {/* header + all-day strip (sticky) */}
      <div className="sticky top-0 z-20 bg-bg">
        <div className="flex">
          <div style={{ width: GUTTER }} className="shrink-0" />
          <div className="grid flex-1" style={gridCols}>
            {days.map((d) => {
              const today = isToday(d);
              return (
                <div key={d.toISOString()} className={cn("flex flex-col pt-2", big ? "items-start pl-3" : "items-center")}>
                  <div className={cn("text-[11px] font-medium uppercase tracking-wide", today ? "text-accent" : "text-muted")}>{format(d, "EEE")}</div>
                  <button type="button" onClick={() => onDayClick(d)}
                    className={cn("mt-0.5 flex h-[46px] w-[46px] items-center justify-center rounded-full text-[26px] leading-none",
                      today ? "bg-accent text-accent-fg" : "text-fg hover:bg-hover")}>
                    {format(d, "d")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex border-b border-border">
          <div style={{ width: GUTTER }} className="flex shrink-0 items-end justify-end pb-1 pr-2 text-[10px] text-muted">{gmtLabel()}</div>
          <div ref={allRef} className="relative flex-1 cursor-default" style={{ height: lanes * LANE + 6 }} onPointerDown={startAllCreate}>
            <div className="pointer-events-none absolute inset-0 grid" style={gridCols}>
              {days.map((d) => <div key={d.toISOString()} className="border-l border-border" />)}
            </div>
            {allDayItems.map(({ ev, a, b, lane, clippedLeft, clippedRight }) => {
              const color = eventColor(ev, cals);
              const dragging = drag?.kind === "allMove" && drag.ev.id === ev.id && drag.moved;
              return (
                <div key={ev.id} onPointerDown={(e) => startAllMove(e, ev)}
                  className={cn("absolute flex cursor-pointer items-center truncate px-2 text-xs font-medium text-white shadow-sm hover:brightness-95",
                    clippedLeft ? "rounded-l-none" : "rounded-l", clippedRight ? "rounded-r-none" : "rounded-r",
                    ev.status === "cancelled" && "line-through opacity-60", dragging && "z-10 opacity-80 shadow-pop")}
                  style={{ left: `calc(${(a / n) * 100}% + 2px)`, width: `calc(${((b - a + 1) / n) * 100}% - 6px)`, top: 2 + lane * LANE, height: LANE - 2, background: color }}>
                  {ev.status === "completed" && <Check className="mr-1 h-3 w-3 shrink-0" />}<span className="truncate">{ev.title}</span>
                </div>
              );
            })}
            {(allCreate || ghostAll) && (() => {
              const g = allCreate ?? ghostAll!;
              return (
                <div className="pointer-events-none absolute flex items-center truncate rounded px-2 text-xs font-medium text-white shadow-pop"
                  style={{ left: `calc(${(g.a / n) * 100}% + 2px)`, width: `calc(${((g.b - g.a + 1) / n) * 100}% - 6px)`, top: 2 + (lanes - 1) * LANE, height: LANE - 2, background: ghostColor }}>
                  {ghost?.title || "(No title)"}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* time grid */}
      <div className="flex">
        <div style={{ width: GUTTER, height: 24 * HOUR }} className="relative shrink-0">
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <div key={h} className="absolute right-0 flex items-center" style={{ top: h * HOUR - 7 }}>
              <span className="pr-2 text-[10px] text-muted">{format(atMinutes(new Date(), h * 60), "h a")}</span>
              <span className="h-px w-2 bg-border" />
            </div>
          ))}
        </div>
        <div ref={colsRef} className="relative grid flex-1" style={{ ...gridCols, height: 24 * HOUR }}>
          {/* hour lines */}
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="border-b border-border" style={{ height: HOUR }} />)}
          </div>
          {days.map((d, di) => (
            <div key={d.toISOString()} className="relative border-l border-border" onPointerDown={startCreate}>
              {perDay[di]!.map(({ ev, start, end, col, cols }) => {
                const color = eventColor(ev, cals);
                const top = (minutesOf(start) / 60) * HOUR;
                const endMin = isSameDay(end, d) ? minutesOf(end) : 1440;
                const h = Math.max(((endMin - minutesOf(start)) / 60) * HOUR, 18);
                const short = h < 40;
                const active = drag && (drag.kind === "move" ? drag.moved : drag.kind === "resize") && (drag as { ev: CalEvent }).ev.id === ev.id;
                const isLastSeg = new Date(ev.end_at) <= addDays(startOfDay(d), 1);
                const s0 = new Date(ev.start_at), e0 = new Date(ev.end_at);
                return (
                  <div key={ev.id + di} onPointerDown={(e) => startMove(e, ev, d)}
                    className={cn("group absolute cursor-pointer overflow-hidden rounded-[5px] border border-bg px-1.5 text-white hover:brightness-95",
                      ev.status === "cancelled" && "opacity-60", ev.status === "no_show" && "opacity-75", active && "z-30 shadow-pop")}
                    style={{ top, height: h - 1, left: `${(col / cols) * 100}%`, width: `calc(${(1 / cols) * 100}% - ${col === cols - 1 ? 8 : 0}px)`, background: color, zIndex: active ? 30 : 1 + col }}>
                    <div className={cn("text-xs leading-[15px]", short ? "flex gap-1 truncate pt-px" : "pt-0.5")}>
                      <div className={cn("truncate font-medium", ev.status === "cancelled" && "line-through")}>
                        {ev.status === "completed" && <Check className="mr-0.5 inline h-3 w-3 align-[-2px]" />}{ev.title}{short && ","}
                      </div>
                      <div className="truncate opacity-90">{short ? fmtTime(s0) : fmtRange(s0, e0)}</div>
                      {!short && h > 56 && ev.location && <div className="truncate opacity-90">{ev.location}</div>}
                    </div>
                    {isLastSeg && <div onPointerDown={(e) => startResize(e, ev, di)} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" />}
                  </div>
                );
              })}

              {/* create-drag preview / quick-create ghost */}
              {drag?.kind === "create" && drag.idx === di && (() => {
                const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b) + 15;
                return <GhostBlock top={(a / 60) * HOUR} height={((b - a) / 60) * HOUR} color={ghostColor} label={fmtRange(atMinutes(d, a), atMinutes(d, b))} />;
              })()}
              {!drag && ghost && !ghost.allDay && isSameDay(ghost.start, d) && (() => {
                const a = minutesOf(ghost.start), b = isSameDay(ghost.end, d) ? minutesOf(ghost.end) : 1440;
                return <GhostBlock top={(a / 60) * HOUR} height={(Math.max(15, b - a) / 60) * HOUR} color={ghostColor} title={ghost.title} label={fmtRange(ghost.start, ghost.end)} />;
              })()}

              {isToday(d) && (
                <div className="pointer-events-none absolute inset-x-0 z-40" style={{ top: (minutesOf(now) / 60) * HOUR - 1 }}>
                  <div className="relative h-0.5 bg-[#ea4335]"><span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-[#ea4335]" /></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GhostBlock({ top, height, color, label, title }: { top: number; height: number; color: string; label: string; title?: string }) {
  return (
    <div className="pointer-events-none absolute left-0 right-2 z-30 overflow-hidden rounded-[5px] px-1.5 pt-0.5 text-xs text-white shadow-pop" style={{ top, height: height - 1, background: color }}>
      <div className="truncate font-medium">{title || "(No title)"}</div>
      <div className="truncate opacity-90">{label}</div>
    </div>
  );
}
