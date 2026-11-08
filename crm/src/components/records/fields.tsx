"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Twenty-style inline editable field row: label left, value right, click to edit, blur/enter saves. */
export function InlineField({ label, icon, value, display, onSave, type = "text", options, placeholder = "Empty", multiline }: {
  label: string; icon?: React.ReactNode; value: string | number | null | undefined; display?: React.ReactNode;
  onSave: (v: string) => void; type?: "text" | "email" | "tel" | "number" | "date" | "select"; options?: { value: string; label: string }[];
  placeholder?: string; multiline?: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value == null ? "" : String(value));
  const ref = useRef<any>(null);
  useEffect(() => { if (!edit) setV(value == null ? "" : String(value)); }, [value, edit]);
  useEffect(() => { if (edit) ref.current?.focus(); }, [edit]);
  const commit = () => { setEdit(false); if (v !== (value == null ? "" : String(value))) onSave(v); };
  const cls = "w-full rounded border border-accent bg-bg px-1.5 py-0.5 text-sm outline-none";
  return (
    <div className="flex min-h-8 items-start gap-2 py-0.5">
      <div className="flex w-[110px] shrink-0 items-center gap-1.5 pt-1 text-xs text-muted">{icon}{label}</div>
      <div className="min-w-0 flex-1">
        {edit ? (
          type === "select" ? (
            <select ref={ref} className={cls} value={v} onChange={(e) => { setV(e.target.value); setEdit(false); if (e.target.value !== String(value ?? "")) onSave(e.target.value); }} onBlur={() => setEdit(false)}>
              {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : multiline ? (
            <textarea ref={ref} rows={3} className={cls} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Escape") setEdit(false); }} />
          ) : (
            <input ref={ref} type={type} className={cls} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEdit(false); }} />
          )
        ) : (
          <button type="button" onClick={() => setEdit(true)} className={cn("w-full truncate rounded px-1.5 py-1 text-left text-sm hover:bg-hover", (value == null || value === "") && !display && "text-faint", multiline && "whitespace-pre-wrap")}>
            {display ?? (value == null || value === "" ? placeholder : (type === "select" ? options?.find((o) => o.value === String(value))?.label ?? value : value))}
          </button>
        )}
      </div>
    </div>
  );
}
