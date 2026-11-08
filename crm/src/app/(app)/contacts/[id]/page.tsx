"use client";
import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Phone, MessageSquare, Mail, Sparkles, Calendar, Wrench, Car, Clock, User, Tag, Building2, Hash, Globe, Trash2, Plus, ChevronLeft,
  CheckSquare, Activity, Workflow, Ban, MoreHorizontal, RefreshCw, DollarSign,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Card, Dialog, Field, Input, Loading, Markdown, Menu, MenuItem, Select, StatusBadge, Tabs, Table, Th, Td, Empty, IconButton, confirmAction, Switch } from "@/components/ui";
import { InlineField } from "@/components/records/fields";
import { VehicleRow, VehicleDialog, CallsTable } from "@/components/records/extras";
import { Timeline } from "@/components/records/timeline";
import { Conversation } from "@/components/comms/conversation";
import { useDialer } from "@/components/dialer/dialer";
import { UpcomingEvents } from "@/components/calendar/upcoming";
import { LogJobDialog } from "@/components/money/log-job";
import { TasksPanel } from "@/components/deals/tasks-panel";
import { fmtPhone, fullName, money, relTime, shortDate, jobNo } from "@/lib/utils";

const STATUS_OPTS = ["lead", "contacted", "booked", "customer", "lost"].map((s) => ({ value: s, label: s }));

export default function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { call } = useDialer();
  const q = trpc.contacts.get.useQuery({ id });
  const team = trpc.team.list.useQuery();
  const companies = trpc.companies.options.useQuery();
  const update = trpc.contacts.update.useMutation();
  const del = trpc.contacts.delete.useMutation({ onSuccess: () => { toast.success("Contact deleted"); router.push("/contacts"); } });
  const ai = trpc.contacts.aiOverview.useMutation();
  const autos = trpc.automations.list.useQuery();
  const enroll = trpc.contacts.enroll.useMutation({ onSuccess: (r) => toast.success(r.enrolled ? "Enrolled in automation" : "Already enrolled") });
  const [tab, setTab] = useState("overview");
  const [jobOpen, setJobOpen] = useState(false);
  const [vehOpen, setVehOpen] = useState<any>(null);
  const c = q.data as any;
  if (q.isLoading) return <Loading />;
  if (!c) return <Empty title="Contact not found" action={<Link href="/contacts"><Button>Back to contacts</Button></Link>} />;
  const save = (patch: Record<string, unknown>) => update.mutate({ id, ...patch } as any);
  const name = fullName(c);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <IconButton label="Back" onClick={() => router.push("/contacts")}><ChevronLeft className="h-4 w-4" /></IconButton>
        <Link href="/contacts" className="text-sm text-muted hover:text-fg">Contacts</Link><span className="text-faint">/</span>
        <span className="truncate text-sm font-medium">{name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button icon={<Phone className="h-3.5 w-3.5" />} disabled={!c.phone} onClick={() => call({ number: c.phone, contactId: c.id, companyId: c.company_id, name })}>Call</Button>
          <Button icon={<MessageSquare className="h-3.5 w-3.5" />} onClick={() => setTab("messages")}>Text / Email</Button>
          <Button icon={<Wrench className="h-3.5 w-3.5" />} onClick={() => setJobOpen(true)}>Log job</Button>
          <Menu align="right" width={240} trigger={<IconButton label="More"><MoreHorizontal className="h-4 w-4" /></IconButton>}>
            {(close) => (<>
              <div className="px-2 py-1 text-xs text-faint">Enroll in automation</div>
              {(autos.data ?? []).filter((a: any) => a.status === "active").map((a: any) => <MenuItem key={a.id} icon={<Workflow className="h-4 w-4" />} onClick={() => { enroll.mutate({ ids: [id], automation_id: a.id }); close(); }}>{a.name}</MenuItem>)}
              {!(autos.data ?? []).some((a: any) => a.status === "active") && <div className="px-2 pb-1 text-xs text-muted">No active automations</div>}
              <div className="my-1 border-t border-border" />
              <MenuItem icon={<Ban className="h-4 w-4" />} onClick={() => { save({ dnd_sms: !c.dnd_sms }); close(); }}>{c.dnd_sms ? "Re-enable SMS" : "Mark SMS opt-out"}</MenuItem>
              <MenuItem icon={<Trash2 className="h-4 w-4" />} danger onClick={() => { close(); if (confirmAction(`Delete ${name}?`)) del.mutate({ ids: [id] }); }}>Delete contact</MenuItem>
            </>)}
          </Menu>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* left: record fields */}
        <aside className="scroll-thin hidden w-[340px] shrink-0 overflow-y-auto border-r border-border p-4 lg:block">
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={name} size={40} square />
            <div className="min-w-0"><div className="truncate text-lg font-semibold">{name}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted"><StatusBadge status={c.status} />{c.is_demo && <Badge>demo</Badge>}{c.dnd_sms && <Badge tone="red">SMS opt-out</Badge>}</div></div>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded border border-border p-2"><div className="text-xs text-muted">Lifetime</div><div className="text-sm font-semibold">{money(c.lifetime_spend)}</div></div>
            <div className="rounded border border-border p-2"><div className="text-xs text-muted">Visits</div><div className="text-sm font-semibold">{c.jobs.length}</div></div>
            <div className="rounded border border-border p-2"><div className="text-xs text-muted">Messages</div><div className="text-sm font-semibold">{c.message_count}</div></div>
          </div>
          <InlineField label="First name" icon={<User className="h-3 w-3" />} value={c.first_name} onSave={(v) => save({ first_name: v })} />
          <InlineField label="Last name" icon={<User className="h-3 w-3" />} value={c.last_name} onSave={(v) => save({ last_name: v })} />
          <InlineField label="Phone" icon={<Phone className="h-3 w-3" />} type="tel" value={c.phone} display={c.phone ? fmtPhone(c.phone) : undefined} onSave={(v) => save({ phone: v || null })} />
          <InlineField label="Email" icon={<Mail className="h-3 w-3" />} type="email" value={c.email} onSave={(v) => save({ email: v || null })} />
          <InlineField label="Status" icon={<Activity className="h-3 w-3" />} type="select" options={STATUS_OPTS} value={c.status} display={<StatusBadge status={c.status} />} onSave={(v) => save({ status: v })} />
          <InlineField label="Owner" icon={<User className="h-3 w-3" />} type="select" value={c.owner_id ?? ""} options={[{ value: "", label: "Unassigned" }, ...(team.data ?? []).map((t) => ({ value: t.id, label: t.full_name ?? t.email }))]}
            display={c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.full_name} size={16} color={c.owner.color} />{c.owner.full_name}</span> : undefined} onSave={(v) => save({ owner_id: v || null })} />
          <InlineField label="Account" icon={<Building2 className="h-3 w-3" />} type="select" value={c.company_id ?? ""} options={[{ value: "", label: "None (retail)" }, ...(companies.data ?? []).map((x) => ({ value: x.id, label: x.name }))]}
            display={c.company ? <Link className="text-accent hover:underline" href={`/accounts/${c.company.id}`} onClick={(e) => e.stopPropagation()}>{c.company.name}</Link> : undefined} onSave={(v) => save({ company_id: v || null })} />
          {c.company_id && <InlineField label="Title" icon={<Hash className="h-3 w-3" />} value={c.title} onSave={(v) => save({ title: v || null })} />}
          <InlineField label="Type" icon={<Tag className="h-3 w-3" />} type="select" value={c.kind} options={[{ value: "driver", label: "Retail driver" }, { value: "partner_contact", label: "Partner contact" }, { value: "lead", label: "Lead" }]} onSave={(v) => save({ kind: v })} />
          <InlineField label="Source" icon={<Globe className="h-3 w-3" />} value={c.source} onSave={(v) => save({ source: v || null })} />
          <InlineField label="Follow up" icon={<Clock className="h-3 w-3" />} type="date" value={c.next_follow_up} onSave={(v) => save({ next_follow_up: v || null })} />
          <InlineField label="Tags" icon={<Tag className="h-3 w-3" />} value={(c.tags ?? []).join(", ")}
            display={c.tags?.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t: string) => <Badge key={t} tone="purple">{t}</Badge>)}</span> : undefined}
            onSave={(v) => save({ tags: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
          <InlineField label="Notes" icon={<Hash className="h-3 w-3" />} multiline value={c.notes} onSave={(v) => save({ notes: v || null })} />
          <div className="mt-3 flex items-center justify-between text-xs text-muted"><span>Email opt-out</span><Switch checked={c.dnd_email} onChange={(v) => save({ dnd_email: v })} /></div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted"><span>SMS opt-out (STOP)</span><Switch checked={c.dnd_sms} onChange={(v) => save({ dnd_sms: v })} /></div>
          {(c.landing || Object.keys(c.utm ?? {}).length > 0) && (
            <div className="mt-4 rounded border border-border p-2 text-xs text-muted">
              {c.landing && <div>Landing page: <b className="text-fg">{c.landing.name}</b>{c.variant && <> · variant <b className="text-fg">{c.variant.name}</b></>}</div>}
              {Object.entries(c.utm ?? {}).map(([k, v]) => <div key={k}>{k}: {String(v)}</div>)}
            </div>
          )}
          <div className="mt-4 text-xs text-faint">Created {shortDate(c.created_at)} · Last contact {c.last_contacted_at ? relTime(c.last_contacted_at) : "never"}</div>
        </aside>
        {/* right: tabs */}
        <section className="flex min-w-0 flex-1 flex-col">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "overview", label: "Overview", icon: <Sparkles className="h-3.5 w-3.5" /> },
            { id: "timeline", label: "Timeline", icon: <Activity className="h-3.5 w-3.5" /> },
            { id: "messages", label: "Messages", icon: <MessageSquare className="h-3.5 w-3.5" />, count: c.message_count },
            { id: "calls", label: "Calls", icon: <Phone className="h-3.5 w-3.5" /> },
            { id: "vehicles", label: "Vehicles", icon: <Car className="h-3.5 w-3.5" />, count: c.vehicles.length },
            { id: "jobs", label: "Smog jobs", icon: <Wrench className="h-3.5 w-3.5" />, count: c.jobs.length },
            { id: "appointments", label: "Appointments", icon: <Calendar className="h-3.5 w-3.5" /> },
            { id: "tasks", label: "Tasks", icon: <CheckSquare className="h-3.5 w-3.5" /> },
          ]} />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {tab === "overview" && (
              <div className="grid gap-4 p-4 xl:grid-cols-[1fr_340px]">
                <Card title={<span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-purple-500" />AI overview</span>}
                  action={<Button size="xs" icon={<RefreshCw className="h-3 w-3" />} loading={ai.isPending} onClick={() => ai.mutate({ id })}>{c.ai_summary ? "Refresh" : "Generate"}</Button>}>
                  <div className="p-4">
                    {c.ai_summary ? <><Markdown text={c.ai_summary} /><div className="mt-3 text-xs text-faint">Generated {relTime(c.ai_summary_at)} · OpenRouter</div></>
                      : <Empty icon={<Sparkles className="h-6 w-6" />} title="No AI overview yet" body="Generate a summary of this customer's history, value, risks and next best actions." action={<Button variant="primary" loading={ai.isPending} onClick={() => ai.mutate({ id })}>Generate overview</Button>} />}
                  </div>
                </Card>
                <div className="space-y-4">
                  <Card title="Upcoming appointments"><UpcomingEvents contactId={id} /></Card>
                  <Card title="Vehicles" action={<Button size="xs" icon={<Plus className="h-3 w-3" />} onClick={() => setVehOpen({})}>Add</Button>}>
                    <div className="divide-y divide-border">{c.vehicles.map((v: any) => <VehicleRow key={v.id} v={v} onEdit={() => setVehOpen(v)} />)}
                      {!c.vehicles.length && <div className="p-4 text-sm text-faint">No vehicles yet</div>}</div>
                  </Card>
                </div>
              </div>
            )}
            {tab === "timeline" && <Timeline contactId={id} />}
            {tab === "messages" && <div className="h-full"><Conversation contactId={id} compact /></div>}
            {tab === "calls" && <CallsTable contactId={id} />}
            {tab === "vehicles" && (
              <div className="p-4">
                <div className="mb-3 flex justify-end"><Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setVehOpen({})}>Add vehicle</Button></div>
                <Card><div className="divide-y divide-border">{c.vehicles.map((v: any) => <VehicleRow key={v.id} v={v} onEdit={() => setVehOpen(v)} />)}
                  {!c.vehicles.length && <Empty icon={<Car className="h-6 w-6" />} title="No vehicles" body="Add the customer's cars to track smog due dates and send reminders." />}</div></Card>
              </div>
            )}
            {tab === "jobs" && (
              <div className="p-4">
                <div className="mb-3 flex justify-end"><Button variant="primary" icon={<Wrench className="h-3.5 w-3.5" />} onClick={() => setJobOpen(true)}>Log job</Button></div>
                <Card>{c.jobs.length ? (
                  <Table><thead><tr><Th>Job</Th><Th>Date</Th><Th>Service</Th><Th>Vehicle</Th><Th>Result</Th><Th>Payment</Th><Th className="text-right">Total</Th></tr></thead>
                    <tbody>{c.jobs.map((j: any) => (
                      <tr key={j.id}><Td className="font-mono text-xs">{jobNo(j.number)}</Td><Td>{shortDate(j.performed_at)}</Td><Td>{j.service?.name ?? j.description}</Td>
                        <Td className="text-muted">{[j.vehicle?.year, j.vehicle?.make, j.vehicle?.model].filter(Boolean).join(" ")}</Td><Td><StatusBadge status={j.result} /></Td>
                        <Td className="capitalize text-muted">{j.payment_method}{!j.paid && " (unpaid)"}</Td><Td className="text-right font-medium">{money(Number(j.price) + Number(j.cert_fee))}</Td></tr>))}</tbody></Table>
                ) : <Empty icon={<DollarSign className="h-6 w-6" />} title="No jobs yet" />}</Card>
              </div>
            )}
            {tab === "appointments" && <div className="p-4"><Card><UpcomingEvents contactId={id} /></Card></div>}
            {tab === "tasks" && <div className="p-4"><TasksPanel contactId={id} /></div>}
          </div>
        </section>
      </div>
      <LogJobDialog open={jobOpen} onClose={() => setJobOpen(false)} contactId={id} companyId={c.company_id ?? undefined} />
      {vehOpen && <VehicleDialog v={vehOpen} contactId={id} onClose={() => setVehOpen(null)} />}
    </div>
  );
}

