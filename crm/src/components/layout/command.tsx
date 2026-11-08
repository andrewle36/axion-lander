"use client";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Users, Building2, KanbanSquare, Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { NAV } from "./nav";
import { Portal } from "@/components/ui";
import { dealNo } from "@/lib/utils";

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const res = trpc.search.global.useQuery({ q }, { enabled: open && q.length > 1 });
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!open); } if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, setOpen]);
  if (!open) return null;
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[12vh]" onMouseDown={() => setOpen(false)}>
        <Command shouldFilter={false} className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-bg shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-faint" />
            <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search contacts, accounts, deals, VINs, plates… or jump to a page" className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
          </div>
          <Command.List className="scroll-thin max-h-[50vh] overflow-y-auto p-1">
            {res.data?.contacts.map((c) => (
              <Command.Item key={c.id} onSelect={() => go(`/contacts/${c.id}`)} className="flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm data-[selected=true]:bg-hover">
                <Users className="h-4 w-4 text-muted" />{c.label}<span className="ml-auto text-xs text-faint">{c.sub}</span>
              </Command.Item>
            ))}
            {res.data?.companies.map((c) => (
              <Command.Item key={c.id} onSelect={() => go(`/accounts/${c.id}`)} className="flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm data-[selected=true]:bg-hover">
                <Building2 className="h-4 w-4 text-muted" />{c.label}<span className="ml-auto text-xs text-faint">{c.sub}</span>
              </Command.Item>
            ))}
            {res.data?.deals.map((d) => (
              <Command.Item key={d.id} onSelect={() => go(`/deals?open=${d.id}`)} className="flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm data-[selected=true]:bg-hover">
                <KanbanSquare className="h-4 w-4 text-muted" />{dealNo(d.number)} {d.label}<span className="ml-auto text-xs text-faint">{d.sub}</span>
              </Command.Item>
            ))}
            <Command.Group heading={<span className="px-2 text-xs text-faint">Pages</span>}>
              {NAV.flatMap((s) => s.items).filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase())).map((i) => (
                <Command.Item key={i.href} onSelect={() => go(i.href)} className="flex h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm data-[selected=true]:bg-hover">
                  <i.icon className="h-4 w-4 text-muted" />{i.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </Portal>
  );
}
