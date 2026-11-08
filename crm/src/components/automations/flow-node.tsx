"use client";
import * as React from "react";
import { Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, type NodeProps, type EdgeProps, type Node } from "@xyflow/react";
import { Plus, Trash2, Settings2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { metaFor, summarize, type NodeData } from "./meta";

export type EditorCtxValue = {
  triggerLabels: Record<string, string>;
  connected: Set<string>; // `${nodeId}:${handle}`
  issues: Set<string>; // node ids with validation problems
  onAddAfter: (nodeId: string, handle: string | null) => void;
  onInsertOnEdge: (edgeId: string) => void;
  onOpen: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  hoveredEdge: string | null;
  setHoveredEdge: (id: string | null) => void;
};
export const EditorCtx = React.createContext<EditorCtxValue | null>(null);
const useEditor = () => { const c = React.useContext(EditorCtx); if (!c) throw new Error("EditorCtx missing"); return c; };

export type AutoNode = Node<NodeData>;

function IconTile({ type, size = 40 }: { type: string; size?: number }) {
  const m = metaFor(type);
  const Icon = m.icon;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-md" style={{ width: size, height: size, background: `${m.color}1f`, color: m.color }}>
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </span>
  );
}
export { IconTile };

function AddStub({ nodeId, handle, top }: { nodeId: string; handle: string | null; top: string }) {
  const ed = useEditor();
  if (ed.connected.has(`${nodeId}:${handle ?? "out"}`)) return null;
  return (
    <div className="nodrag nopan absolute left-full flex items-center" style={{ top, transform: "translateY(-50%)" }}>
      <span className="h-px w-10 bg-border-strong" />
      <button type="button" title="Add next step" onClick={(e) => { e.stopPropagation(); ed.onAddAfter(nodeId, handle); }}
        className="flex h-6 w-6 items-center justify-center rounded border border-border-strong bg-bg text-muted shadow-card hover:border-accent hover:text-accent">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const handleCls = "!h-3 !w-3 !rounded-full !border-2 !border-bg !bg-border-strong hover:!bg-accent";

export function AutomationNode({ id, type, data, selected }: NodeProps<AutoNode>) {
  const ed = useEditor();
  const m = metaFor(type);
  const isTrigger = type === "trigger", isCond = type === "condition", isEnd = type === "end";
  const title = (data.label as string) || (isTrigger ? "When this happens" : m.label);
  const summary = summarize(type, data, ed.triggerLabels);
  const hasIssue = ed.issues.has(id);
  return (
    <div className="group relative" onDoubleClick={(e) => { e.stopPropagation(); ed.onOpen(id); }}>
      {/* hover toolbar */}
      <div className="nodrag nopan absolute -top-8 right-0 hidden items-center gap-0.5 rounded-md border border-border bg-bg p-0.5 shadow-card group-hover:flex">
        <button type="button" title="Open" onClick={(e) => { e.stopPropagation(); ed.onOpen(id); }} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"><Settings2 className="h-3.5 w-3.5" /></button>
        <button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); ed.onDeleteNode(id); }} className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className={cn(
        "flex w-[240px] items-center gap-3 border bg-bg px-3 py-3 shadow-card transition-shadow",
        isTrigger ? "rounded-l-[32px] rounded-r-xl pl-3" : "rounded-xl",
        isCond && "min-h-[84px]",
        selected ? "border-accent ring-2 ring-accent/25" : hasIssue ? "border-warning" : "border-border-strong hover:shadow-pop",
      )}>
        <IconTile type={type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-[13px] font-semibold text-fg">
            {title}
            {hasIssue && <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />}
          </div>
          <div className="line-clamp-2 text-xs leading-4 text-muted">{summary}</div>
        </div>
      </div>
      {!isTrigger && <Handle type="target" position={Position.Left} className={handleCls} />}
      {isCond ? (
        <>
          <Handle id="yes" type="source" position={Position.Right} style={{ top: "30%" }} className={cn(handleCls, "!bg-success")} />
          <Handle id="no" type="source" position={Position.Right} style={{ top: "70%" }} className={cn(handleCls, "!bg-danger")} />
          <span className="pointer-events-none absolute -right-1 top-[30%] -translate-y-[130%] translate-x-full text-[10px] font-medium text-success">yes</span>
          <span className="pointer-events-none absolute -right-1 top-[70%] translate-y-[30%] translate-x-full text-[10px] font-medium text-danger">no</span>
          <AddStub nodeId={id} handle="yes" top="30%" />
          <AddStub nodeId={id} handle="no" top="70%" />
        </>
      ) : !isEnd && (
        <>
          <Handle type="source" position={Position.Right} className={handleCls} />
          <AddStub nodeId={id} handle={null} top="50%" />
        </>
      )}
    </div>
  );
}

export function AddEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected, style }: EdgeProps) {
  const ed = useEditor();
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const show = selected || ed.hoveredEdge === id;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, stroke: selected ? "rgb(var(--accent))" : "rgb(var(--faint))", strokeWidth: selected ? 2 : 1.5 }} interactionWidth={24} />
      <EdgeLabelRenderer>
        <div className={cn("nodrag nopan absolute flex gap-1 transition-opacity", show ? "opacity-100" : "pointer-events-none opacity-0")}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: show ? "all" : "none" }}
          onMouseEnter={() => ed.setHoveredEdge(id)} onMouseLeave={() => ed.setHoveredEdge(null)}>
          <button type="button" title="Insert step" onClick={() => ed.onInsertOnEdge(id)} className="flex h-6 w-6 items-center justify-center rounded border border-border-strong bg-bg text-muted shadow-card hover:border-accent hover:text-accent"><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" title="Delete connection" onClick={() => ed.onDeleteEdge(id)} className="flex h-6 w-6 items-center justify-center rounded border border-border-strong bg-bg text-muted shadow-card hover:border-danger hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
