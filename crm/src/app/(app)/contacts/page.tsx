"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Plus, Search, Download, Upload, Trash2, Tag, UserCheck, Workflow, ArrowUpDown, Phone, MessageSquare } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Checkbox, Dialog, Field, IconButton, Input, Loading, Empty, Menu, MenuItem, PageHeader, Select, StatusBadge, Table, Td, Th, Toolbar, Textarea, confirmAction } from "@/components/ui";
import { NewContactDialog } from "@/components/records/new-contact";
import { fmtPhone, fullName, relTime, shortDate } from "@/lib/utils";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { useDialer } from "@/components/dialer/dialer";

const STATUSES = ["lead", "contacted", "booked", "customer", "lost"] as const;
const VIEWS = [
  { id: "all", label: "All contacts" }, { id: "lead", label: "New leads" }, { id: "booked", label: "Booked" },
  { id: "customer", label: "Customers" }, { id: "mine", label: "My contacts" }, { id: "unassigned", label: "Unassigned" },
];

export default function ContactsPage() {
  const router = useRouter();
  const { call } = useDialer();
  const [view, setView] = useState("all");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "created_at", dir: "desc" });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const status = STATUSES.includes(view as any) ? (view as (typeof STATUSES)[number]) : undefined;
  const owner = view === "mine" ? "me" : view === "unassigned" ? "unassigned" : undefined;
  const list = trpc.contacts.list.useQuery({ q: q || undefined, status, owner, kind: kind || undefined, tag: tag || undefined, sort: sort.col, dir: sort.dir, page, pageSize: 100 });
  const team = trpc.team.list.useQuery();
  const tags = trpc.contacts.tags.useQuery();
  const bulk = trpc.contacts.bulkUpdate.useMutation({ onSuccess: () => { toast.success("Updated"); setSel([]); } });
  const del = trpc.contacts.delete.useMutation({ onSuccess: () => { toast.success("Deleted"); setSel([]); } });
  const rows = list.data?.rows ?? [];
  const allSel = rows.length > 0 && sel.length === rows.length;
  const toggleSort = (col: string) => setSort((s) => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" }));
  const exportCsv = () => downloadCsv("contacts.csv", rows.map((r: any) => ({ first_name: r.first_name, last_name: r.last_name, phone: r.phone, email: r.email, status: r.status, source: r.source, owner: r.owner?.full_name, account: r.company?.name, tags: r.tags, created_at: r.created_at })));

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Users className="h-4 w-4" />} title="Contacts" count={list.data?.count}
        actions={<>
          <Button icon={<Upload className="h-3.5 w-3.5" />} onClick={() => setImportOpen(true)}>Import</Button>
          <Button icon={<Download className="h-3.5 w-3.5" />} onClick={exportCsv} disabled={!rows.length}>Export</Button>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewOpen(true)}>New contact</Button>
        </>} />
      <Toolbar>
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => { setView(v.id); setPage(0); setSel([]); }} className={`h-7 rounded px-2 text-sm ${view === v.id ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover"}`}>{v.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-faint" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name, phone, email" className="w-60 pl-7" /></div>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-36"><option value="">All types</option><option value="driver">Retail drivers</option><option value="partner_contact">Partner contacts</option><option value="lead">Leads</option></Select>
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-32"><option value="">Any tag</option>{tags.data?.map((t) => <option key={t}>{t}</option>)}</Select>
        </div>
      </Toolbar>
      {sel.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-accent-soft px-4 py-1.5 text-sm">
          <span className="font-medium">{sel.length} selected</span>
          <Menu trigger={<Button size="xs" icon={<ArrowUpDown className="h-3 w-3" />}>Set status</Button>}>
            {(close) => STATUSES.map((s) => <MenuItem key={s} onClick={() => { bulk.mutate({ ids: sel, status: s }); close(); }}>{s}</MenuItem>)}
          </Menu>
          <Menu trigger={<Button size="xs" icon={<UserCheck className="h-3 w-3" />}>Assign</Button>}>
            {(close) => <>{team.data?.map((t) => <MenuItem key={t.id} onClick={() => { bulk.mutate({ ids: sel, owner_id: t.id }); close(); }}>{t.full_name ?? t.email}</MenuItem>)}
              <MenuItem onClick={() => { bulk.mutate({ ids: sel, owner_id: null }); close(); }}>Unassign</MenuItem></>}
          </Menu>
          <Button size="xs" icon={<Tag className="h-3 w-3" />} onClick={() => { const t = prompt("Tag to add"); if (t) bulk.mutate({ ids: sel, add_tag: t.trim() }); }}>Add tag</Button>
          <Button size="xs" icon={<Workflow className="h-3 w-3" />} onClick={() => setEnrollOpen(true)}>Enroll in automation</Button>
          <Button size="xs" variant="ghost" className="text-danger" icon={<Trash2 className="h-3 w-3" />} onClick={() => confirmAction(`Delete ${sel.length} contacts? This cannot be undone.`) && del.mutate({ ids: sel })}>Delete</Button>
          <button className="ml-auto text-xs text-muted hover:text-fg" onClick={() => setSel([])}>Clear</button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {list.isLoading ? <Loading /> : !rows.length ? (
          <Empty icon={<Users className="h-8 w-8" />} title="No contacts here yet" body="Leads from landing pages, Calendly bookings, calls and texts land here automatically." action={<Button variant="primary" onClick={() => setNewOpen(true)}>New contact</Button>} />
        ) : (
          <Table className="h-full">
            <thead><tr>
              <Th className="w-10"><Checkbox checked={allSel} onChange={() => setSel(allSel ? [] : rows.map((r: any) => r.id))} /></Th>
              <Th onClick={() => toggleSort("first_name")}>Name</Th><Th>Phone</Th><Th>Email</Th><Th onClick={() => toggleSort("status")}>Status</Th>
              <Th>Owner</Th><Th>Account</Th><Th onClick={() => toggleSort("source")}>Source</Th><Th>Tags</Th>
              <Th onClick={() => toggleSort("last_contacted_at")}>Last contact</Th><Th onClick={() => toggleSort("created_at")}>Created</Th><Th className="w-20" />
            </tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="group cursor-pointer hover:bg-subtle" onClick={() => router.push(`/contacts/${r.id}`)}>
                  <Td><Checkbox checked={sel.includes(r.id)} onChange={(v) => setSel(v ? [...sel, r.id] : sel.filter((x) => x !== r.id))} /></Td>
                  <Td><div className="flex items-center gap-2"><Avatar name={fullName(r)} size={20} /><span className="font-medium">{fullName(r)}</span>{r.is_demo && <Badge>demo</Badge>}</div></Td>
                  <Td className="text-muted">{fmtPhone(r.phone)}</Td>
                  <Td className="max-w-[200px] truncate text-muted">{r.email}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td>{r.owner ? <span className="flex items-center gap-1.5"><Avatar name={r.owner.full_name} size={16} color={r.owner.color} />{r.owner.full_name}</span> : <span className="text-faint">Unassigned</span>}</Td>
                  <Td className="text-muted">{r.company?.name}</Td>
                  <Td className="text-muted">{r.source}</Td>
                  <Td><div className="flex gap-1">{(r.tags ?? []).slice(0, 3).map((t: string) => <Badge key={t} tone="purple">{t}</Badge>)}</div></Td>
                  <Td className="text-muted">{r.last_contacted_at ? relTime(r.last_contacted_at) : "Never"}</Td>
                  <Td className="text-muted">{shortDate(r.created_at)}</Td>
                  <Td>
                    <div className="flex opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                      {r.phone && <IconButton label="Call" onClick={() => call({ number: r.phone, contactId: r.id, name: fullName(r) })}><Phone className="h-3.5 w-3.5" /></IconButton>}
                      <IconButton label="Message" onClick={() => router.push(`/inbox?contact=${r.id}`)}><MessageSquare className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {(list.data?.count ?? 0) > 100 && (
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-1.5 text-xs text-muted">
          {page * 100 + 1}–{Math.min((page + 1) * 100, list.data!.count)} of {list.data!.count}
          <Button size="xs" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button size="xs" disabled={(page + 1) * 100 >= list.data!.count} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      <NewContactDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <EnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} ids={sel} />
    </div>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const rows = useMemo(() => (text ? parseCsv(text) : []), [text]);
  const imp = trpc.contacts.importRows.useMutation({ onSuccess: (r) => { toast.success(`Imported ${r.created}, skipped ${r.skipped} duplicates/blank`); setText(""); onClose(); } });
  return (
    <Dialog open={open} onClose={onClose} title="Import contacts from CSV" width={640}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!rows.length} loading={imp.isPending} onClick={() => imp.mutate({ rows })}>Import {rows.length || ""} rows</Button></>}>
      <p className="mb-2 text-sm text-muted">Columns recognized: name or first_name/last_name, phone, email, source, notes, year, make, model. Duplicates (same phone/email) are skipped.</p>
      <input type="file" accept=".csv,text/csv" className="mb-2 text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"name,phone,email,make,model\nJane Doe,7145550100,jane@x.com,Toyota,Camry"} />
      {rows.length > 0 && <div className="mt-2 text-xs text-muted">Preview: {rows.slice(0, 3).map((r) => r.name ?? r.first_name).join(", ")}…</div>}
    </Dialog>
  );
}
function EnrollDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const autos = trpc.automations.list.useQuery(undefined, { enabled: open });
  const [id, setId] = useState("");
  const enroll = trpc.contacts.enroll.useMutation({ onSuccess: (r) => { toast.success(`Enrolled ${r.enrolled} contacts`); onClose(); } });
  return (
    <Dialog open={open} onClose={onClose} title={`Enroll ${ids.length} contacts`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!id} loading={enroll.isPending} onClick={() => enroll.mutate({ ids, automation_id: id })}>Enroll</Button></>}>
      <Field label="Automation"><Select value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose…</option>{(autos.data ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.status})</option>)}</Select></Field>
    </Dialog>
  );
}
