"use client";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Copy, Link2, Menu as MenuIcon, RefreshCw, Search, Webhook, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Menu, MenuItem, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { VIEWS, type View } from "@/components/calendar/lib";

export function TopBar({ onToggleSidebar, view, setView, title, onToday, onPrev, onNext, search, setSearch, searchFocusKey }: {
  onToggleSidebar: () => void; view: View; setView: (v: View) => void; title: string;
  onToday: () => void; onPrev: () => void; onNext: () => void;
  search: string | null; setSearch: (q: string | null) => void; searchFocusKey: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchFocusKey) { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); } }, [searchFocusKey]);
  useEffect(() => { if (search === null) { setQ(""); } }, [search]);
  const today = new Date();

  return (
    <header className="flex h-16 shrink-0 items-center gap-1 border-b border-border bg-bg pl-2 pr-3">
      {search !== null ? (
        <button type="button" aria-label="Back" onClick={() => { setSearch(null); setOpen(false); }} className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:bg-hover"><ArrowLeft className="h-5 w-5" /></button>
      ) : (
        <button type="button" aria-label="Main menu" title="Main menu" onClick={onToggleSidebar} className="flex h-12 w-12 items-center justify-center rounded-full text-muted hover:bg-hover"><MenuIcon className="h-5 w-5" /></button>
      )}
      <div className="mr-6 flex items-center gap-2 pl-1">
        <div className="relative flex h-10 w-10 flex-col overflow-hidden rounded-md border border-border bg-bg shadow-card">
          <div className="h-2.5 bg-accent" />
          <div className="flex flex-1 items-center justify-center text-[15px] font-semibold leading-none text-accent">{format(today, "d")}</div>
        </div>
        <span className="hidden text-[22px] text-fg sm:inline">Calendar</span>
      </div>

      {search === null ? (
        <>
          <button type="button" onClick={onToday} title={format(today, "EEEE, MMMM d")}
            className="mr-3 h-9 rounded-full border border-border-strong px-5 text-sm font-medium text-fg hover:bg-hover">Today</button>
          <button type="button" aria-label="Previous period" onClick={onPrev} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" aria-label="Next period" onClick={onNext} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover"><ChevronRight className="h-5 w-5" /></button>
          <div className="ml-3 truncate text-[22px] text-fg">{title}</div>
        </>
      ) : <div className="text-[22px] text-fg">Search</div>}

      <div className="ml-auto flex items-center gap-1">
        {open || search !== null ? (
          <form className="relative mr-1 w-[min(420px,40vw)]" onSubmit={(e) => { e.preventDefault(); if (q.trim()) setSearch(q.trim()); }}>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events"
              onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setSearch(null); setOpen(false); } }}
              className="h-9 w-full rounded-md bg-subtle pl-9 pr-9 text-sm text-fg placeholder:text-muted focus:bg-bg focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <button type="button" aria-label="Clear search" onClick={() => { setQ(""); setSearch(null); setOpen(false); }} className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted hover:bg-hover"><X className="h-4 w-4" /></button>
          </form>
        ) : (
          <button type="button" aria-label="Search" title="Search (/)" onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover"><Search className="h-5 w-5" /></button>
        )}

        <Menu align="right" width={280} trigger={
          <button type="button" title="Calendly" className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted hover:bg-hover hover:text-fg">
            <Link2 className="h-4 w-4" /><span className="hidden md:inline">Calendly</span><ChevronDown className="h-3.5 w-3.5" />
          </button>
        }>
          {(close) => <CalendlyMenu close={close} />}
        </Menu>

        <Menu align="right" width={200} trigger={
          <button type="button" className="flex h-9 items-center gap-2 rounded-full border border-border-strong pl-4 pr-3 text-sm font-medium text-fg hover:bg-hover">
            {VIEWS.find((v) => v.id === view)?.label}<ChevronDown className="h-4 w-4 text-muted" />
          </button>
        }>
          {(close) => VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => { setView(v.id); close(); }}
              className={cn("flex h-9 w-full items-center justify-between rounded px-3 text-sm hover:bg-hover", view === v.id && "bg-accent-soft text-accent")}>
              <span>{v.label}</span><span className="text-xs text-faint">{v.key}</span>
            </button>
          ))}
        </Menu>
      </div>
    </header>
  );
}

function CalendlyMenu({ close }: { close: () => void }) {
  const links = trpc.calendar.calendlyLinks.useQuery(undefined, { retry: false });
  const sync = trpc.calendar.syncCalendly.useMutation();
  const connect = trpc.calendar.connectCalendly.useMutation();
  const copy = async (url: string, name: string) => {
    try { await navigator.clipboard.writeText(url); toast.success(`Copied “${name}” link`); }
    catch { window.prompt("Copy this scheduling link", url); }
    close();
  };
  return (
    <div>
      <MenuItem icon={sync.isPending ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
        onClick={async () => { const r = await sync.mutateAsync(); toast.success(`Calendly synced: ${r.created} new, ${r.updated} updated`); close(); }}>
        Sync now (last 7 days →)
      </MenuItem>
      <MenuItem icon={connect.isPending ? <Spinner className="h-4 w-4" /> : <Webhook className="h-4 w-4" />}
        onClick={async () => { const r = await connect.mutateAsync(); toast.success(`Calendly webhook ${r.state}: new bookings will appear automatically`); close(); }}>
        Connect live booking webhook
      </MenuItem>
      <div className="my-1 border-t border-border" />
      <div className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-faint">Book via Calendly</div>
      {links.isLoading ? <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-faint"><Spinner />Loading event types…</div>
        : links.error ? <div className="px-2 py-1.5 text-xs text-danger">{links.error.message}</div>
        : (links.data ?? []).length === 0 ? <div className="px-2 py-1.5 text-sm text-faint">No active event types</div>
        : links.data!.map((l) => (
          <div key={l.uri} className="flex items-center gap-1 rounded hover:bg-hover">
            <button type="button" onClick={() => copy(l.url, l.name)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color || "#039be5" }} />
              <span className="min-w-0 flex-1 truncate">{l.name}<span className="ml-1 text-xs text-faint">{l.duration}m</span></span>
              <Copy className="h-3.5 w-3.5 text-muted" />
            </button>
            <a href={l.url} target="_blank" rel="noreferrer" title="Open" className="p-1.5 text-muted hover:text-fg"><ExternalLink className="h-3.5 w-3.5" /></a>
          </div>
        ))}
    </div>
  );
}
