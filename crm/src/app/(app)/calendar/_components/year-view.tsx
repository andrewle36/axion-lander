"use client";
import { useMemo } from "react";
import { addDays, addMonths, format, startOfDay, startOfYear } from "date-fns";
import { MiniMonth } from "./mini-month";
import type { CalEvent } from "@/components/calendar/lib";

export function YearView({ date, events, onDayClick }: { date: Date; events: CalEvent[]; onDayClick: (d: Date) => void }) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfYear(date), i));
  const busy = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) {
      if (e.status === "cancelled") continue;
      let d = startOfDay(new Date(e.start_at));
      const end = new Date(e.end_at);
      let guard = 0;
      do { s.add(format(d, "yyyy-MM-dd")); d = addDays(d, 1); } while (d < end && ++guard < 62);
    }
    return s;
  }, [events]);
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-10 gap-y-8 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((m) => (
          <div key={m.toISOString()} className="px-2">
            <MiniMonth month={m} showNav={false} compact title={format(m, "MMMM")} onPick={onDayClick} busy={busy} />
          </div>
        ))}
      </div>
    </div>
  );
}
