import { redirect } from "next/navigation";
import { createContext } from "@/server/trpc";
import { AppShell } from "@/components/layout/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await createContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile?.active) redirect("/login?pending=1");
  return <AppShell>{children}</AppShell>;
}
