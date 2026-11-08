"use client";
import * as React from "react";
import { Search, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUPS, NODE_META, type NodeGroup } from "./meta";
import { IconTile } from "./flow-node";

export type PickItem = { key: string; type: string; label: string; description: string; group: NodeGroup; data?: Record<string, any> };

export function NodePicker({ triggers, hasTrigger, onPick, onClose, title }: {
  triggers: { id: string; label: string; description: string }[];
  hasTrigger: boolean;
  onPick: (item: PickItem) => void;
  onClose: () => void;
  title?: string;
}) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const items = React.useMemo<PickItem[]>(() => {
    const out: PickItem[] = triggers.map((t) => ({ key: `trigger:${t.id}`, type: "trigger", label: t.label, description: hasTrigger ? `Replace the current trigger. ${t.description}` : t.description, group: "Triggers" as NodeGroup, data: { trigger_type: t.id } }));
    for (const [type, m] of Object.entries(NODE_META)) if (type !== "trigger") out.push({ key: type, type, label: m.label, description: m.description, group: m.group });
    const s = q.trim().toLowerCase();
    return s ? out.filter((i) => `${i.label} ${i.description} ${i.group}`.toLowerCase().includes(s)) : out;
  }, [triggers, hasTrigger, q]);

  React.useEffect(() => setActive(0), [q]);
  const ordered = GROUPS.flatMap((g) => items.filter((i) => i.group === g));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(ordered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && ordered[active]) { e.preventDefault(); onPick(ordered[active]!); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  return (
    <div className="absolute bottom-0 right-0 top-0 z-20 flex w-[360px] max-w-full flex-col border-l border-border bg-bg shadow-pop" onKeyDown={onKey}>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="text-sm font-semibold">{title ?? "What happens next?"}</div>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-hover hover:text-fg" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search nodes…"
            className="h-8 w-full rounded border border-border bg-bg pl-8 pr-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15" />
        </div>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto pb-4">
        {ordered.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">No nodes match “{q}”.</div>}
        {GROUPS.map((g) => {
          const list = ordered.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-1">
              <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {g === "Triggers" && <Zap className="h-3 w-3" />}{g}
              </div>
              {list.map((i) => {
                const idx = ordered.indexOf(i);
                return (
                  <button key={i.key} type="button" onMouseEnter={() => setActive(idx)} onClick={() => onPick(i)}
                    className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", idx === active ? "bg-hover" : "hover:bg-hover")}>
                    <IconTile type={i.type} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{i.label}</span>
                      <span className="block truncate text-xs text-muted">{i.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
