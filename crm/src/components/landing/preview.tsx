"use client";
import * as React from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingRenderer } from "./renderer";
import type { LandingContent } from "./types";

/** Scaled, iframe-free preview of the public renderer. */
export function ScaledPreview({ content, pageId, variantId, device, thankYou }: {
  content: LandingContent; pageId: string; variantId: string | null; device: "desktop" | "mobile"; thankYou?: string | null;
}) {
  const outer = React.useRef<HTMLDivElement>(null);
  const inner = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(600);
  const [h, setH] = React.useState(800);
  const base = device === "desktop" ? 1200 : 390;
  React.useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (outer.current) setW(outer.current.clientWidth);
      if (inner.current) setH(inner.current.scrollHeight);
    });
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, (w - (device === "mobile" ? 32 : 0)) / base);
  return (
    <div ref={outer} className="w-full">
      <div className={cn("mx-auto overflow-hidden rounded-md border border-border bg-white shadow-card", device === "mobile" && "rounded-[22px] border-4 border-border-strong")}
        style={{ width: base * scale + (device === "mobile" ? 8 : 0), height: h * scale + (device === "mobile" ? 8 : 0) }}>
        <div ref={inner} style={{ width: base, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <LandingRenderer content={content} pageId={`preview-${pageId}`} variantId={variantId} mode="preview" layout={device} thankYou={thankYou} />
        </div>
      </div>
    </div>
  );
}

export function DeviceToggle({ value, onChange }: { value: "desktop" | "mobile"; onChange: (v: "desktop" | "mobile") => void }) {
  return (
    <div className="inline-flex rounded border border-border p-0.5">
      {(["desktop", "mobile"] as const).map((d) => (
        <button key={d} type="button" onClick={() => onChange(d)} title={d}
          className={cn("flex h-6 w-7 items-center justify-center rounded-sm", value === d ? "bg-subtle text-fg" : "text-faint hover:text-fg")}>
          {d === "desktop" ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  );
}
