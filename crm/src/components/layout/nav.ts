import type { LucideIcon } from "lucide-react";
import {
  Home, Inbox, CalendarDays, Users, Building2, KanbanSquare, ClipboardCheck, Wrench, Receipt, LineChart, Percent,
  LayoutTemplate, Workflow, Phone, Settings, UserCog, CheckSquare,
} from "lucide-react";
export type NavItem = { href: string; label: string; icon: LucideIcon; admin?: boolean };
export const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Workspace", items: [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/calls", label: "Calls", icon: Phone },
  ]},
  { section: "Records", items: [
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/accounts", label: "Partner Accounts", icon: Building2 },
    { href: "/deals", label: "Deals", icon: KanbanSquare },
    { href: "/onboarding", label: "Onboarding", icon: ClipboardCheck },
    { href: "/jobs", label: "Smog Jobs", icon: Wrench },
  ]},
  { section: "Money", items: [
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/finance", label: "Finance", icon: LineChart, admin: true },
    { href: "/commissions", label: "Commissions", icon: Percent },
  ]},
  { section: "Growth", items: [
    { href: "/landing-pages", label: "Landing Pages", icon: LayoutTemplate },
    { href: "/automations", label: "Automations", icon: Workflow },
  ]},
  { section: "Admin", items: [
    { href: "/team", label: "Team", icon: UserCog, admin: true },
    { href: "/settings", label: "Settings", icon: Settings },
  ]},
];
