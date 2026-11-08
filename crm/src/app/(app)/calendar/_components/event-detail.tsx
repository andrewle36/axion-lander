"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlignLeft, Building2, CalendarDays, Car, Check, Mail, MapPin, MessageSquare, Pencil, Phone, Trash2, Users, Video, X, UserRound, Ban, UserX, RotateCcw,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useDialer } from "@/components/dialer/dialer";
import { Button, IconButton, StatusBadge, confirmAction } from "@/components/ui";
import { cn, fmtPhone, fullName } from "@/lib/utils";
import { fmtWhen, vehicleLabel, type CalEvent } from "@/components/calendar/lib";

export function EventDetail({ ev, color, calendarName, onClose, onEdit }: {
  ev: CalEvent; color: string; calendarName: string; onClose: () => void; onEdit: () => void;
}) {
  const router = useRouter();
  const { call } = useDialer();
  const del = trpc.calendar.events.delete.useMutation();
  const setStatus = trpc.calendar.events.setStatus.useMutation();
  const c = ev.contact;
  const emails = Array.from(new Set([c?.email, ...(ev.attendees ?? []).map((a) => a.email)].filter((x): x is string => !!x)));

  const status = async (s: CalEvent["status"]) => {
    await setStatus.mutateAsync({ id: ev.id, status: s });
    toast.success(s === "confirmed" ? "Appointment restored" : `Marked ${s.replace("_", "-")}`);
    onClose();
  };

  return (
    <div className="pb-2">
      <div className="flex items-center justify-end gap-0.5 px-2 pt-2">
        <IconButton label="Edit event" className="h-9 w-9 rounded-full" onClick={onEdit}><Pencil className="h-[18px] w-[18px]" /></IconButton>
        <IconButton label="Delete event" className="h-9 w-9 rounded-full" disabled={del.isPending}
          onClick={async () => { if (confirmAction(`Delete “${ev.title}”?`)) { await del.mutateAsync({ id: ev.id }); toast.success("Event deleted"); onClose(); } }}>
          <Trash2 className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label={emails.length ? "Email guests" : "No guest emails"} className="h-9 w-9 rounded-full" disabled={!emails.length}
          onClick={() => { window.location.href = `mailto:${emails.join(",")}?subject=${encodeURIComponent(ev.title)}`; }}>
          <Mail className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton label="Close" className="h-9 w-9 rounded-full" onClick={onClose}><X className="h-5 w-5" /></IconButton>
      </div>

      <div className="space-y-3 px-5 pb-3 pt-1">
        <div className="flex gap-4">
          <span className="mt-2 h-3.5 w-3.5 shrink-0 rounded" style={{ background: color }} />
          <div className="min-w-0">
            <div className={cn("break-words text-[22px] leading-7 text-fg", ev.status === "cancelled" && "line-through text-muted")}>{ev.title}</div>
            <div className="mt-1 text-sm text-muted">{fmtWhen(ev)}</div>
            {ev.status !== "confirmed" && <div className="mt-1.5"><StatusBadge status={ev.status} /></div>}
          </div>
        </div>

        {ev.meeting_url && (
          <Line icon={<Video className="h-[18px] w-[18px]" />}>
            <a href={ev.meeting_url} target="_blank" rel="noreferrer"><Button variant="primary" size="sm">Join meeting</Button></a>
            <div className="mt-1 truncate text-xs text-faint">{ev.meeting_url}</div>
          </Line>
        )}
        {ev.location && (
          <Line icon={<MapPin className="h-[18px] w-[18px]" />}>
            <a className="hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`}>{ev.location}</a>
          </Line>
        )}
        {c && (
          <Line icon={<UserRound className="h-[18px] w-[18px]" />}>
            <Link href={`/contacts/${c.id}`} className="font-medium text-accent hover:underline">{fullName(c)}</Link>
            <div className="text-xs text-muted">{[fmtPhone(c.phone), c.email].filter(Boolean).join(" · ")}</div>
            <div className="mt-1.5 flex gap-1.5">
              <Button size="xs" icon={<Phone className="h-3.5 w-3.5" />} disabled={!c.phone}
                onClick={() => { if (c.phone) { call({ number: c.phone, contactId: c.id, companyId: ev.company_id, name: fullName(c) }); onClose(); } }}>Call</Button>
              <Button size="xs" icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={() => router.push(`/inbox?contact=${c.id}`)}>Text</Button>
            </div>
          </Line>
        )}
        {ev.company && (
          <Line icon={<Building2 className="h-[18px] w-[18px]" />}>
            <Link href={`/accounts/${ev.company.id}`} className="hover:underline">{ev.company.name}</Link>
          </Line>
        )}
        {ev.vehicle && <Line icon={<Car className="h-[18px] w-[18px]" />}>{vehicleLabel(ev.vehicle)}</Line>}
        {(ev.attendees ?? []).length > 0 && (
          <Line icon={<Users className="h-[18px] w-[18px]" />}>
            <div className="text-xs text-muted">{ev.attendees.length} guest{ev.attendees.length === 1 ? "" : "s"}</div>
            {ev.attendees.map((a, i) => <div key={i} className="truncate">{a.name || a.email}{a.name && a.email ? <span className="text-faint"> · {a.email}</span> : null}</div>)}
          </Line>
        )}
        {ev.description && <Line icon={<AlignLeft className="h-[18px] w-[18px]" />}><div className="max-h-40 overflow-y-auto whitespace-pre-wrap">{ev.description}</div></Line>}
        <Line icon={<CalendarDays className="h-[18px] w-[18px]" />}>
          {calendarName}{ev.source === "calendly" && <span className="text-faint"> · via Calendly</span>}
        </Line>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-5 pt-2.5">
        <span className="mr-1 text-xs text-muted">Status</span>
        <Button size="xs" variant={ev.status === "completed" ? "primary" : "secondary"} icon={<Check className="h-3.5 w-3.5" />} loading={setStatus.isPending && setStatus.variables?.status === "completed"} onClick={() => status("completed")}>Completed</Button>
        <Button size="xs" variant={ev.status === "no_show" ? "primary" : "secondary"} icon={<UserX className="h-3.5 w-3.5" />} loading={setStatus.isPending && setStatus.variables?.status === "no_show"} onClick={() => status("no_show")}>No-show</Button>
        {ev.status === "cancelled"
          ? <Button size="xs" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => status("confirmed")}>Restore</Button>
          : <Button size="xs" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => status("cancelled")}>Cancel</Button>}
        {(ev.status === "completed" || ev.status === "no_show") && <Button size="xs" variant="ghost" onClick={() => status("confirmed")}>Reset</Button>}
      </div>
    </div>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex gap-4 text-sm"><span className="mt-0.5 shrink-0 text-muted">{icon}</span><div className="min-w-0 flex-1">{children}</div></div>;
}
