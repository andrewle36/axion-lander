"use client";
import { useState } from "react";
import { Sidebar, useCollapsed } from "./sidebar";
import { CommandPalette } from "./command";
import { DialerProvider } from "@/components/dialer/dialer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState(false);
  const [collapsed, setCollapsed] = useCollapsed();
  return (
    <DialerProvider>
      <div className="flex h-screen overflow-hidden bg-panel">
        <Sidebar onSearch={() => setSearch(true)} collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg md:my-2 md:mr-2 md:rounded-md md:border md:border-border">{children}</main>
      </div>
      <CommandPalette open={search} setOpen={setSearch} />
    </DialerProvider>
  );
}
