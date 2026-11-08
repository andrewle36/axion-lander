"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Square, RotateCcw, History, UserPlus, CheckCircle2, XCircle, RefreshCw, MessageSquare, Mail, FlaskConical } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Select, Table, Th, Td, StatusBadge, Drawer, Loading, Empty, Avatar, Badge, Toolbar } from "@/components/ui";
import { cn, fullName, relTime, shortDate } from "@/lib/utils";
import { IconTile } from "./flow-node";
import { ContactPicker } from "./contact-picker";

const STATUSES = ["running", "waiting", "completed", "failed", "stopped"] as const;

export function Executions({ automationId, showAutomation, openRunId, onOpenRun }: {
  automationId?: string; showAutomation?: boolean; openRunId?: string | null; onOpenRun?: (id: string | null) => void;
}) {
  const [status, setStatus] = React.useState<string>("");
  const [q, setQ] = React.useState("");
  const [autoFilter, setAutoFilter] = React.useState<string>("");
  const [localOpen, setLocalOpen] = React.useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const open = openRunId !== undefined ? openRunId : localOpen;
  const setOpen = onOpenRun ?? setLocalOpen;
  const effectiveAuto = automationId ?? (autoFilter || undefined);

  const autos = trpc.automations.list.useQuery(undefined, { enabled: !!showAutomation });
  const runs = trpc.automations.runs.useQuery(
    { automationId: effectiveAuto, status: (status || undefined) as any, q: q || undefined },
    { refetchInterval: 10_000 },
  );
  const enroll = trpc.automations.enrollContacts.useMutation({
    onSuccess: (r) => { toast.success(`Enrolled ${r.enrolled} contact${r.enrolled === 1 ? "" : "s"}${r.skipped ? `, ${r.skipped} skipped (already in a run)` : ""}`); setEnrollOpen(false); },
  });

  const rows = runs.data ?? [];
  const counts = React.useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])), [rows]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contact…"
            className="h-8 w-full rounded border border-border bg-bg pl-8 pr-2 text-sm focus:border-accent focus:outline-none" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {showAutomation && (
          <Select value={autoFilter} onChange={(e) => setAutoFilter(e.target.value)} className="w-56">
            <option value="">All automations</option>
            {(autos.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <div className="flex items-center gap-2 text-xs text-muted">
          {STATUSES.map((s) => counts[s] ? <span key={s} className="flex items-center gap-1"><StatusBadge status={s} />{counts[s]}</span> : null)}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" icon={<RefreshCw className={cn("h-3.5 w-3.5", runs.isFetching && "animate-spin")} />} onClick={() => runs.refetch()}>Refresh</Button>
          {automationId && <Button icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setEnrollOpen(true)}>Enroll contacts</Button>}
        </div>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {runs.isLoading ? <Loading /> : rows.length === 0 ? (
          <Empty icon={<History className="h-8 w-8" />} title="No executions yet"
            body={automationId ? "Runs appear here when contacts enter this automation. Use Test run or Enroll contacts to start one." : "Runs appear here when contacts enter an automation."} />
        ) : (
          <Table>
            <thead><tr>
              <Th>Contact</Th>{showAutomation && <Th>Automation</Th>}<Th>Status</Th><Th>Started</Th><Th>Current step</Th><Th>Next action</Th><Th>Last log</Th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r.id)} className={cn("cursor-pointer hover:bg-hover", open === r.id && "bg-accent-soft")}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Avatar name={r.contact ? fullName(r.contact) : "?"} size={20} />
                      <span className="font-medium">{r.contact ? fullName(r.contact) : "Deleted contact"}</span>
                      {r.test && <Badge tone="purple"><FlaskConical className="h-3 w-3" />test</Badge>}
                    </span>
                  </Td>
                  {showAutomation && <Td className="text-muted">{r.automation_name}</Td>}
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="text-muted" >{shortDate(r.created_at)}</Td>
                  <Td>{r.current_type ? <span className="flex items-center gap-1.5"><IconTile type={r.current_type} size={18} />{r.current_step}</span> : <span className="text-faint">–</span>}</Td>
                  <Td className="text-muted">{r.status === "waiting" ? relTime(r.next_run_at) : "–"}</Td>
                  <Td className={cn("max-w-[320px] truncate", r.last_log && !r.last_log.ok ? "text-danger" : "text-muted")}>{r.error && r.status === "failed" ? r.error : r.last_log?.msg ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <RunDrawer id={open} onClose={() => setOpen(null)} />
      {automationId && (
        <ContactPicker open={enrollOpen} onClose={() => setEnrollOpen(false)} title="Enroll contacts" multi confirmLabel="Enroll" loading={enroll.isPending}
          hint="Selected contacts start at the first step right away. Contacts already in an active run are skipped unless re-entry is allowed."
          onPick={(ids) => enroll.mutate({ automationId, contactIds: ids })} />
      )}
    </div>
  );
}

export function RunDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const run = trpc.automations.runDetail.useQuery({ id: id ?? "" }, { enabled: !!id, refetchInterval: 10_000 });
  const stop = trpc.automations.stopRun.useMutation({ onSuccess: () => toast.success("Run stopped") });
  const retry = trpc.automations.retryRun.useMutation({
    onSuccess: (r) => r.status === "failed" ? toast.error(`Retry failed: ${r.error ?? "unknown error"}`) : toast.success(`Retried, run is now ${r.status}`),
  });
  const r = run.data;
  const live = r && (r.status === "running" || r.status === "waiting");
  const canRetry = r && (r.status === "failed" || r.status === "stopped") && !!r.current_node;
  return (
    <Drawer open={!!id} onClose={onClose} width={520}
      title={r ? <span className="flex items-center gap-2">{r.contact ? fullName(r.contact) : "Execution"} <StatusBadge status={r.status} /></span> : "Execution"}
      actions={r && (
        <>
          {live && <Button size="xs" variant="outline" icon={<Square className="h-3 w-3" />} loading={stop.isPending} onClick={() => stop.mutate({ id: r.id })}>Stop</Button>}
          {canRetry && <Button size="xs" variant="primary" icon={<RotateCcw className="h-3 w-3" />} loading={retry.isPending} onClick={() => retry.mutate({ id: r.id })}>Retry</Button>}
        </>
      )}>
      {!r ? <Loading /> : (
        <div className="space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Automation"><Link href={`/automations/${r.automation.id}`} className="text-accent hover:underline">{r.automation.name}</Link></Info>
            <Info label="Contact">{r.contact ? <Link href={`/contacts/${r.contact.id}`} className="text-accent hover:underline">{fullName(r.contact)}</Link> : "Deleted"}</Info>
            <Info label="Started">{shortDate(r.created_at)} · {relTime(r.created_at)}</Info>
            <Info label={r.status === "waiting" ? "Resumes" : "Current step"}>
              {r.status === "waiting" ? `${relTime(r.next_run_at)} → ${r.current?.label ?? ""}` : r.current?.label ?? "–"}
            </Info>
          </div>
          {r.error && <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{r.error}</div>}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Timeline</div>
            <ol className="relative space-y-3 border-l border-border pl-5">
              {r.log.map((l, i) => (
                <li key={i} className="relative">
                  <span className={cn("absolute -left-[27px] top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bg", l.ok ? "text-success" : "text-danger")}>
                    {l.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                  </span>
                  <div className="flex items-center gap-2">
                    {l.type !== "unknown" && <IconTile type={l.type} size={20} />}
                    <span className="text-sm font-medium">{l.label === "manual" ? "Manual action" : l.label}</span>
                    <span className="ml-auto text-xs text-faint" title={new Date(l.at).toLocaleString()}>{new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  <div className={cn("mt-0.5 text-sm", l.ok ? "text-muted" : "text-danger")}>{l.msg}</div>
                </li>
              ))}
              {live && (
                <li className="relative">
                  <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-warning" />
                  <div className="text-sm text-muted">{r.status === "waiting" ? `Waiting, next step ${relTime(r.next_run_at)}` : "Running…"}</div>
                </li>
              )}
            </ol>
          </div>
          {r.messages.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Messages sent</div>
              <div className="space-y-2">
                {r.messages.map((m) => (
                  <div key={m.id} className="rounded-md border border-border p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                      {m.channel === "sms" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                      {m.channel.toUpperCase()} <Badge tone={m.status === "failed" ? "red" : m.status === "queued" ? "gray" : "green"}>{m.status}</Badge>
                      <span className="ml-auto">{shortDate(m.created_at)}</span>
                    </div>
                    {m.subject && <div className="text-sm font-medium">{m.subject}</div>}
                    <div className="line-clamp-4 whitespace-pre-wrap text-sm text-fg">{m.body}</div>
                    {m.error && <div className="mt-1 text-xs text-danger">{m.error}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-xs text-muted">{label}</div><div className="mt-0.5">{children}</div></div>;
}
