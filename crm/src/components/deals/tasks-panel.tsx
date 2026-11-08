"use client";
import * as React from "react";
import Link from "next/link";
import { format, isToday, isPast, isTomorrow, endOfDay, addDays, setHours, startOfHour } from "date-fns";
import { Plus, Trash2, CalendarClock, User, Building2, KanbanSquare, X, Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Button, Checkbox, IconButton, Input, Select, Spinner, confirmAction } from "@/components/ui";
import { cn, dealNo, fullName } from "@/lib/utils";
import { useTeam } from "./shared";

export type TaskLink = { contactId?: string | null; companyId?: string | null; dealId?: string | null };

export function dueLabel(due: string | null | undefined) {
  if (!due) return "";
  const d = new Date(due);
  if (isToday(d)) return `Today ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow ${format(d, "h:mm a")}`;
  return format(d, d.getFullYear() === new Date().getFullYear() ? "MMM d, h:mm a" : "MMM d, yyyy");
}
const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/** Group open tasks into Overdue / Today / Upcoming / No date. */
export function groupTasks(open: any[]) {
  const g = { overdue: [] as any[], today: [] as any[], upcoming: [] as any[], nodate: [] as any[] };
  const eod = endOfDay(new Date());
  for (const t of open) {
    if (!t.due_at) g.nodate.push(t);
    else { const d = new Date(t.due_at); if (isPast(d)) g.overdue.push(t); else if (d <= eod) g.today.push(t); else g.upcoming.push(t); }
  }
  return g;
}

export function TaskRow({ t, showLinks = true }: { t: any; showLinks?: boolean }) {
  const toggle = trpc.tasks.toggle.useMutation();
  const del = trpc.tasks.delete.useMutation();
  const update = trpc.tasks.update.useMutation();
  const team = useTeam();
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(t.title);
  const overdue = !t.done && t.due_at && isPast(new Date(t.due_at));
  return (
    <div className="group flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0 hover:bg-hover/50">
      <Checkbox checked={t.done} onChange={(v) => toggle.mutate({ id: t.id, done: v })} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input autoFocus className="h-7" value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { setEditing(false); if (title.trim() && title !== t.title) update.mutate({ id: t.id, title: title.trim() }); else setTitle(t.title); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTitle(t.title); setEditing(false); } }} />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={cn("block w-full truncate text-left text-sm", t.done && "text-faint line-through")}>{t.title}</button>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <label className={cn("relative inline-flex cursor-pointer items-center gap-1", overdue && "font-medium text-danger")}>
            <CalendarClock className="h-3 w-3" />{t.due_at ? dueLabel(t.due_at) : "No date"}
            <input type="datetime-local" className="absolute inset-0 cursor-pointer opacity-0" value={t.due_at ? toLocalInput(new Date(t.due_at)) : ""}
              onChange={(e) => update.mutate({ id: t.id, due_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </label>
          {showLinks && t.contact && <Link href={`/contacts/${t.contact.id}`} className="inline-flex items-center gap-1 hover:text-fg"><User className="h-3 w-3" />{fullName(t.contact)}</Link>}
          {showLinks && t.company && <Link href={`/accounts/${t.company.id}`} className="inline-flex items-center gap-1 hover:text-fg"><Building2 className="h-3 w-3" />{t.company.name}</Link>}
          {showLinks && t.deal && <Link href={`/deals?open=${t.deal.id}`} className="inline-flex items-center gap-1 hover:text-fg"><KanbanSquare className="h-3 w-3" />{dealNo(t.deal.number)}</Link>}
        </div>
      </div>
      <select aria-label="Assignee" value={t.assignee_id ?? ""} onChange={(e) => update.mutate({ id: t.id, assignee_id: e.target.value || null })}
        className="hidden max-w-[120px] truncate rounded border border-transparent bg-transparent text-xs text-muted hover:border-border focus:outline-none sm:block">
        <option value="">Unassigned</option>
        {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
      </select>
      {t.assignee && <Avatar name={t.assignee.full_name} color={t.assignee.color} size={20} />}
      <IconButton label="Delete task" className="opacity-0 group-hover:opacity-100" onClick={() => { if (confirmAction("Delete this task?")) del.mutate({ id: t.id }); }}><Trash2 className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

/** Search contacts / accounts / deals to link a task to. */
export function LinkPicker({ value, onChange }: { value: TaskLink & { label?: string }; onChange: (v: TaskLink & { label?: string }) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const opts = trpc.tasks.linkOptions.useQuery({ q }, { enabled: open });
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const pick = (v: TaskLink & { label: string }) => { onChange(v); setOpen(false); setQ(""); };
  const has = value.contactId || value.companyId || value.dealId;
  return (
    <div ref={ref} className="relative">
      {has ? (
        <span className="inline-flex h-8 items-center gap-1 rounded border border-border bg-subtle px-2 text-xs">
          {value.label ?? "Linked"}
          <button type="button" aria-label="Remove link" onClick={() => onChange({})} className="text-muted hover:text-fg"><X className="h-3 w-3" /></button>
        </span>
      ) : (
        <Button type="button" variant="outline" icon={<Search className="h-3.5 w-3.5" />} onClick={() => setOpen((o) => !o)}>Link…</Button>
      )}
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-border bg-bg p-1 shadow-pop">
          <Input autoFocus placeholder="Search contact, account, NS-number…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-1" />
          {opts.isLoading ? <div className="p-2"><Spinner /></div> : (
            <div className="max-h-64 overflow-y-auto">
              {(opts.data?.deals ?? []).map((d: any) => (
                <button key={d.id} type="button" onClick={() => pick({ dealId: d.id, companyId: d.company_id, contactId: d.contact_id, label: `${dealNo(d.number)} ${d.name}` })} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-hover">
                  <KanbanSquare className="h-3.5 w-3.5 text-muted" /><span className="truncate">{dealNo(d.number)} · {d.name}</span>
                </button>
              ))}
              {(opts.data?.companies ?? []).map((c: any) => (
                <button key={c.id} type="button" onClick={() => pick({ companyId: c.id, label: c.name })} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-hover">
                  <Building2 className="h-3.5 w-3.5 text-muted" /><span className="truncate">{c.name}</span>
                </button>
              ))}
              {(opts.data?.contacts ?? []).map((c: any) => (
                <button key={c.id} type="button" onClick={() => pick({ contactId: c.id, companyId: c.company_id, label: fullName(c) })} className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-hover">
                  <User className="h-3.5 w-3.5 text-muted" /><span className="truncate">{fullName(c)}</span>
                </button>
              ))}
              {!opts.data?.deals.length && !opts.data?.companies.length && !opts.data?.contacts.length && <div className="p-2 text-xs text-faint">No matches</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Quick-add row. When `link` is given, the task is attached to it and no link picker is shown. */
export function TaskQuickAdd({ link, showLinkPicker }: { link?: TaskLink; showLinkPicker?: boolean }) {
  const me = trpc.team.me.useQuery();
  const team = useTeam();
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [assignee, setAssignee] = React.useState<string>("");
  const [picked, setPicked] = React.useState<TaskLink & { label?: string }>({});
  React.useEffect(() => { if (me.data && !assignee) setAssignee(me.data.id); }, [me.data, assignee]);
  const create = trpc.tasks.create.useMutation({ onSuccess: () => { setTitle(""); setDue(""); setPicked({}); } });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const l = link ?? picked;
    create.mutate({
      title: title.trim(), due_at: due ? new Date(due).toISOString() : null, assignee_id: assignee || null,
      contact_id: l.contactId ?? null, company_id: l.companyId ?? null, deal_id: l.dealId ?? null,
    });
  };
  const quick = (d: Date) => setDue(toLocalInput(d));
  const nineAm = (d: Date) => startOfHour(setHours(d, 9));
  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task… e.g. Call sales manager about pricing" className="min-w-[200px] flex-1" />
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="w-[190px]" aria-label="Due date" />
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-[150px]" aria-label="Assignee">
          <option value="">Unassigned</option>
          {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
        </Select>
        {showLinkPicker && !link && <LinkPicker value={picked} onChange={setPicked} />}
        <Button type="submit" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} loading={create.isPending} disabled={!title.trim()}>Add</Button>
      </div>
      <div className="flex gap-1 text-xs">
        <button type="button" onClick={() => quick(new Date().getHours() < 17 ? startOfHour(setHours(new Date(), 17)) : endOfDay(new Date()))} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg">Today 5pm</button>
        <button type="button" onClick={() => quick(nineAm(addDays(new Date(), 1)))} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg">Tomorrow 9am</button>
        <button type="button" onClick={() => quick(nineAm(addDays(new Date(), 7)))} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg">Next week</button>
        {due && <button type="button" onClick={() => setDue("")} className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg">Clear date</button>}
      </div>
    </form>
  );
}

/** Embeddable task list for a contact / account / deal profile. */
export function TasksPanel({ contactId, companyId, dealId }: TaskLink) {
  const [showDone, setShowDone] = React.useState(false);
  const input = { scope: "all" as const, contactId: contactId ?? undefined, companyId: companyId ?? undefined, dealId: dealId ?? undefined, doneLimit: 50 };
  // When embedded on a contact, prefer contact-only filtering; deals take precedence over companies.
  const q = trpc.tasks.list.useQuery(dealId ? { ...input, companyId: undefined, contactId: undefined } : contactId ? { ...input, companyId: undefined } : input);
  const link: TaskLink = { contactId: contactId ?? null, companyId: companyId ?? null, dealId: dealId ?? null };
  const open = q.data?.open ?? [];
  const done = q.data?.done ?? [];
  return (
    <div className="space-y-2">
      <TaskQuickAdd link={link} />
      {q.isLoading ? <div className="py-3"><Spinner /></div> : (
        <div className="rounded border border-border">
          {open.length === 0 && <div className="px-3 py-4 text-center text-xs text-faint">No open tasks</div>}
          {open.map((t: any) => <TaskRow key={t.id} t={t} showLinks={false} />)}
        </div>
      )}
      {done.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDone((s) => !s)} className="text-xs text-muted hover:text-fg">{showDone ? "Hide" : "Show"} completed ({done.length})</button>
          {showDone && <div className="mt-1 rounded border border-border">{done.map((t: any) => <TaskRow key={t.id} t={t} showLinks={false} />)}</div>}
        </div>
      )}
    </div>
  );
}
