"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners, useDroppable,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KanbanSquare, Plus, LayoutGrid, Table2, Search, CalendarDays, Car, ArrowUp, ArrowDown } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Button, Input, Loading, PageHeader, Select, Table, Td, Th, Toolbar, Empty } from "@/components/ui";
import { cn, compactMoney, dealNo, money, pct, shortDate } from "@/lib/utils";
import { STAGES, STAGE_META, StageDot, askLostReason, useTeam, type Stage } from "@/components/deals/shared";
import { NewDealDialog } from "@/components/deals/new-deal-dialog";
import { DealDrawer } from "@/components/deals/deal-drawer";

type Deal = any;
type Cols = Record<Stage, Deal[]>;

function group(rows: Deal[]): Cols {
  const c = Object.fromEntries(STAGES.map((s) => [s, [] as Deal[]])) as Cols;
  for (const r of rows) (c[r.stage as Stage] ??= []).push(r);
  for (const s of STAGES) c[s].sort((a, b) => Number(a.position) - Number(b.position));
  return c;
}
const fmtClose = (d: string | null) => (d ? shortDate(d + "T12:00:00") : "");

export default function DealsPage() {
  return <Suspense fallback={<Loading />}><DealsInner /></Suspense>;
}

function DealsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const me = trpc.team.me.useQuery();
  const team = useTeam();
  const isAdmin = me.data ? me.data.role !== "rep" : false;
  const [view, setView] = React.useState<"board" | "table">("board");
  const [owner, setOwner] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => { const t = setTimeout(() => setQ(search), 250); return () => clearTimeout(t); }, [search]);
  React.useEffect(() => { try { const v = localStorage.getItem("deals.view"); if (v === "board" || v === "table") setView(v); } catch { /* ignore */ } }, []);
  const changeView = (v: "board" | "table") => { setView(v); try { localStorage.setItem("deals.view", v); } catch { /* ignore */ } };

  const list = trpc.deals.list.useQuery({ owner: owner || undefined, q: q || undefined });
  const stats = trpc.deals.stats.useQuery({ owner: owner || undefined });
  const [openId, setOpenId] = React.useState<string | null>(params.get("open"));
  React.useEffect(() => { const p = params.get("open"); if (p) setOpenId(p); }, [params]);
  const openDeal = (id: string) => { setOpenId(id); router.replace(`/deals?open=${id}`, { scroll: false }); };
  const closeDeal = () => { setOpenId(null); if (params.get("open")) router.replace("/deals", { scroll: false }); };
  const [newStage, setNewStage] = React.useState<Stage | null>(null);

  const rows = list.data ?? [];
  const s = stats.data;
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<KanbanSquare className="h-4 w-4" />} title="Deals" count={rows.length}
        actions={<>
          {s && (
            <div className="hidden items-center gap-4 pr-2 text-xs text-muted lg:flex">
              <span>Open pipeline <b className="text-fg">{compactMoney(s.openValue)}/mo</b></span>
              <span>Won <b className="text-fg">{compactMoney(s.wonValue)}/mo</b></span>
              <span>Win rate <b className="text-fg">{pct(s.winRate, 0)}</b></span>
              <span>Avg cycle <b className="text-fg">{Math.round(s.avgCycleDays)}d</b></span>
            </div>
          )}
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewStage("lead")}>New deal</Button>
        </>} />
      <Toolbar>
        <div className="flex items-center rounded border border-border p-0.5">
          <button type="button" onClick={() => changeView("board")} className={cn("flex h-6 items-center gap-1 rounded px-2 text-xs", view === "board" ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg")}><LayoutGrid className="h-3.5 w-3.5" />Board</button>
          <button type="button" onClick={() => changeView("table")} className={cn("flex h-6 items-center gap-1 rounded px-2 text-xs", view === "table" ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg")}><Table2 className="h-3.5 w-3.5" />Table</button>
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deals, accounts, NS-1001…" className="pl-7" />
        </div>
        {isAdmin && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44">
            <option value="">All owners</option>
            <option value="me">My deals</option>
            <option value="unassigned">Unassigned</option>
            {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
          </Select>
        )}
        {(search || owner) && <Button variant="ghost" size="xs" onClick={() => { setSearch(""); setOwner(""); }}>Clear</Button>}
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto bg-panel">
        {list.isLoading ? <Loading /> : view === "board"
          ? <Board rows={rows} onOpen={openDeal} onNew={(st) => setNewStage(st)} />
          : rows.length ? <DealsTable rows={rows} onOpen={openDeal} /> : <Empty icon={<KanbanSquare className="h-8 w-8" />} title="No deals" body="Create a partner deal to start your pipeline." action={<Button variant="primary" onClick={() => setNewStage("lead")}>New deal</Button>} />}
      </div>
      <NewDealDialog open={!!newStage} stage={newStage ?? "lead"} onClose={() => setNewStage(null)} onCreated={(d) => openDeal(d.id)} />
      <DealDrawer dealId={openId} onClose={closeDeal} />
    </div>
  );
}

/* ---------------- Board ---------------- */
function Board({ rows, onOpen, onNew }: { rows: Deal[]; onOpen: (id: string) => void; onNew: (s: Stage) => void }) {
  const move = trpc.deals.move.useMutation();
  const [cols, setCols] = React.useState<Cols>(() => group(rows));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const dragging = React.useRef(false);
  const origin = React.useRef<Stage | null>(null);
  React.useEffect(() => { if (!dragging.current) setCols(group(rows)); }, [rows]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const findCol = (id: string): Stage | null => {
    if (id.startsWith("col:")) return id.slice(4) as Stage;
    for (const s of STAGES) if (cols[s].some((d) => d.id === id)) return s;
    return null;
  };
  const active = activeId ? STAGES.flatMap((s) => cols[s]).find((d) => d.id === activeId) : null;

  const onStart = (e: DragStartEvent) => { dragging.current = true; setActiveId(String(e.active.id)); origin.current = findCol(String(e.active.id)); };
  const onOver = (e: DragOverEvent) => {
    if (!e.over) return;
    const a = String(e.active.id), o = String(e.over.id);
    const from = findCol(a), to = findCol(o);
    if (!from || !to || from === to) return;
    setCols((c) => {
      const item = c[from].find((d) => d.id === a); if (!item) return c;
      const dest = c[to].filter((d) => d.id !== a);
      const overIdx = o.startsWith("col:") ? dest.length : Math.max(0, dest.findIndex((d) => d.id === o));
      dest.splice(overIdx, 0, { ...item, stage: to });
      return { ...c, [from]: c[from].filter((d) => d.id !== a), [to]: dest };
    });
  };
  const reset = () => setCols(group(rows));
  const onEnd = (e: DragEndEvent) => {
    dragging.current = false; setActiveId(null);
    const a = String(e.active.id);
    const fromStage = origin.current;
    if (!e.over) { reset(); return; }
    const o = String(e.over.id);
    const to = findCol(o) ?? findCol(a);
    if (!to) { reset(); return; }
    let list = cols[to];
    const oldIdx = list.findIndex((d) => d.id === a);
    const newIdx = o.startsWith("col:") ? (oldIdx === -1 ? list.length : oldIdx) : list.findIndex((d) => d.id === o);
    if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) list = arrayMove(list, oldIdx, newIdx);
    const idx = list.findIndex((d) => d.id === a);
    const prev = list[idx - 1], next = list[idx + 1];
    const p = prev && next ? (Number(prev.position) + Number(next.position)) / 2 : prev ? Number(prev.position) + 1000 : next ? Number(next.position) - 1000 : 1000;
    const orig = rows.find((d) => d.id === a);
    if (orig && orig.stage === to && Number(orig.position) === p) { reset(); return; }
    let lost_reason: string | undefined;
    if (to === "lost" && fromStage !== "lost") {
      const r = askLostReason();
      if (!r) { reset(); return; }
      lost_reason = r;
    }
    setCols((c) => ({ ...c, [to]: list.map((d) => (d.id === a ? { ...d, stage: to, position: p } : d)) }));
    move.mutate({ id: a, stage: to, position: p, lost_reason }, { onError: reset });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { dragging.current = false; setActiveId(null); reset(); }}>
      <div className="flex h-full min-w-max gap-2 p-3">
        {STAGES.map((s) => <Column key={s} stage={s} deals={cols[s]} onOpen={onOpen} onNew={() => onNew(s)} />)}
      </div>
      <DragOverlay>{active ? <CardBody d={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ stage, deals, onOpen, onNew }: { stage: Stage; deals: Deal[]; onOpen: (id: string) => void; onNew: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  const sum = deals.reduce((s, d) => s + Number(d.value_monthly ?? 0), 0);
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="flex h-9 items-center gap-2 px-1.5">
        <StageDot stage={stage} />
        <span className="text-sm font-medium">{STAGE_META[stage].label}</span>
        <span className="text-xs text-faint">{deals.length}</span>
        <span className="ml-auto text-xs tabular-nums text-muted">{compactMoney(sum)}/mo</span>
        <button type="button" onClick={onNew} title={`New deal in ${STAGE_META[stage].label}`} className="flex h-6 items-center gap-0.5 rounded px-1 text-xs text-muted hover:bg-hover hover:text-fg"><Plus className="h-3.5 w-3.5" />New</button>
      </div>
      <div ref={setNodeRef} className={cn("scroll-thin flex min-h-[120px] flex-1 flex-col gap-1.5 overflow-y-auto rounded-md p-1 transition-colors", isOver && "bg-accent-soft/60")}>
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => <SortableCard key={d.id} d={d} onOpen={onOpen} />)}
        </SortableContext>
        <button type="button" onClick={onNew} className="flex h-8 shrink-0 items-center gap-1 rounded px-2 text-xs text-faint hover:bg-hover hover:text-fg"><Plus className="h-3.5 w-3.5" />New</button>
      </div>
    </div>
  );
}

function SortableCard({ d, onOpen }: { d: Deal; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners}
      onClick={() => onOpen(d.id)} className={cn("cursor-pointer", isDragging && "opacity-40")}>
      <CardBody d={d} />
    </div>
  );
}

function CardBody({ d, overlay }: { d: Deal; overlay?: boolean }) {
  const overdue = d.expected_close && !["won", "lost"].includes(d.stage) && new Date(d.expected_close + "T23:59:59") < new Date();
  return (
    <div className={cn("rounded-md border border-border bg-bg p-2.5 shadow-card hover:border-border-strong", overlay && "rotate-1 shadow-pop")}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-faint">{dealNo(d.number)}</span>
        {d.owner && <Avatar name={d.owner.full_name} color={d.owner.color} size={18} className="ml-auto" />}
      </div>
      <div className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug">{d.name}</div>
      {d.company && <div className="truncate text-xs text-muted">{d.company.name}</div>}
      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        <span className="font-medium tabular-nums text-fg">{money(d.value_monthly, { cents: false })}/mo</span>
        <span className="inline-flex items-center gap-1"><Car className="h-3 w-3" />{d.est_cars_per_month}</span>
        {d.expected_close && <span className={cn("ml-auto inline-flex items-center gap-1", overdue && "text-danger")}><CalendarDays className="h-3 w-3" />{fmtClose(d.expected_close)}</span>}
      </div>
    </div>
  );
}

/* ---------------- Table ---------------- */
type SortKey = "number" | "name" | "company" | "stage" | "value_monthly" | "est_cars_per_month" | "smog_price" | "owner" | "expected_close";
function DealsTable({ rows, onOpen }: { rows: Deal[]; onOpen: (id: string) => void }) {
  const update = trpc.deals.update.useMutation();
  const [sort, setSort] = React.useState<{ k: SortKey; dir: 1 | -1 }>({ k: "number", dir: -1 });
  const val = (d: Deal, k: SortKey): string | number => {
    switch (k) {
      case "company": return d.company?.name?.toLowerCase() ?? "";
      case "owner": return d.owner?.full_name?.toLowerCase() ?? "";
      case "stage": return STAGES.indexOf(d.stage);
      case "name": return String(d.name).toLowerCase();
      case "expected_close": return d.expected_close ?? "9999";
      default: return Number(d[k] ?? 0);
    }
  };
  const sorted = [...rows].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  const H = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <Th className={className} onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      <span className="inline-flex items-center gap-1">{children}{sort.k === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}</span>
    </Th>
  );
  const changeStage = (d: Deal, stage: Stage) => {
    if (stage === "lost") { const r = askLostReason(); if (!r) return; update.mutate({ id: d.id, stage, lost_reason: r }); return; }
    update.mutate({ id: d.id, stage });
  };
  return (
    <Table className="h-full bg-bg">
      <thead><tr>
        <H k="number">Deal #</H><H k="name">Name</H><H k="company">Account</H><H k="stage">Stage</H>
        <H k="value_monthly" className="text-right">Value / mo</H><H k="est_cars_per_month" className="text-right">Cars / mo</H><H k="smog_price" className="text-right">Price</H>
        <H k="owner">Owner</H><H k="expected_close">Expected close</H>
      </tr></thead>
      <tbody>
        {sorted.map((d) => (
          <tr key={d.id} className="hover:bg-hover/50">
            <Td className="font-mono text-xs text-muted">{dealNo(d.number)}</Td>
            <Td className="max-w-[260px] cursor-pointer truncate font-medium hover:text-accent" onClick={() => onOpen(d.id)}>{d.name}</Td>
            <Td className="max-w-[200px] truncate text-muted">{d.company?.name ?? ""}</Td>
            <Td>
              <div className="flex items-center gap-1.5">
                <StageDot stage={d.stage} />
                <select value={d.stage} onChange={(e) => changeStage(d, e.target.value as Stage)} className="bg-transparent text-sm focus:outline-none" aria-label="Stage">
                  {STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
                </select>
              </div>
            </Td>
            <Td className="text-right tabular-nums">{money(d.value_monthly, { cents: false })}</Td>
            <Td className="text-right tabular-nums">{d.est_cars_per_month}</Td>
            <Td className="text-right tabular-nums">{d.smog_price != null ? money(d.smog_price) : ""}</Td>
            <Td>{d.owner ? <span className="inline-flex items-center gap-1.5"><Avatar name={d.owner.full_name} color={d.owner.color} size={18} />{d.owner.full_name}</span> : <span className="text-faint">Unassigned</span>}</Td>
            <Td className="text-muted">{fmtClose(d.expected_close)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
