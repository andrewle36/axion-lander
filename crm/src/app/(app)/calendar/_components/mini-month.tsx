"use client";
import { addDays, addMonths, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEK_OPTS } from "@/components/calendar/lib";

/** Google-style mini month. `range` highlights the selected week/period. */
export function MiniMonth({ month, onMonth, selected, range, onPick, busy, compact, showNav = true, title }: {
  month: Date; onMonth?: (d: Date) => void; selected?: Date; range?: { start: Date; end: Date } | null;
  onPick: (d: Date) => void; busy?: Set<string>; compact?: boolean; showNav?: boolean; title?: React.ReactNode;
}) {
  const start = startOfWeek(startOfMonth(month), WEEK_OPTS);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const inRange = (d: Date) => !!range && d >= range.start && d < range.end;
  return (
    <div className="select-none">
      <div className="flex items-center justify-between pb-1 pl-2">
        <div className="text-sm font-medium text-fg">{title ?? format(month, "MMMM yyyy")}</div>
        {showNav && onMonth && (
          <div className="flex">
            <button type="button" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-hover"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))} className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-hover"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-7 text-center">
        {days.slice(0, 7).map((d) => <div key={d.toISOString()} className="py-1 text-[10px] font-medium text-muted">{format(d, "EEEEE")}</div>)}
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const sel = selected && isSameDay(d, selected);
          const today = isToday(d);
          const out = !isSameMonth(d, month);
          if (compact && out) return <div key={key} className="h-7" />;
          return (
            <div key={key} className={cn("flex items-center justify-center py-px", inRange(d) && "bg-accent-soft", inRange(d) && !inRange(addDays(d, 1)) && "rounded-r-full", inRange(d) && !inRange(addDays(d, -1)) && "rounded-l-full")}>
              <button type="button" onClick={() => onPick(d)}
                className={cn("relative flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium",
                  today ? "bg-accent text-accent-fg" : sel ? "bg-accent-soft text-accent" : out ? "text-faint hover:bg-hover" : "text-fg hover:bg-hover")}>
                {d.getDate()}
                {busy?.has(key) && !today && <span className="absolute bottom-0 h-1 w-1 rounded-full bg-accent" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
