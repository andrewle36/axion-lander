"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Workflow, Plus, MoreHorizontal, ExternalLink, Copy, Trash2, History, Search, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { PageHeader, Toolbar, Button, Table, Th, Td, Switch, Menu, MenuItem, Loading, Empty, Select, Badge, confirmAction } from "@/components/ui";
import { cn, relTime } from "@/lib/utils";
import { NewAutomationDialog } from "@/components/automations/new-dialog";

export default function AutomationsPage() {
  const router = useRouter();
  const list = trpc.automations.list.useQuery();
  const me = trpc.team.me.useQuery();
  const setStatus = trpc.automations.setStatus.useMutation();
  const duplicate = trpc.automations.duplicate.useMutation({ onSuccess: (a: any) => { toast.success("Duplicated"); router.push(`/automations/${a.id}`); } });
  const del = trpc.automations.delete.useMutation({ onSuccess: () => toast.success("Automation deleted") });
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("");
  const isAdmin = me.data?.role !== "rep";

  const rows = (list.data ?? []).filter((a) =>
    (!filter || (filter === "active" ? a.status === "active" : a.status !== "active")) &&
    (!q || `${a.name} ${a.description ?? ""} ${a.trigger_label}`.toLowerCase().includes(q.toLowerCase())));
  const totals = (list.data ?? []).reduce((t, a) => ({ active: t.active + (a.status === "active" ? 1 : 0), runs: t.runs + a.active_runs, sent: t.sent + a.sent_30d }), { active: 0, runs: 0, sent: 0 });

  const toggle = (id: string, on: boolean) =>
    setStatus.mutate({ id, status: on ? "active" : "paused" }, { onSuccess: () => toast.success(on ? "Automation activated" : "Automation deactivated") });

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Workflow className="h-4 w-4" />} title="Automations" count={list.data?.length}
        actions={<>
          <Link href="/automations/runs"><Button icon={<History className="h-3.5 w-3.5" />}>Executions</Button></Link>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>New automation</Button>
        </>} />
      <Toolbar>
        <div className="relative w-60">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search automations…"
            className="h-8 w-full rounded border border-border bg-bg pl-8 pr-2 text-sm focus:border-accent focus:outline-none" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-36">
          <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </Select>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted">
          <span><b className="text-fg">{totals.active}</b> active</span>
          <span><b className="text-fg">{totals.runs}</b> contacts in sequences</span>
          <span><b className="text-fg">{totals.sent}</b> messages sent (30d)</span>
        </div>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {list.isLoading ? <Loading /> : (list.data ?? []).length === 0 ? (
          <Empty icon={<Workflow className="h-8 w-8" />} title="No automations yet"
            body="Build SMS and email follow-up sequences that run on their own when leads come in. Start from a ready-made template."
            action={<Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>New automation</Button>} />
        ) : rows.length === 0 ? <Empty title="No automations match" /> : (
          <Table>
            <thead><tr>
              <Th>Name</Th><Th>Trigger</Th><Th>Status</Th><Th className="text-right">Active runs</Th><Th className="text-right">Sent 30d</Th>
              <Th className="text-right">Completed</Th><Th className="text-right">Failed</Th><Th>Last run</Th><Th>Last updated</Th><Th className="w-10" />
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="group cursor-pointer hover:bg-hover" onClick={() => router.push(`/automations/${a.id}`)}>
                  <Td className="max-w-[340px]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#f97316]/10 text-[#f97316]"><Workflow className="h-3.5 w-3.5" /></span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.name}</div>
                        {a.description && <div className="truncate text-xs text-muted">{a.description}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td><span className="flex items-center gap-1.5 text-muted"><Zap className="h-3.5 w-3.5 text-[#f97316]" />{a.trigger_label}</span></Td>
                  <Td>
                    <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Switch checked={a.status === "active"} disabled={setStatus.isPending} onChange={(v) => toggle(a.id, v)} />
                      <span className={cn("text-xs", a.status === "active" ? "text-success" : "text-muted")}>{a.status === "active" ? "Active" : a.status === "paused" ? "Inactive" : "Draft"}</span>
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{a.active_runs ? <Badge tone="blue">{a.active_runs}</Badge> : <span className="text-faint">0</span>}</Td>
                  <Td className="text-right tabular-nums">{a.sent_30d}</Td>
                  <Td className="text-right tabular-nums text-muted">{a.completed}</Td>
                  <Td className={cn("text-right tabular-nums", a.failed ? "text-danger" : "text-muted")}>{a.failed}</Td>
                  <Td className="text-muted">{a.last_run_at ? relTime(a.last_run_at) : "Never"}</Td>
                  <Td className="text-muted">{relTime(a.updated_at)}</Td>
                  <Td className="w-10 px-1">
                    <span onClick={(e) => e.stopPropagation()}>
                      <Menu align="right" width={180} trigger={<button type="button" aria-label="Row actions" className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-subtle hover:text-fg"><MoreHorizontal className="h-4 w-4" /></button>}>
                        {(close) => (<>
                          <MenuItem icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => { close(); router.push(`/automations/${a.id}`); }}>Open</MenuItem>
                          <MenuItem icon={<History className="h-3.5 w-3.5" />} onClick={() => { close(); router.push(`/automations/${a.id}?view=executions`); }}>Executions</MenuItem>
                          <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { close(); duplicate.mutate({ id: a.id }); }}>Duplicate</MenuItem>
                          {isAdmin && <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => {
                            close();
                            if (confirmAction(`Delete "${a.name}"? Its ${a.active_runs + a.completed + a.failed} execution records are deleted too.`)) del.mutate({ id: a.id });
                          }}>Delete</MenuItem>}
                        </>)}
                      </Menu>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <NewAutomationDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
