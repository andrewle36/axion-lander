"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Dialog, Button, Checkbox, Avatar, Spinner, StatusBadge } from "@/components/ui";
import { cn, fullName, fmtPhone } from "@/lib/utils";

/** Searchable contact picker. Single mode calls onPick immediately; multi mode confirms with a button. */
export function ContactPicker({ open, onClose, title, multi, confirmLabel, loading, onPick, hint }: {
  open: boolean; onClose: () => void; title: string; multi?: boolean; confirmLabel?: string; loading?: boolean; hint?: React.ReactNode;
  onPick: (ids: string[]) => void;
}) {
  const [q, setQ] = React.useState("");
  const [deb, setDeb] = React.useState("");
  const [sel, setSel] = React.useState<string[]>([]);
  React.useEffect(() => { const t = setTimeout(() => setDeb(q), 250); return () => clearTimeout(t); }, [q]);
  React.useEffect(() => { if (!open) { setSel([]); setQ(""); } }, [open]);
  const list = trpc.contacts.list.useQuery({ q: deb || undefined, pageSize: 50 }, { enabled: open });
  const rows = (list.data?.rows ?? []) as any[];
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Dialog open={open} onClose={onClose} title={title} width={560}
      footer={multi ? (
        <>
          <span className="mr-auto self-center text-xs text-muted">{sel.length} selected</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!sel.length} loading={loading} onClick={() => onPick(sel)}>{confirmLabel ?? "Confirm"}</Button>
        </>
      ) : undefined}>
      {hint && <div className="mb-3 text-xs text-muted">{hint}</div>}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-faint" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email…"
          className="h-8 w-full rounded border border-border bg-bg pl-8 pr-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15" />
      </div>
      {list.isLoading ? <div className="flex justify-center p-6"><Spinner /></div> : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted">No contacts found.</div>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {rows.map((c) => (
            <button key={c.id} type="button" disabled={loading && !multi}
              onClick={() => (multi ? toggle(c.id) : onPick([c.id]))}
              className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover", multi && sel.includes(c.id) && "bg-accent-soft")}>
              {multi && <Checkbox checked={sel.includes(c.id)} onChange={() => toggle(c.id)} />}
              <Avatar name={fullName(c)} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{fullName(c)}</span>
                <span className="block truncate text-xs text-muted">{[fmtPhone(c.phone), c.email].filter(Boolean).join(" · ") || "No phone or email"}</span>
              </span>
              <StatusBadge status={c.status} />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
