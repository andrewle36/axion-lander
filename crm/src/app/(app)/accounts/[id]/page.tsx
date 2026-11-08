"use client";
import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Building2, Phone, Mail, Sparkles, Wrench, ChevronLeft, MoreHorizontal, Trash2, RefreshCw, Users, KanbanSquare, FileSignature, Receipt,
  Car, MessageSquare, Activity, CheckSquare, ClipboardCheck, Plus, Globe, MapPin, DollarSign, Tag, User, Hash, CalendarClock,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Card, Empty, IconButton, Loading, Markdown, Menu, MenuItem, Stat, StatusBadge, Tabs, Table, Th, Td, Select, confirmAction } from "@/components/ui";
import { InlineField } from "@/components/records/fields";
import { Timeline } from "@/components/records/timeline";
import { Conversation } from "@/components/comms/conversation";
import { VehicleRow, VehicleDialog, CallsTable } from "@/components/records/extras";
import { NewContactDialog } from "@/components/records/new-contact";
import { useDialer } from "@/components/dialer/dialer";
import { LogJobDialog } from "@/components/money/log-job";
import { DealsList } from "@/components/deals/deals-list";
import { ContractsPanel } from "@/components/deals/contracts-panel";
import { OnboardingChecklist } from "@/components/deals/onboarding-checklist";
import { TasksPanel } from "@/components/deals/tasks-panel";
import { UpcomingEvents } from "@/components/calendar/upcoming";
import { fmtPhone, fullName, money, pct, relTime, shortDate, jobNo, invNo } from "@/lib/utils";
import { KINDS, BILLING_LABEL } from "@/lib/constants";

export default function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { call } = useDialer();
  const q = trpc.companies.get.useQuery({ id });
  const team = trpc.team.list.useQuery();
  const update = trpc.companies.update.useMutation();
  const del = trpc.companies.delete.useMutation({ onSuccess: () => { toast.success("Account deleted"); router.push("/accounts"); } });
  const ai = trpc.companies.aiOverview.useMutation();
  const [tab, setTab] = useState("overview");
  const [jobOpen, setJobOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [vehOpen, setVehOpen] = useState<any>(null);
  const [msgContact, setMsgContact] = useState<string>("");
  const co = q.data as any;
  const monthly = useMemo(() => {
    const m: Record<string, { month: string; cars: number; revenue: number }> = {};
    for (const j of co?.jobs ?? []) { const k = String(j.performed_at).slice(0, 7); m[k] ??= { month: k, cars: 0, revenue: 0 }; m[k].cars++; m[k].revenue += Number(j.price) + Number(j.cert_fee); }
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [co?.jobs]);
  if (q.isLoading) return <Loading />;
  if (!co) return <Empty title="Account not found" action={<Link href="/accounts"><Button>Back</Button></Link>} />;
  const save = (patch: Record<string, unknown>) => update.mutate({ id, ...patch } as any);
  const num = (v: string) => (v === "" ? null : Number(v));
  const primary = co.contacts[0];
  const activeMsg = msgContact || primary?.id || "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <IconButton label="Back" onClick={() => router.push("/accounts")}><ChevronLeft className="h-4 w-4" /></IconButton>
        <Link href="/accounts" className="text-sm text-muted hover:text-fg">Partner Accounts</Link><span className="text-faint">/</span>
        <span className="truncate text-sm font-medium">{co.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button icon={<Phone className="h-3.5 w-3.5" />} disabled={!co.phone && !primary?.phone} onClick={() => call({ number: co.phone ?? primary?.phone, companyId: id, contactId: co.phone ? null : primary?.id, name: co.name })}>Call</Button>
          <Button icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={() => setTab("messages")}>Text / Email</Button>
          <Button icon={<Wrench className="h-3.5 w-3.5" />} onClick={() => setJobOpen(true)}>Log car</Button>
          <Button variant="primary" icon={<FileSignature className="h-3.5 w-3.5" />} onClick={() => setTab("contracts")}>Contract</Button>
          <Menu align="right" trigger={<IconButton label="More"><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            {(close) => (<>
              <MenuItem icon={<Receipt className="h-4 w-4" />} onClick={() => { close(); router.push(`/invoices?company=${id}`); }}>View invoices</MenuItem>
              <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => { close(); if (confirmAction(`Delete ${co.name} and its deals/contracts?`)) del.mutate({ ids: [id] }); }}>Delete account</MenuItem>
            </>)}
          </Menu>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="scroll-thin hidden w-[340px] shrink-0 overflow-y-auto border-r border-border p-4 lg:block">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={co.name} size={40} square />
            <div className="min-w-0"><div className="truncate text-lg font-semibold">{co.name}</div>
              <div className="flex items-center gap-1.5"><StatusBadge status={co.status} /><Badge>{co.kind}</Badge>{co.is_demo && <Badge>demo</Badge>}</div></div>
          </div>
          <InlineField label="Name" icon={<Building2 className="h-3 w-3" />} value={co.name} onSave={(v) => v && save({ name: v })} />
          <InlineField label="Type" icon={<Tag className="h-3 w-3" />} type="select" value={co.kind} options={KINDS.map((k) => ({ value: k, label: k }))} onSave={(v) => save({ kind: v })} />
          <InlineField label="Status" icon={<Activity className="h-3 w-3" />} type="select" value={co.status} display={<StatusBadge status={co.status} />} options={["prospect", "onboarding", "active", "paused", "churned"].map((k) => ({ value: k, label: k }))} onSave={(v) => save({ status: v })} />
          <InlineField label="Contact" icon={<User className="h-3 w-3" />} value={co.contact_name} onSave={(v) => save({ contact_name: v || null })} />
          <InlineField label="Phone" icon={<Phone className="h-3 w-3" />} value={co.phone} display={co.phone ? fmtPhone(co.phone) : undefined} onSave={(v) => save({ phone: v || null })} />
          <InlineField label="Billing email" icon={<Mail className="h-3 w-3" />} type="email" value={co.email} onSave={(v) => save({ email: v || null })} />
          <InlineField label="Address" icon={<MapPin className="h-3 w-3" />} value={co.address} onSave={(v) => save({ address: v || null })} />
          <InlineField label="Website" icon={<Globe className="h-3 w-3" />} value={co.website} onSave={(v) => save({ website: v || null })} />
          <div className="my-3 border-t border-border" />
          <InlineField label="Smog price" icon={<DollarSign className="h-3 w-3" />} type="number" value={co.smog_price} display={co.smog_price != null ? money(co.smog_price) : undefined} placeholder="Retail pricing" onSave={(v) => save({ smog_price: num(v) })} />
          <InlineField label="Old car price" icon={<DollarSign className="h-3 w-3" />} type="number" value={co.old_car_price} display={co.old_car_price != null ? money(co.old_car_price) : undefined} onSave={(v) => save({ old_car_price: num(v) })} />
          <InlineField label="VIN verify" icon={<DollarSign className="h-3 w-3" />} type="number" value={co.vin_price} display={co.vin_price != null ? money(co.vin_price) : undefined} onSave={(v) => save({ vin_price: num(v) })} />
          <InlineField label="Billing" icon={<Receipt className="h-3 w-3" />} type="select" value={co.billing_method} options={Object.entries(BILLING_LABEL).map(([k, v]) => ({ value: k, label: v }))} onSave={(v) => save({ billing_method: v })} />
          <InlineField label="Terms (days)" icon={<CalendarClock className="h-3 w-3" />} type="number" value={co.payment_terms_days} onSave={(v) => save({ payment_terms_days: Number(v) || 15 })} />
          <InlineField label="Owner" icon={<User className="h-3 w-3" />} type="select" value={co.owner_id ?? ""} options={[{ value: "", label: "Unassigned" }, ...(team.data ?? []).map((t) => ({ value: t.id, label: t.full_name ?? t.email }))]}
            display={co.owner ? <span className="flex items-center gap-1.5"><Avatar name={co.owner.full_name} size={16} color={co.owner.color} />{co.owner.full_name}</span> : undefined} onSave={(v) => save({ owner_id: v || null })} />
          <InlineField label="Tags" icon={<Tag className="h-3 w-3" />} value={(co.tags ?? []).join(", ")} onSave={(v) => save({ tags: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
          <InlineField label="Notes" icon={<Hash className="h-3 w-3" />} multiline value={co.notes} onSave={(v) => save({ notes: v || null })} />
          <div className="mt-4 text-xs text-faint">Created {shortDate(co.created_at)}{co.mercury_customer_id && " · Mercury customer linked"}</div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "overview", label: "Overview", icon: <Sparkles className="h-3.5 w-3.5" /> },
            { id: "onboarding", label: "Onboarding", icon: <ClipboardCheck className="h-3.5 w-3.5" /> },
            { id: "contacts", label: "People", icon: <Users className="h-3.5 w-3.5" />, count: co.contacts.length },
            { id: "deals", label: "Deals", icon: <KanbanSquare className="h-3.5 w-3.5" />, count: co.deals.length },
            { id: "contracts", label: "Contracts", icon: <FileSignature className="h-3.5 w-3.5" />, count: co.contracts.length },
            { id: "jobs", label: "Cars smogged", icon: <Wrench className="h-3.5 w-3.5" />, count: co.jobs.length },
            { id: "invoices", label: "Invoices", icon: <Receipt className="h-3.5 w-3.5" />, count: co.invoices.length },
            { id: "messages", label: "Messages", icon: <MessageSquare className="h-3.5 w-3.5" /> },
            { id: "calls", label: "Calls", icon: <Phone className="h-3.5 w-3.5" /> },
            { id: "vehicles", label: "Vehicles", icon: <Car className="h-3.5 w-3.5" />, count: co.vehicles.length },
            { id: "timeline", label: "Timeline", icon: <Activity className="h-3.5 w-3.5" /> },
            { id: "tasks", label: "Tasks", icon: <CheckSquare className="h-3.5 w-3.5" /> },
          ]} />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {tab === "overview" && (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Stat label="Lifetime revenue" value={money(co.stats.lifetime_revenue)} />
                  <Stat label="Cars last 30 days" value={co.stats.cars_30d} />
                  <Stat label="Pass rate" value={pct(co.stats.pass_rate, 0)} />
                  <Stat label="Open A/R" value={money(co.stats.open_ar)} sub={co.stats.open_ar > 0 ? "Outstanding balance" : "All paid"} tone={co.stats.open_ar > 0 ? "down" : undefined} />
                </div>
                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <Card title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-purple-500" />AI account overview</span>}
                    action={<Button size="xs" icon={<RefreshCw className="h-3 w-3" />} loading={ai.isPending} onClick={() => ai.mutate({ id })}>{co.ai_summary ? "Refresh" : "Generate"}</Button>}>
                    <div className="p-4">{co.ai_summary ? <><Markdown text={co.ai_summary} /><div className="mt-3 text-xs text-faint">Generated {relTime(co.ai_summary_at)}</div></>
                      : <Empty icon={<Sparkles className="h-6 w-6" />} title="No AI overview yet" body="Volume trends, billing health, churn risk and next best actions." action={<Button variant="primary" loading={ai.isPending} onClick={() => ai.mutate({ id })}>Generate overview</Button>} />}</div>
                  </Card>
                  <Card title="Monthly volume">
                    <div className="h-56 p-3">{monthly.length ? (
                      <ResponsiveContainer><BarChart data={monthly}><CartesianGrid vertical={false} stroke="rgb(var(--border))" /><XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "rgb(var(--muted))" }} axisLine={false} tickLine={false} width={30} />
                        <Tooltip contentStyle={{ background: "rgb(var(--bg))", border: "1px solid rgb(var(--border))", fontSize: 12 }} formatter={(v: any, n: any) => (n === "revenue" ? money(v) : v)} />
                        <Bar dataKey="cars" fill="rgb(var(--accent))" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
                    ) : <Empty title="No cars yet" />}</div>
                  </Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card title="Onboarding"><OnboardingChecklist companyId={id} /></Card>
                  <Card title="Upcoming appointments"><UpcomingEvents companyId={id} /></Card>
                </div>
              </div>
            )}
            {tab === "onboarding" && <div className="p-4"><Card><OnboardingChecklist companyId={id} /></Card></div>}
            {tab === "contacts" && (
              <div className="p-4">
                <div className="mb-3 flex justify-end"><Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setContactOpen(true)}>Add person</Button></div>
                <Card>{co.contacts.length ? <Table><thead><tr><Th>Name</Th><Th>Title</Th><Th>Phone</Th><Th>Email</Th><Th>Status</Th><Th className="w-20" /></tr></thead>
                  <tbody>{co.contacts.map((c: any) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-subtle" onClick={() => router.push(`/contacts/${c.id}`)}>
                      <Td><span className="flex items-center gap-2"><Avatar name={fullName(c)} size={18} />{fullName(c)}</span></Td><Td className="text-muted">{c.title}</Td>
                      <Td className="text-muted">{fmtPhone(c.phone)}</Td><Td className="text-muted">{c.email}</Td><Td><StatusBadge status={c.status} /></Td>
                      <Td><div onClick={(e) => e.stopPropagation()} className="flex">{c.phone && <IconButton label="Call" onClick={() => call({ number: c.phone, contactId: c.id, companyId: id, name: fullName(c) })}><Phone className="h-3.5 w-3.5" /></IconButton>}
                        <IconButton label="Message" onClick={() => { setMsgContact(c.id); setTab("messages"); }}><MessageSquare className="h-3.5 w-3.5" /></IconButton></div></Td>
                    </tr>))}</tbody></Table> : <Empty icon={<Users className="h-6 w-6" />} title="No people yet" body="Add the sales manager, porter or office contact." />}</Card>
              </div>
            )}
            {tab === "deals" && <div className="p-4"><DealsList companyId={id} /></div>}
            {tab === "contracts" && <div className="p-4"><ContractsPanel companyId={id} /></div>}
            {tab === "jobs" && (
              <div className="p-4">
                <div className="mb-3 flex justify-end"><Button variant="primary" icon={<Wrench className="h-3.5 w-3.5" />} onClick={() => setJobOpen(true)}>Log car</Button></div>
                <Card>{co.jobs.length ? <Table><thead><tr><Th>Job</Th><Th>Date</Th><Th>Service</Th><Th>Vehicle</Th><Th>VIN</Th><Th>Result</Th><Th>Invoice</Th><Th className="text-right">Total</Th></tr></thead>
                  <tbody>{co.jobs.map((j: any) => (<tr key={j.id}><Td className="font-mono text-xs">{jobNo(j.number)}</Td><Td>{shortDate(j.performed_at)}</Td><Td>{j.service?.name ?? j.description}</Td>
                    <Td className="text-muted">{[j.vehicle?.year, j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(" ")}</Td><Td className="font-mono text-xs text-muted">{j.vehicle?.vin}</Td><Td><StatusBadge status={j.result} /></Td>
                    <Td>{j.invoice_id ? <Link className="text-accent hover:underline" href={`/invoices/${j.invoice_id}`}>Invoiced</Link> : <span className="text-faint">Unbilled</span>}</Td>
                    <Td className="text-right font-medium">{money(Number(j.price) + Number(j.cert_fee))}</Td></tr>))}</tbody></Table> : <Empty icon={<Wrench className="h-6 w-6" />} title="No cars logged yet" />}</Card>
              </div>
            )}
            {tab === "invoices" && (
              <div className="p-4"><Card>{co.invoices.length ? <Table><thead><tr><Th>Invoice</Th><Th>Period</Th><Th>Issued</Th><Th>Due</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th></tr></thead>
                <tbody>{co.invoices.map((i: any) => (<tr key={i.id} className="cursor-pointer hover:bg-subtle" onClick={() => router.push(`/invoices/${i.id}`)}><Td className="font-mono text-xs">{invNo(i.number)}</Td>
                  <Td className="text-muted">{i.period_start ? `${i.period_start} → ${i.period_end}` : "—"}</Td><Td>{i.issue_date}</Td><Td>{i.due_date}</Td><Td><StatusBadge status={i.status} /></Td>
                  <Td className="text-right">{money(i.total)}</Td><Td className="text-right font-medium">{money(Number(i.total) - Number(i.amount_paid))}</Td></tr>))}</tbody></Table>
                : <Empty icon={<Receipt className="h-6 w-6" />} title="No invoices yet" body="Month-end invoices are generated automatically on the 1st from this account's logged cars." />}</Card></div>
            )}
            {tab === "messages" && (co.contacts.length ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm"><span className="text-muted">Conversation with</span>
                  <Select value={activeMsg} onChange={(e) => setMsgContact(e.target.value)} className="w-64">{co.contacts.map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}{c.title ? ` (${c.title})` : ""}</option>)}</Select></div>
                <div className="min-h-0 flex-1">{activeMsg && <Conversation key={activeMsg} contactId={activeMsg} compact />}</div>
              </div>
            ) : <Empty icon={<MessageSquare className="h-6 w-6" />} title="Add a person first" body="Texts and emails are sent to people at this account." action={<Button variant="primary" onClick={() => setContactOpen(true)}>Add person</Button>} />)}
            {tab === "calls" && <CallsTable companyId={id} />}
            {tab === "vehicles" && (
              <div className="p-4"><div className="mb-3 flex justify-end"><Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setVehOpen({})}>Add vehicle</Button></div>
                <Card><div className="divide-y divide-border">{co.vehicles.map((v: any) => <VehicleRow key={v.id} v={v} onEdit={() => setVehOpen(v)} />)}
                  {!co.vehicles.length && <Empty icon={<Car className="h-6 w-6" />} title="No vehicles yet" body="Vehicles are added when you log cars for this account." />}</div></Card></div>
            )}
            {tab === "timeline" && <Timeline companyId={id} />}
            {tab === "tasks" && <div className="p-4"><TasksPanel companyId={id} /></div>}
          </div>
        </section>
      </div>
      <LogJobDialog open={jobOpen} onClose={() => setJobOpen(false)} companyId={id} />
      <NewContactDialog open={contactOpen} onClose={() => setContactOpen(false)} companyId={id} kind="partner_contact" />
      {vehOpen && <VehicleDialog v={vehOpen} companyId={id} onClose={() => setVehOpen(null)} />}
    </div>
  );
}
