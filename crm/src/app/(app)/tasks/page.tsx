"use client";
import * as React from "react";
import { CheckSquare, ChevronDown, ChevronRight, Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Empty, Input, Loading, PageHeader, Select, Toolbar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { TaskQuickAdd, TaskRow, groupTasks } from "@/components/deals/tasks-panel";
import { useTeam } from "@/components/deals/shared";

export default function TasksPage() {
  const team = useTeam();
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  const [assignee, setAssignee] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => { const t = setTimeout(() => setQ(search), 250); return () => clearTimeout(t); }, [search]);
  const list = trpc.tasks.list.useQuery({ scope, assignee: scope === "all" && assignee ? assignee : undefined, q: q || undefined, doneLimit: 100 });
  const g = groupTasks(list.data?.open ?? []);
  const done = list.data?.done ?? [];
  const openCount = list.data?.open.length ?? 0;
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<CheckSquare className="h-4 w-4" />} title="Tasks" count={openCount} />
      <Toolbar>
        <div className="flex items-center rounded border border-border p-0.5 text-xs">
          {(["mine", "all"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={cn("h-6 rounded px-2", scope === s ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg")}>{s === "mine" ? "My tasks" : "All tasks"}</button>
          ))}
        </div>
        {scope === "all" && (
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-44">
            <option value="">Anyone</option>
            {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
          </Select>
        )}
        <div className="relative w-60">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="pl-7" />
        </div>
      </Toolbar>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-4 p-4">
          <div className="rounded-md border border-border bg-bg p-3"><TaskQuickAdd showLinkPicker /></div>
          {list.isLoading ? <Loading /> : (openCount === 0 && done.length === 0) ? (
            <Empty icon={<CheckSquare className="h-8 w-8" />} title="No tasks" body="Add a follow-up above. Tasks created by automations and signed contracts show up here too." />
          ) : (
            <>
              <Group title="Overdue" tone="danger" items={g.overdue} />
              <Group title="Today" items={g.today} />
              <Group title="Upcoming" items={g.upcoming} />
              <Group title="No date" items={g.nodate} />
              <Group title="Completed" items={done} collapsed />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, items, tone, collapsed }: { title: string; items: any[]; tone?: "danger"; collapsed?: boolean }) {
  const [open, setOpen] = React.useState(!collapsed);
  if (!items.length) return null;
  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-fg">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className={cn(tone === "danger" && "text-danger")}>{title}</span>
        <span className="font-normal text-faint">{items.length}</span>
      </button>
      {open && <div className="rounded-md border border-border bg-bg">{items.map((t) => <TaskRow key={t.id} t={t} />)}</div>}
    </section>
  );
}
