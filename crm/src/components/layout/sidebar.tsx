"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Moon, Sun, LogOut, PanelLeftClose, PanelLeft, Plus } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { Avatar, Menu, MenuItem } from "@/components/ui";
import { useTheme } from "./theme";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { trpc } from "@/lib/trpc/client";
import { useEffect, useState } from "react";

export function Sidebar({ onSearch, collapsed, setCollapsed }: { onSearch: () => void; collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const path = usePathname();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const me = trpc.team.me.useQuery();
  const unread = trpc.comms.unreadCount.useQuery(undefined, { refetchInterval: 20_000 });
  const isAdmin = me.data && me.data.role !== "rep";
  const signOut = async () => { await supabaseBrowser().auth.signOut(); router.push("/login"); };

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-2">
        <button onClick={() => setCollapsed(false)} className="mb-2 flex h-8 w-8 items-center justify-center rounded hover:bg-hover" title="Expand"><PanelLeft className="h-4 w-4 text-muted" /></button>
        {NAV.flatMap((s) => s.items).filter((i) => !i.admin || isAdmin).map((i) => (
          <Link key={i.href} href={i.href} title={i.label} className={cn("flex h-8 w-8 items-center justify-center rounded hover:bg-hover", path.startsWith(i.href) && "bg-hover")}>
            <i.icon className="h-4 w-4 text-muted" />
          </Link>
        ))}
      </aside>
    );
  }
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <Menu width={210} trigger={
          <button className="flex min-w-0 items-center gap-2 rounded px-1 py-1 hover:bg-hover">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0E6B43] text-[10px] font-bold text-white">NS</span>
            <span className="truncate text-sm font-semibold">Newport Smog</span>
          </button>}>
          {(close) => (<>
            <div className="px-2 py-1.5 text-xs text-faint">{me.data?.email}</div>
            <MenuItem icon={theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} onClick={() => { toggle(); close(); }}>{theme === "dark" ? "Light mode" : "Dark mode"}</MenuItem>
            <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={signOut}>Sign out</MenuItem>
          </>)}
        </Menu>
        <button onClick={() => setCollapsed(true)} className="ml-auto rounded p-1 text-muted hover:bg-hover" title="Collapse sidebar"><PanelLeftClose className="h-4 w-4" /></button>
      </div>
      <div className="px-2 py-1">
        <button onClick={onSearch} className="flex h-8 w-full items-center gap-2 rounded px-2 text-sm text-muted hover:bg-hover">
          <Search className="h-4 w-4" /> Search <kbd className="ml-auto rounded border border-border px-1 text-[10px] text-faint">⌘K</kbd>
        </button>
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-2">
        {NAV.map((s) => {
          const items = s.items.filter((i) => !i.admin || isAdmin);
          if (!items.length) return null;
          return (
            <div key={s.section} className="mt-3">
              <div className="px-2 pb-1 text-xs font-medium text-faint">{s.section}</div>
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + "/");
                return (
                  <Link key={i.href} href={i.href} className={cn("flex h-8 items-center gap-2 rounded px-2 text-sm", active ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg")}>
                    <i.icon className="h-4 w-4" />{i.label}
                    {i.href === "/inbox" && !!unread.data && <span className="ml-auto rounded bg-accent px-1.5 text-[10px] font-semibold text-white">{unread.data}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <Avatar name={me.data?.full_name ?? me.data?.email} size={22} color={me.data?.color} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{me.data?.full_name ?? "…"}</div>
          <div className="text-xs capitalize text-faint">{me.data?.role}</div>
        </div>
      </div>
    </aside>
  );
}

export function useCollapsed() {
  const [c, setC] = useState(false);
  useEffect(() => { try { setC(localStorage.getItem("sb-collapsed") === "1"); } catch {} }, []);
  return [c, (v: boolean) => { setC(v); try { localStorage.setItem("sb-collapsed", v ? "1" : "0"); } catch {} }] as const;
}
export { Plus };
