"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, MarkerType, Panel,
  useNodesState, useEdgesState, useReactFlow, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Plus, Save, FlaskConical, Maximize2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Switch, Loading, Empty } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AutomationNode, AddEdge, EditorCtx, type AutoNode, type EditorCtxValue } from "./flow-node";
import { NodePicker, type PickItem } from "./node-picker";
import { NodePanel } from "./node-panel";
import { Executions } from "./executions";
import { ContactPicker } from "./contact-picker";
import { metaFor, validate, nodeIssues } from "./meta";

const nodeTypes = Object.fromEntries(["trigger", "sms", "email", "ai_sms", "ai_email", "wait", "condition", "end", "assign", "update", "task", "notify", "webhook"].map((t) => [t, AutomationNode]));
const edgeTypes = { add: AddEdge };
const marker = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#9a9a9a" };
const defaultEdgeOptions = { type: "add", markerEnd: marker };
const rid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

type Picker = { source?: { nodeId: string; handle: string | null }; edgeId?: string; at?: { x: number; y: number }; title?: string } | null;

function useDarkMode() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const el = document.documentElement;
    const upd = () => setDark(el.classList.contains("dark"));
    upd();
    const mo = new MutationObserver(upd); mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function AutomationEditor({ id }: { id: string }) {
  return <ReactFlowProvider><EditorInner id={id} /></ReactFlowProvider>;
}

function EditorInner({ id }: { id: string }) {
  const router = useRouter();
  const rf = useReactFlow<AutoNode, Edge>();
  const dark = useDarkMode();
  const q = trpc.automations.get.useQuery({ id });
  const triggersQ = trpc.automations.triggers.useQuery();
  const update = trpc.automations.update.useMutation();
  const setStatusM = trpc.automations.setStatus.useMutation();
  const testRun = trpc.automations.testRun.useMutation();

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<AutoNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<"draft" | "active" | "paused">("draft");
  const [dirty, setDirty] = React.useState(false);
  const [view, setView] = React.useState<"editor" | "executions">("editor");
  const [picker, setPicker] = React.useState<Picker>(null);
  const [openNode, setOpenNode] = React.useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = React.useState<string | null>(null);
  const [testOpen, setTestOpen] = React.useState(false);
  const [openRun, setOpenRun] = React.useState<string | null>(null);
  const [showIssues, setShowIssues] = React.useState(false);
  const loadedFor = React.useRef<string | null>(null);
  const clipboard = React.useRef<{ nodes: AutoNode[]; edges: Edge[] } | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  // initial load (once per automation id; later refetches don't clobber local edits)
  React.useEffect(() => {
    const a = q.data;
    if (!a || loadedFor.current === a.id) return;
    loadedFor.current = a.id;
    setName(a.name); setStatus(a.status);
    setNodes(a.graph.nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position,
      data: n.type === "trigger" ? { ...n.data, trigger_type: a.trigger_type, config: a.trigger_config ?? {} } : n.data,
    })));
    setEdges(a.graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })));
    setDirty(false);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "executions") setView("executions");
    requestAnimationFrame(() => rf.fitView({ padding: 0.25, maxZoom: 1 }));
  }, [q.data, rf, setNodes, setEdges]);

  React.useEffect(() => {
    if (q.data && loadedFor.current === q.data.id) setStatus(q.data.status);
  }, [q.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // warn on leaving with unsaved changes
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onNodesChange = React.useCallback((ch: NodeChange<AutoNode>[]) => {
    onNodesChangeBase(ch);
    if (ch.some((c) => c.type === "position" || c.type === "remove" || c.type === "add" || c.type === "replace")) setDirty(true);
    const removed = ch.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
    if (removed.length) setOpenNode((o) => (o && removed.includes(o) ? null : o));
  }, [onNodesChangeBase]);
  const onEdgesChange = React.useCallback((ch: EdgeChange<Edge>[]) => {
    onEdgesChangeBase(ch);
    if (ch.some((c) => c.type === "remove" || c.type === "add" || c.type === "replace")) setDirty(true);
  }, [onEdgesChangeBase]);

  const connectEdge = React.useCallback((source: string, target: string, sourceHandle: string | null) => {
    setEdges((es) => [
      ...es.filter((e) => !(e.source === source && (e.sourceHandle ?? null) === (sourceHandle ?? null))),
      { id: rid("e"), source, target, sourceHandle },
    ]);
    setDirty(true);
  }, [setEdges]);

  const onConnect = React.useCallback((c: Connection) => { if (c.source && c.target) connectEdge(c.source, c.target, c.sourceHandle ?? null); }, [connectEdge]);
  const isValidConnection = React.useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false;
    const t = rf.getNode(c.target!);
    return t?.type !== "trigger";
  }, [rf]);

  const patchNode = React.useCallback((nodeId: string, patch: Record<string, any>) => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
    setDirty(true);
  }, [setNodes]);
  const changeType = React.useCallback((nodeId: string, type: string) => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, type } : n)));
    setDirty(true);
  }, [setNodes]);
  const deleteNode = React.useCallback((nodeId: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setOpenNode((o) => (o === nodeId ? null : o));
    setDirty(true);
  }, [setNodes, setEdges]);
  const deleteEdge = React.useCallback((edgeId: string) => { setEdges((es) => es.filter((e) => e.id !== edgeId)); setHoveredEdge(null); setDirty(true); }, [setEdges]);

  /** Find a free spot near (x, y) so new nodes don't stack on top of each other. */
  const freeSpot = React.useCallback((x: number, y: number, ignore?: string) => {
    const all = rf.getNodes();
    let yy = y;
    for (let i = 0; i < 20 && all.some((n) => n.id !== ignore && Math.abs(n.position.x - x) < 240 && Math.abs(n.position.y - yy) < 90); i++) yy += 110;
    return { x, y: yy };
  }, [rf]);

  const addFromPicker = React.useCallback((item: PickItem) => {
    const all = rf.getNodes();
    // Triggers: replace the existing trigger's type instead of adding a second one.
    if (item.type === "trigger") {
      const existing = all.find((n) => n.type === "trigger");
      if (existing) {
        patchNode(existing.id, { trigger_type: item.data?.trigger_type });
        setPicker(null); setOpenNode(existing.id); return;
      }
    }
    const m = metaFor(item.type);
    const newId = rid(item.type);
    const data = { ...m.defaults(), ...(item.data ?? {}), ...(item.type === "trigger" ? { config: { stop_on_reply: true } } : {}) };
    let position = { x: 0, y: 0 };
    const p = picker;
    if (p?.edgeId) {
      const e = rf.getEdge(p.edgeId);
      const s = e && rf.getNode(e.source), t = e && rf.getNode(e.target);
      if (e && s && t) {
        position = { x: s.position.x + 300, y: s.position.y };
        // shift the downstream branch right to make room
        const down = new Set<string>([t.id]); const queue = [t.id];
        const es = rf.getEdges();
        while (queue.length) { const cur = queue.shift()!; for (const x of es) if (x.source === cur && !down.has(x.target)) { down.add(x.target); queue.push(x.target); } }
        const shift = Math.max(0, position.x + 300 - t.position.x);
        setNodes((ns) => [...ns.map((n) => (down.has(n.id) && shift ? { ...n, position: { x: n.position.x + shift, y: n.position.y } } : n)), { id: newId, type: item.type, position, data, selected: false }]);
        setEdges((xs) => [...xs.filter((x) => x.id !== e.id),
          { id: rid("e"), source: e.source, target: newId, sourceHandle: e.sourceHandle ?? null },
          ...(item.type === "end" ? [] : [{ id: rid("e"), source: newId, target: e.target, sourceHandle: item.type === "condition" ? "no" : null }])]);
        setDirty(true); setPicker(null); setOpenNode(item.type === "end" ? null : newId); return;
      }
    }
    if (p?.source) {
      const s = rf.getNode(p.source.nodeId);
      if (s) position = freeSpot(s.position.x + 300, s.position.y + (p.source.handle === "yes" ? -110 : p.source.handle === "no" ? 110 : 0));
    } else if (p?.at) position = p.at;
    else if (item.type === "trigger") {
      const minX = all.length ? Math.min(...all.map((n) => n.position.x)) : 300;
      position = { x: minX - 300, y: all[0]?.position.y ?? 0 };
    } else {
      const r = wrapRef.current?.getBoundingClientRect();
      const c = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2 - 120, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 - 40 });
      position = freeSpot(c.x, c.y);
    }
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id: newId, type: item.type, position, data, selected: true }]);
    if (p?.source) connectEdge(p.source.nodeId, newId, p.source.handle);
    if (item.type === "trigger") {
      const first = all.find((n) => !rf.getEdges().some((e) => e.target === n.id));
      if (first) connectEdge(newId, first.id, null);
    }
    setDirty(true); setPicker(null);
    if (item.type !== "end") setOpenNode(newId);
  }, [rf, picker, patchNode, setNodes, setEdges, connectEdge, freeSpot]);

  const graphForSave = React.useCallback(() => {
    const ns = rf.getNodes(), es = rf.getEdges();
    const trig = ns.find((n) => n.type === "trigger");
    return {
      trigger_type: (trig?.data.trigger_type as string) ?? q.data?.trigger_type ?? "lead_created",
      trigger_config: (trig?.data.config as Record<string, any>) ?? q.data?.trigger_config ?? {},
      graph: {
        nodes: ns.map((n) => {
          const { config: _c, ...rest } = n.data as Record<string, any>;
          return { id: n.id, type: n.type ?? "end", position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.type === "trigger" ? rest : n.data };
        }),
        edges: es.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
      },
    };
  }, [rf, q.data]);

  const save = React.useCallback(async (opts: { status?: "active" | "paused" | "draft"; quiet?: boolean } = {}) => {
    if (!name.trim()) { toast.error("Give the automation a name"); return false; }
    const g = graphForSave();
    if (opts.status === "active") {
      const errs = validate({ nodes: g.graph.nodes, edges: g.graph.edges });
      if (errs.length) { setShowIssues(true); toast.error("Can't activate yet", { description: errs.join(" · ") }); return false; }
    }
    try {
      const r = await update.mutateAsync({ id, name: name.trim(), ...g, ...(opts.status ? { status: opts.status } : {}) });
      setDirty(false);
      if (r && (r as any).status) setStatus((r as any).status);
      if (!opts.quiet) toast.success(opts.status === "active" ? "Saved and activated" : opts.status ? "Saved and deactivated" : "Saved");
      return true;
    } catch { return false; }
  }, [id, name, graphForSave, update]);

  const toggleActive = async (on: boolean) => {
    if (on) { await save({ status: "active" }); return; }
    if (dirty) await save({ status: "paused" });
    else { const r = await setStatusM.mutateAsync({ id, status: "paused" }).catch(() => null); if (r) { setStatus("paused"); toast.success("Automation deactivated"); } }
  };

  const startTest = async (contactId: string) => {
    if (dirty && !(await save({ quiet: true }))) return;
    const errs = validate(graphForSave().graph);
    if (errs.some((e) => e.startsWith("Add a trigger") || e.startsWith("Add at least"))) { toast.error(errs[0]!); return; }
    try {
      const r = await testRun.mutateAsync({ automationId: id, contactId });
      setTestOpen(false);
      if (r.status === "failed") toast.error(`Test run failed: ${r.error ?? ""}`); else toast.success(`Test run ${r.status}`);
      setView("executions"); setOpenRun(r.id);
    } catch { /* toast shown by client */ }
  };

  // keyboard: save, copy/paste, open picker
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); return; }
      if (typing || view !== "editor") return;
      if (mod && e.key.toLowerCase() === "c") {
        const sel = rf.getNodes().filter((n) => n.selected);
        if (!sel.length) return;
        const ids = new Set(sel.map((n) => n.id));
        clipboard.current = { nodes: sel, edges: rf.getEdges().filter((x) => ids.has(x.source) && ids.has(x.target)) };
        toast.success(`Copied ${sel.length} node${sel.length === 1 ? "" : "s"}`);
      } else if (mod && e.key.toLowerCase() === "v" && clipboard.current) {
        const map = new Map<string, string>();
        const hasTrigger = rf.getNodes().some((n) => n.type === "trigger");
        const src = clipboard.current.nodes.filter((n) => !(n.type === "trigger" && hasTrigger));
        const fresh = src.map((n) => { const nid = rid(n.type ?? "node"); map.set(n.id, nid); return { ...n, id: nid, selected: true, position: { x: n.position.x + 60, y: n.position.y + 80 }, data: JSON.parse(JSON.stringify(n.data)) }; });
        const freshEdges = clipboard.current.edges.filter((x) => map.has(x.source) && map.has(x.target)).map((x) => ({ ...x, id: rid("e"), source: map.get(x.source)!, target: map.get(x.target)!, selected: false }));
        setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...fresh]);
        setEdges((es) => [...es, ...freshEdges]);
        clipboard.current = { nodes: fresh, edges: freshEdges };
        setDirty(true);
      } else if (e.key === "Tab" && !mod) {
        e.preventDefault(); setPicker({});
      }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [save, rf, view, setNodes, setEdges]);

  const triggers = triggersQ.data ?? [];
  const triggerLabels = React.useMemo(() => Object.fromEntries(triggers.map((t) => [t.id, t.label])), [triggers]);
  const edgesView = React.useMemo(() => edges.map((e) => (e.type ? e : { ...e, type: "add", markerEnd: marker })), [edges]);
  const connected = React.useMemo(() => new Set(edges.map((e) => `${e.source}:${e.sourceHandle ?? "out"}`)), [edges]);
  const issues = React.useMemo(() => {
    if (!showIssues) return new Set<string>();
    const s = new Set<string>();
    const trig = nodes.find((n) => n.type === "trigger");
    const seen = new Set<string>(trig ? [trig.id] : []); const queue = trig ? [trig.id] : [];
    while (queue.length) { const cur = queue.shift()!; for (const e of edges) if (e.source === cur && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target); } }
    for (const n of nodes) if (n.type !== "end" && !seen.has(n.id)) s.add(n.id);
    for (const n of nodes) if (nodeIssues(n.type ?? "", n.data).length) s.add(n.id);
    return s;
  }, [showIssues, nodes, edges]);

  const ctx: EditorCtxValue = React.useMemo(() => ({
    triggerLabels, connected, issues, hoveredEdge, setHoveredEdge,
    onAddAfter: (nodeId, handle) => setPicker({ source: { nodeId, handle } }),
    onInsertOnEdge: (edgeId) => setPicker({ edgeId, title: "Insert a step" }),
    onOpen: (nodeId) => { setPicker(null); setOpenNode(nodeId); },
    onDeleteNode: deleteNode, onDeleteEdge: deleteEdge,
  }), [triggerLabels, connected, issues, hoveredEdge, deleteNode, deleteEdge]);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <Empty title="Automation not found" body={q.error?.message} action={<Button onClick={() => router.push("/automations")}>Back to automations</Button>} />;

  const panelNode = openNode ? nodes.find((n) => n.id === openNode) : null;
  const hasTrigger = nodes.some((n) => n.type === "trigger");

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-border bg-bg px-3">
        <button type="button" title="Back to automations" className="rounded p-1.5 text-muted hover:bg-hover hover:text-fg"
          onClick={() => { if (!dirty || window.confirm("You have unsaved changes. Leave without saving?")) router.push("/automations"); }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-8 min-w-0 max-w-[340px] flex-1 truncate rounded px-2 text-sm font-semibold text-fg hover:bg-hover focus:bg-bg focus:outline-none focus:ring-2 focus:ring-accent/20" />
        <div className="absolute left-1/2 hidden -translate-x-1/2 rounded-md border border-border bg-subtle p-0.5 md:flex">
          {(["editor", "executions"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={cn("h-7 rounded px-3 text-sm capitalize", view === v ? "bg-bg font-medium text-fg shadow-card" : "text-muted hover:text-fg")}>{v}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex md:hidden">
            <Button size="xs" variant="ghost" onClick={() => setView(view === "editor" ? "executions" : "editor")}>{view === "editor" ? "Executions" : "Editor"}</Button>
          </div>
          <label className="flex items-center gap-2 pr-1 text-sm text-muted">
            {status === "active" ? <span className="text-success">Active</span> : "Inactive"}
            <Switch checked={status === "active"} disabled={update.isPending || setStatusM.isPending} onChange={(v) => void toggleActive(v)} />
          </label>
          <Button icon={<FlaskConical className="h-3.5 w-3.5" />} onClick={() => setTestOpen(true)}>Test run</Button>
          <Button variant={dirty ? "primary" : "secondary"} onClick={() => void save()} disabled={update.isPending}
            icon={update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} title="Save (Ctrl/Cmd+S)">
            <span className="relative">Save{dirty && <span className="absolute -right-2.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning" />}</span>
          </Button>
        </div>
      </div>

      {view === "executions" ? (
        <div className="min-h-0 flex-1"><Executions automationId={id} openRunId={openRun} onOpenRun={setOpenRun} /></div>
      ) : (
        <div ref={wrapRef} className="relative min-h-0 flex-1 bg-panel">
          <EditorCtx.Provider value={ctx}>
            <ReactFlow<AutoNode, Edge>
              nodes={nodes} edges={edgesView} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
              onNodeDoubleClick={(_, n) => { setPicker(null); setOpenNode(n.id); }}
              onNodeContextMenu={(e, n) => { e.preventDefault(); setOpenNode(null); setPicker({ source: { nodeId: n.id, handle: n.type === "condition" ? (connected.has(`${n.id}:yes`) ? "no" : "yes") : null } }); }}
              onPaneContextMenu={(e) => { e.preventDefault(); setOpenNode(null); setPicker({ at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), title: "Add a node" }); }}
              onPaneClick={() => { setPicker(null); setOpenNode(null); }}
              onEdgeMouseEnter={(_, e) => setHoveredEdge(e.id)} onEdgeMouseLeave={() => setHoveredEdge(null)}
              deleteKeyCode={["Delete", "Backspace"]} multiSelectionKeyCode={["Meta", "Control"]} selectionKeyCode="Shift"
              colorMode={dark ? "dark" : "light"} minZoom={0.2} maxZoom={2} snapToGrid snapGrid={[20, 20]} proOptions={{ hideAttribution: true }}
              className="!bg-panel">
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color={dark ? "#3a3a3a" : "#cfcfcf"} />
              <MiniMap pannable zoomable className="!rounded-md !border !border-border !bg-bg" maskColor={dark ? "rgba(0,0,0,0.5)" : "rgba(240,240,240,0.6)"}
                nodeColor={(n) => metaFor(n.type ?? "").color} nodeBorderRadius={8} />
              <Controls showInteractive={false} position="bottom-left" className="!rounded-md !border !border-border !shadow-card" />
              <Panel position="top-right" className="flex flex-col gap-2">
                <button type="button" title="Add node (Tab)" onClick={() => { setOpenNode(null); setPicker({}); }}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong bg-bg text-fg shadow-card hover:border-accent hover:text-accent"><Plus className="h-5 w-5" /></button>
                <button type="button" title="Fit view" onClick={() => rf.fitView({ padding: 0.25, duration: 300, maxZoom: 1 })}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-bg text-muted shadow-card hover:text-fg"><Maximize2 className="h-4 w-4" /></button>
              </Panel>
              {!hasTrigger && (
                <Panel position="top-center">
                  <button type="button" onClick={() => setPicker({ title: "Add a trigger" })} className="mt-16 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-bg px-10 py-8 text-sm text-muted hover:border-accent hover:text-accent">
                    <Plus className="h-6 w-6" />Add first step: pick a trigger
                  </button>
                </Panel>
              )}
              <Panel position="bottom-center" className="!mb-3 hidden rounded-md border border-border bg-bg/90 px-3 py-1 text-[11px] text-faint shadow-card lg:block">
                Double-click to edit · Right-click to add · Del to remove · Shift+drag to multi-select · ⌘/Ctrl C/V copy · ⌘/Ctrl S save
              </Panel>
            </ReactFlow>
          </EditorCtx.Provider>
          {picker && (
            <NodePicker triggers={triggers} hasTrigger={hasTrigger} title={picker.title} onClose={() => setPicker(null)} onPick={addFromPicker} />
          )}
          {panelNode && (
            <NodePanel key={panelNode.id}
              node={{ id: panelNode.id, type: panelNode.type ?? "end", data: panelNode.data }} triggers={triggers}
              onChange={(p) => patchNode(panelNode.id, p)} onChangeType={(t) => changeType(panelNode.id, t)}
              onDelete={() => deleteNode(panelNode.id)} onClose={() => setOpenNode(null)} />
          )}
        </div>
      )}
      <ContactPicker open={testOpen} onClose={() => setTestOpen(false)} title="Test run: pick a contact" loading={testRun.isPending || update.isPending}
        hint={<>The contact enters this automation right now and <b>real messages are sent</b> (waits still apply; pick yourself or a test contact). Unsaved changes are saved first. Works even while inactive.</>}
        onPick={(ids) => ids[0] && void startTest(ids[0])} />
    </div>
  );
}
