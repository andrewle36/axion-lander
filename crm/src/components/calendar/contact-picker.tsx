"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Spinner } from "@/components/ui";
import { cn, fmtPhone, fullName } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PickedContact = { id: string; first_name: string; last_name: string; phone?: string | null; email?: string | null; company_id?: string | null };

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/** Contact search select backed by trpc.contacts.list({ q }). */
export function ContactPicker({ value, onChange, placeholder = "Add a contact", autoFocus, className }: {
  value: PickedContact | null; onChange: (c: PickedContact | null) => void; placeholder?: string; autoFocus?: boolean; className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const dq = useDebounced(q);
  const ref = useRef<HTMLDivElement>(null);
  const list = trpc.contacts.list.useQuery({ q: dq, pageSize: 8 }, { enabled: open && dq.trim().length > 0 });
  const rows = ((list.data?.rows ?? []) as any[]) as PickedContact[];
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  useEffect(() => setHi(0), [dq]);

  if (value) {
    return (
      <div className={cn("flex h-8 items-center gap-2 rounded border border-border bg-bg px-2", className)}>
        <Avatar name={fullName(value)} size={20} />
        <span className="min-w-0 flex-1 truncate text-sm">{fullName(value)}{value.phone ? <span className="ml-2 text-faint">{fmtPhone(value.phone)}</span> : null}</span>
        <button type="button" aria-label="Remove contact" className="text-faint hover:text-fg" onClick={() => onChange(null)}><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  const pick = (c: PickedContact) => { onChange(c); setQ(""); setOpen(false); };
  return (
    <div ref={ref} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
      <input autoFocus={autoFocus} value={q} placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === "Enter" && rows[hi]) { e.preventDefault(); pick(rows[hi]!); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }}
        className="h-8 w-full rounded border border-border bg-bg pl-8 pr-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15" />
      {open && q.trim() && (
        <div className="absolute left-0 right-0 z-[70] mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-bg p-1 shadow-pop">
          {list.isLoading ? <div className="flex items-center gap-2 p-2 text-sm text-faint"><Spinner />Searching…</div>
            : rows.length === 0 ? <div className="p-2 text-sm text-faint">No contacts match “{q}”</div>
            : rows.map((c, i) => (
              <button key={c.id} type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(c)}
                className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm", i === hi && "bg-hover")}>
                <Avatar name={fullName(c)} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{fullName(c)}</span>
                  <span className="block truncate text-xs text-faint">{[fmtPhone(c.phone), c.email].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
