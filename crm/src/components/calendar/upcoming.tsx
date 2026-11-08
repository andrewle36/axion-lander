"use client";
import { useState } from "react";
import { format } from "date-fns";
import { CalendarPlus, CalendarDays, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Card, Loading, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BookAppointmentDialog } from "./book-appointment";
import { EventEditorDialog } from "./event-editor";
import { asEvents, fmtRange, vehicleLabel, type CalEvent } from "./lib";

/** Next/past appointments for a contact or company, with a "Book appointment" button. */
export function UpcomingEvents({ contactId, companyId }: { contactId?: string | null; companyId?: string | null }) {
  const q = trpc.calendar.events.forRecord.useQuery({ contactId: contactId ?? undefined, companyId: companyId ?? undefined }, { enabled: !!(contactId || companyId) });
  const [book, setBook] = useState(false);
  const [edit, setEdit] = useState<CalEvent | null>(null);
  const setStatus = trpc.calendar.events.setStatus.useMutation();
  const now = Date.now();
  const all = asEvents(q.data);
  const upcoming = all.filter((e) => new Date(e.end_at).getTime() >= now).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = all.filter((e) => new Date(e.end_at).getTime() < now);

  const row = (e: CalEvent, isPast: boolean) => {
    const s = new Date(e.start_at), en = new Date(e.end_at);
    const color = e.color || e.calendar?.color || "#039be5";
    return (
      <div key={e.id} className="group flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-hover" onClick={() => setEdit(e)}>
        <div className="w-10 shrink-0 text-center">
          <div className="text-[10px] font-medium uppercase text-muted">{format(s, "MMM")}</div>
          <div className={cn("text-lg font-medium leading-6", !isPast && "text-accent")}>{format(s, "d")}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className={cn("truncate text-sm font-medium", e.status === "cancelled" && "line-through text-muted")}>{e.title}</span>
            {e.status !== "confirmed" && <StatusBadge status={e.status} />}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {format(s, "EEE")} · {e.all_day ? "All day" : fmtRange(s, en)}
            {e.vehicle ? ` · ${vehicleLabel(e.vehicle)}` : ""}
          </div>
          {e.location && <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-faint"><MapPin className="h-3 w-3" />{e.location}</div>}
        </div>
        {isPast && e.status === "confirmed" && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100" onClick={(ev) => ev.stopPropagation()}>
            <Button size="xs" onClick={() => setStatus.mutate({ id: e.id, status: "completed" })}>Completed</Button>
            <Button size="xs" onClick={() => setStatus.mutate({ id: e.id, status: "no_show" })}>No-show</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card title={<span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-muted" />Appointments</span>}
      action={<Button size="xs" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setBook(true)}>Book appointment</Button>}>
      {q.isLoading ? <Loading /> : all.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted">No appointments yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {upcoming.length > 0 && <div className="bg-subtle px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Upcoming</div>}
          {upcoming.map((e) => row(e, false))}
          {past.length > 0 && <div className="bg-subtle px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Past</div>}
          {past.slice(0, 10).map((e) => row(e, true))}
        </div>
      )}
      <BookAppointmentDialog open={book} onClose={() => setBook(false)} contactId={contactId} companyId={companyId} />
      <EventEditorDialog open={!!edit} onClose={() => setEdit(null)} draft={edit} />
    </Card>
  );
}
