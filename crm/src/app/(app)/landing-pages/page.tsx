"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutTemplate, Plus, MoreHorizontal, ExternalLink, Copy, Trash2, Globe, EyeOff, Pencil, Search } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Badge, Button, Empty, IconButton, Input, Loading, Menu, MenuItem, PageHeader, StatusBadge, Table, Td, Th, Toolbar, confirmAction } from "@/components/ui";
import { pct, relTime } from "@/lib/utils";
import { NewPageDialog } from "@/components/landing/new-page-dialog";
import { ROUTING_MODES } from "@/components/landing/types";

export default function LandingPagesList() {
  const router = useRouter();
  const list = trpc.landing.list.useQuery();
  const me = trpc.team.me.useQuery();
  const canEdit = me.data?.role !== "rep";
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const setStatus = trpc.landing.setStatus.useMutation({ onSuccess: (p: any) => toast.success(p.status === "published" ? "Published" : "Unpublished") });
  const dup = trpc.landing.duplicate.useMutation({ onSuccess: (p: any) => { toast.success("Duplicated"); router.push(`/landing-pages/${p.id}`); } });
  const del = trpc.landing.delete.useMutation({ onSuccess: () => toast.success("Page deleted") });

  const rows = (list.data ?? []).filter((p) => !q || `${p.name} ${p.slug}`.toLowerCase().includes(q.toLowerCase()));
  const totals = rows.reduce((a, p) => ({ v: a.v + p.views_30d, s: a.s + p.submits_30d, l: a.l + p.leads_30d }), { v: 0, s: 0, l: 0 });

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<LayoutTemplate className="h-4 w-4" />} title="Landing Pages" count={list.data?.length}
        actions={canEdit && <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>New page</Button>} />
      <Toolbar>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages" className="pl-7" />
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted">
          <span>Last 30 days:</span>
          <span><b className="text-fg">{totals.v.toLocaleString()}</b> views</span>
          <span><b className="text-fg">{totals.l.toLocaleString()}</b> leads</span>
          <span><b className="text-fg">{pct(totals.v ? totals.s / totals.v : 0)}</b> conversion</span>
        </div>
      </Toolbar>
      <div className="flex-1 overflow-auto">
        {list.isLoading ? <Loading /> : !rows.length ? (
          <Empty icon={<LayoutTemplate className="h-8 w-8" />} title={q ? "No pages match" : "No landing pages yet"}
            body="Build a page from a Newport Smog template, split-test its copy and route every lead to your reps."
            action={canEdit && !q && <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>New page</Button>} />
        ) : (
          <Table>
            <thead><tr>
              <Th>Name</Th><Th>URL</Th><Th>Status</Th><Th className="text-right">Variants</Th><Th className="text-right">Views 30d</Th>
              <Th className="text-right">Leads 30d</Th><Th className="text-right">Conversion</Th><Th>Routing</Th><Th>Updated</Th><Th className="w-10" />
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/landing-pages/${p.id}`)}>
                  <Td><div className="font-medium">{p.name}</div><div className="max-w-[320px] truncate text-xs text-faint">{p.headline}</div></Td>
                  <Td><a href={`/p/${p.slug}`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-accent hover:underline">/p/{p.slug}<ExternalLink className="h-3 w-3" /></a></Td>
                  <Td><StatusBadge status={p.status} />{p.is_demo && <Badge className="ml-1">demo</Badge>}</Td>
                  <Td className="text-right tabular-nums">{p.active_variants}<span className="text-faint"> / {p.variant_count}</span></Td>
                  <Td className="text-right tabular-nums">{p.views_30d.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">{p.leads_30d.toLocaleString()}</Td>
                  <Td className="text-right tabular-nums">{p.views_30d ? pct(p.conversion_30d) : <span className="text-faint">–</span>}</Td>
                  <Td>{ROUTING_MODES.find((m) => m.id === p.routing_mode)?.label ?? p.routing_mode}</Td>
                  <Td className="text-muted">{relTime(p.updated_at)}</Td>
                  <Td className="text-right">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Menu align="right" trigger={<IconButton label="Actions"><MoreHorizontal className="h-4 w-4" /></IconButton>}>
                        {(close) => <>
                          <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { close(); router.push(`/landing-pages/${p.id}`); }}>Open editor</MenuItem>
                          <MenuItem icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => { close(); window.open(`/p/${p.slug}`, "_blank"); }}>View live</MenuItem>
                          {canEdit && <>
                            {p.status === "published"
                              ? <MenuItem icon={<EyeOff className="h-3.5 w-3.5" />} onClick={() => { close(); setStatus.mutate({ id: p.id, status: "draft" }); }}>Unpublish</MenuItem>
                              : <MenuItem icon={<Globe className="h-3.5 w-3.5" />} onClick={() => { close(); setStatus.mutate({ id: p.id, status: "published" }); }}>Publish</MenuItem>}
                            <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { close(); dup.mutate({ id: p.id }); }}>Duplicate</MenuItem>
                            <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { close(); if (confirmAction(`Delete “${p.name}”? Its variants and analytics are removed. Leads stay in Contacts.`)) del.mutate({ id: p.id }); }}>Delete</MenuItem>
                          </>}
                        </>}
                      </Menu>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <NewPageDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
