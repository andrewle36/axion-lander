"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutTemplate, ExternalLink, Globe, EyeOff, MoreHorizontal, Copy, RotateCcw, Trash2, PenLine, FlaskConical, LineChart, Shuffle, Users, Settings2, Lock } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Empty, IconButton, Loading, Menu, MenuItem, PageHeader, StatusBadge, Tabs, confirmAction } from "@/components/ui";
import { ContentTab } from "@/components/landing/content-editor";
import { SplitTestTab } from "@/components/landing/split-test";
import { AnalyticsTab } from "@/components/landing/analytics";
import { RoutingTab } from "@/components/landing/routing";
import { LeadsTab, SettingsTab } from "@/components/landing/leads-settings";

const TABS = ["content", "split", "analytics", "routing", "leads", "settings"] as const;
type Tab = (typeof TABS)[number];

export default function LandingEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTabState] = React.useState<Tab>("content");
  React.useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.includes(t)) setTabState(t);
  }, []);
  const setTab = (t: string) => { setTabState(t as Tab); const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u.toString()); };
  const q = trpc.landing.get.useQuery({ id }, { retry: false });
  const me = trpc.team.me.useQuery();
  const canEdit = !!me.data && me.data.role !== "rep";

  const setStatus = trpc.landing.setStatus.useMutation({ onSuccess: (p: any) => toast.success(p.status === "published" ? "Published: the page is live" : "Unpublished: the page is back to draft") });
  const dup = trpc.landing.duplicate.useMutation({ onSuccess: (p: any) => { toast.success("Duplicated as a draft"); router.push(`/landing-pages/${p.id}`); } });
  const reset = trpc.landing.resetStats.useMutation({ onSuccess: () => toast.success("Analytics reset") });
  const del = trpc.landing.delete.useMutation({ onSuccess: () => { toast.success("Page deleted"); router.push("/landing-pages"); } });

  if (q.isLoading) return <Loading />;
  if (!q.data) return <Empty icon={<LayoutTemplate className="h-8 w-8" />} title="Landing page not found" body={q.error?.message} action={<Button onClick={() => router.push("/landing-pages")}>Back to landing pages</Button>} />;
  const d = q.data;
  const page = d.page;
  const published = page.status === "published";
  const live = d.variants.filter((v) => v.active).length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<LayoutTemplate className="h-4 w-4" />}
        title={<span className="flex items-center gap-1.5"><Link href="/landing-pages" className="text-muted hover:text-fg">Landing Pages</Link><span className="text-faint">/</span>{page.name}</span>}
        actions={<>
          {!canEdit && me.data && <span className="flex items-center gap-1 text-xs text-faint"><Lock className="h-3 w-3" />View only</span>}
          <Button icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.open(`/p/${page.slug}`, "_blank", "noopener")}>{published ? "View live" : "Preview"}</Button>
          {canEdit && (published
            ? <Button icon={<EyeOff className="h-3.5 w-3.5" />} loading={setStatus.isPending} onClick={() => setStatus.mutate({ id: page.id, status: "draft" })}>Unpublish</Button>
            : <Button variant="primary" icon={<Globe className="h-3.5 w-3.5" />} loading={setStatus.isPending} onClick={() => setStatus.mutate({ id: page.id, status: "published" })}>Publish</Button>)}
          {canEdit && (
            <Menu align="right" width={190} trigger={<IconButton label="More actions"><MoreHorizontal className="h-4 w-4" /></IconButton>}>
              {(close) => <>
                <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { close(); dup.mutate({ id: page.id }); }}>Duplicate</MenuItem>
                <MenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => { close(); if (confirmAction("Reset all views, clicks and submits for this page? Leads are kept.")) reset.mutate({ id: page.id }); }}>Reset stats</MenuItem>
                {page.status !== "archived" && <MenuItem icon={<EyeOff className="h-3.5 w-3.5" />} onClick={() => { close(); setStatus.mutate({ id: page.id, status: "archived" }); }}>Archive</MenuItem>}
                <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { close(); if (confirmAction(`Delete “${page.name}”? Variants and analytics are removed; leads stay in Contacts.`)) del.mutate({ id: page.id }); }}>Delete</MenuItem>
              </>}
            </Menu>
          )}
        </>}>
        <StatusBadge status={page.status} />
        <a href={`/p/${page.slug}`} target="_blank" rel="noopener" className="text-xs text-faint hover:text-accent">/p/{page.slug}</a>
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "content", label: "Content", icon: <PenLine className="h-3.5 w-3.5" /> },
        { id: "split", label: "Split test", icon: <FlaskConical className="h-3.5 w-3.5" />, count: live },
        { id: "analytics", label: "Analytics", icon: <LineChart className="h-3.5 w-3.5" /> },
        { id: "routing", label: "Routing", icon: <Shuffle className="h-3.5 w-3.5" /> },
        { id: "leads", label: "Leads", icon: <Users className="h-3.5 w-3.5" />, count: d.lead_count },
        { id: "settings", label: "Settings", icon: <Settings2 className="h-3.5 w-3.5" /> },
      ]} />
      {/* Content stays mounted so unsaved drafts survive tab switches. */}
      <div className={tab === "content" ? "flex min-h-0 flex-1" : "hidden"}><ContentTab data={d} canEdit={canEdit} /></div>
      {tab === "split" && <SplitTestTab data={d} canEdit={canEdit} onEditControl={() => setTab("content")} />}
      {tab === "analytics" && <AnalyticsTab pageId={page.id} />}
      {tab === "routing" && <RoutingTab data={d} canEdit={canEdit} />}
      {tab === "leads" && <LeadsTab pageId={page.id} />}
      {tab === "settings" && <SettingsTab data={d} canEdit={canEdit} />}
    </div>
  );
}
