"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus, Search, Download, Phone } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Dialog, Field, IconButton, Input, Loading, Empty, PageHeader, Select, StatusBadge, Table, Td, Th, Toolbar } from "@/components/ui";
import { fmtPhone, money } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { KINDS, BILLING_LABEL } from "@/lib/constants";
import { useDialer } from "@/components/dialer/dialer";


export default function AccountsPage() {
  const router = useRouter();
  const { call } = useDialer();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });
  const [open, setOpen] = useState(false);
  const list = trpc.companies.list.useQuery({ q: q || undefined, status: (status || undefined) as any, kind: (kind || undefined) as any, sort: sort.col, dir: sort.dir });
  const rows = list.data ?? [];
  const totals = rows.reduce((a, r: any) => ({ cars: a.cars + r.cars_30d, rev: a.rev + r.revenue_30d, ar: a.ar + r.open_ar }), { cars: 0, rev: 0, ar: 0 });
  const ts = (col: string) => setSort((s) => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Building2 className="h-4 w-4" />} title="Partner Accounts" count={rows.length}
        actions={<>
          <Button icon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadCsv("partner-accounts.csv", rows.map((r: any) => ({ name: r.name, kind: r.kind, status: r.status, contact: r.contact_name, phone: r.phone, email: r.email, smog_price: r.smog_price, billing: r.billing_method, cars_30d: r.cars_30d, revenue_30d: r.revenue_30d, open_ar: r.open_ar })))}>Export</Button>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>New account</Button>
        </>} />
      <Toolbar>
        <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts" className="w-60 pl-7" /></div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36"><option value="">All statuses</option>{["prospect", "onboarding", "active", "paused", "churned"].map((s) => <option key={s}>{s}</option>)}</Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-32"><option value="">All types</option>{KINDS.map((s) => <option key={s}>{s}</option>)}</Select>
        <div className="ml-auto flex gap-4 text-xs text-muted"><span>30d cars <b className="text-fg">{totals.cars}</b></span><span>30d revenue <b className="text-fg">{money(totals.rev)}</b></span><span>Open A/R <b className="text-fg">{money(totals.ar)}</b></span></div>
      </Toolbar>
      <div className="min-h-0 flex-1">
        {list.isLoading ? <Loading /> : !rows.length ? <Empty icon={<Building2 className="h-8 w-8" />} title="No partner accounts" body="Dealers, rentals and shops that get partner pricing and month-end billing." action={<Button variant="primary" onClick={() => setOpen(true)}>New account</Button>} /> : (
          <Table className="h-full">
            <thead><tr><Th onClick={() => ts("name")}>Account</Th><Th onClick={() => ts("kind")}>Type</Th><Th onClick={() => ts("status")}>Status</Th><Th>Contact</Th><Th>Phone</Th>
              <Th onClick={() => ts("smog_price")} className="text-right">Smog price</Th><Th>Billing</Th><Th className="text-right">Cars 30d</Th><Th className="text-right">Revenue 30d</Th><Th className="text-right">Open A/R</Th><Th>Owner</Th><Th className="w-10" /></tr></thead>
            <tbody>{rows.map((r: any) => (
              <tr key={r.id} className="group cursor-pointer hover:bg-subtle" onClick={() => router.push(`/accounts/${r.id}`)}>
                <Td><div className="flex items-center gap-2"><Avatar name={r.name} size={20} square /><span className="font-medium">{r.name}</span>{r.is_demo && <Badge>demo</Badge>}</div></Td>
                <Td className="capitalize text-muted">{r.kind}</Td><Td><StatusBadge status={r.status} /></Td><Td className="text-muted">{r.contact_name}</Td><Td className="text-muted">{fmtPhone(r.phone)}</Td>
                <Td className="text-right">{r.smog_price != null ? money(r.smog_price) : <span className="text-faint">Retail</span>}</Td>
                <Td className="text-muted">{BILLING_LABEL[r.billing_method]}</Td><Td className="text-right">{r.cars_30d}</Td><Td className="text-right">{money(r.revenue_30d)}</Td>
                <Td className={`text-right ${r.open_ar > 0 ? "font-medium text-warning" : "text-faint"}`}>{money(r.open_ar)}</Td>
                <Td>{r.owner && <span className="flex items-center gap-1.5"><Avatar name={r.owner.full_name} size={16} color={r.owner.color} />{r.owner.full_name}</span>}</Td>
                <Td><div className="opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>{r.phone && <IconButton label="Call" onClick={() => call({ number: r.phone, companyId: r.id, name: r.name })}><Phone className="h-3.5 w-3.5" /></IconButton>}</div></Td>
              </tr>))}</tbody>
          </Table>
        )}
      </div>
      <NewAccountDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", kind: "dealer", contact_name: "", phone: "", email: "", address: "", smog_price: "", old_car_price: "", vin_price: "", billing_method: "monthly_invoice", status: "prospect" });
  const create = trpc.companies.create.useMutation({ onSuccess: (c) => { toast.success("Account created"); onClose(); router.push(`/accounts/${c.id}`); } });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const num = (s: string) => (s ? Number(s) : null);
  return (
    <Dialog open={open} onClose={onClose} title="New partner account" width={560}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={!f.name}
        onClick={() => create.mutate({ ...f, kind: f.kind as any, billing_method: f.billing_method as any, status: f.status as any, smog_price: num(f.smog_price), old_car_price: num(f.old_car_price), vin_price: num(f.vin_price), phone: f.phone || null, email: f.email || null })}>Create</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business name" className="col-span-2"><Input autoFocus value={f.name} onChange={set("name")} placeholder="Ferrari of Newport Beach" /></Field>
        <Field label="Type"><Select value={f.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Status"><Select value={f.status} onChange={set("status")}>{["prospect", "onboarding", "active"].map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Main contact"><Input value={f.contact_name} onChange={set("contact_name")} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Billing email" className="col-span-2"><Input type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Address" className="col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
        <Field label="Partner smog price ($)"><Input type="number" step="0.01" value={f.smog_price} onChange={set("smog_price")} placeholder="81.25" /></Field>
        <Field label="Old car price ($)"><Input type="number" step="0.01" value={f.old_car_price} onChange={set("old_car_price")} /></Field>
        <Field label="VIN verification ($)"><Input type="number" step="0.01" value={f.vin_price} onChange={set("vin_price")} /></Field>
        <Field label="Billing"><Select value={f.billing_method} onChange={set("billing_method")}>{Object.entries(BILLING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}
