"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Portal } from "@/components/ui";

export type Rect = { left: number; top: number; width: number; height: number };
export const toRect = (r: DOMRect | Rect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height });

/** Google-style floating card next to an anchor rect. Closes on outside click / Esc. */
export function AnchoredPopover({ rect, onClose, width = 448, children, ignoreOutside }: {
  rect: Rect; onClose: () => void; width?: number; children: React.ReactNode; ignoreOutside?: (t: Node) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight, w = Math.min(width, W - 16);
    let left = rect.left + rect.width + 8;
    if (left + w > W - 8) left = rect.left - w - 8;
    if (left < 8) left = Math.max(8, Math.min(W - w - 8, rect.left + rect.width / 2 - w / 2));
    let top = rect.top;
    if (top + h > H - 8) top = H - h - 8;
    setPos({ left, top: Math.max(8, top) });
  }, [rect.left, rect.top, rect.width, rect.height, width]);

  useEffect(() => {
    const md = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (ignoreOutside?.(t)) return;
      // don't close when interacting with a dialog layered above
      if ((t as HTMLElement).closest?.("[data-cal-keep]")) return;
      closeRef.current();
    };
    const kd = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    const id = setTimeout(() => document.addEventListener("mousedown", md), 0);
    window.addEventListener("keydown", kd);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", md); window.removeEventListener("keydown", kd); };
  }, [ignoreOutside]);

  return (
    <Portal>
      <div ref={ref} data-cal-popover className="fixed z-40 rounded-lg border border-border bg-bg shadow-pop"
        style={{ width: `min(${width}px, calc(100vw - 16px))`, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </Portal>
  );
}
