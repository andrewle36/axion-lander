"use client";
import * as React from "react";
import Link from "next/link";
import { Send, Trash2, Building2, User, Check, Calculator, Phone, Mail, StickyNote, Activity as ActivityIcon } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Button, Drawer, IconButton, Input, Loading, Select, Tabs, Textarea, confirmAction, Badge } from "@/components/ui";
import { cn, dealNo, fmtPhone, fullName, money, relTime } from "@/lib/utils";
import { useDialer } from "@/components/dialer/dialer";
import { STAGES, STAGE_META, StagePill, askLostReason, SendContractDialog, useTeam, type Stage } from "./shared";
import { ContractsPanel } from "./contracts-panel";
import { TasksPanel } from "./tasks-panel";

/** Text/number field that saves on blur or Enter. */
function InlineField({ label, value, onSave, type = "text", step, prefix, suffix, placeholder }: {
  label: string; value: string | number | null | undefined; onSave: (v: string) => void; type?: string; step?: string; prefix?: string; suffix?: string; placeholder?: string;
}) {
  const [v, setV] = React.useState(value == null ? "" : String(value));
  React.useEffect(() => { setV(value == null ? "" : String(value)); }, [value]);
  const commit = () => { if (v !== (value == null ? "" : String(value))) onSave(v); };
  return (
    <div className="flex min-h-8 items-center gap-2">
      <div className="w-32 shrink-0 text-xs text-muted">{label}</div>
      <div className="relative flex-1">
        {prefix && <span className="pointer-events-none absolute left-2 top-1.5 text-sm text-faint">{prefix}</span>}
        <Input type={type} step={step} value={v} placeholder={placeholder ?? "Empty"} onChange={(e) => setV(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className={cn("h-7 border-transparent bg-transparent hover:border-border focus:bg-bg", prefix && "pl-5")} />
        {suffix && <span className="pointer-events-none absolute right-2 top-1.5 text-xs text-faint">{suffix}</span>}
      </div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-h-8 items-center gap-2"><div className="w-32 shrink-0 text-xs text-muted">{label}</div><div className="min-w-0 flex-1 px-1">{children}</div></div>;
}

export function StageStepper({ stage, onChange, disabled }: { stage: string; onChange: (s: Stage) => void; disabled?: boolean }) {
  const flow: Stage[] = STAGES.filter((s) => s !== "lost");
  const idx = flow.indexOf(stage as Stage);
  return (
    <div className="flex items-stretch gap-1">
      {flow.map((s, i) => {
        const active = s === stage; const past = idx >= 0 && i < idx;
        return (
          <button key={s} type="button" disabled={disabled || active} onClick={() => onChange(s)}
            className={cn("flex flex-1 items-center justify-center gap-1 rounded px-1 py-1.5 text-xs font-medium transition-colors",
              active ? "text-white" : past ? "bg-accent-soft text-accent hover:bg-accent/20" : "bg-subtle text-muted hover:bg-hover hover:text-fg")}
            style={active ? { background: STAGE_META[s].color } : undefined}>
            {past && <Check className="h-3 w-3" />}<span className="truncate">{STAGE_META[s].label}</span>
          </button>
        );
      })}
      <button type="button" disabled={disabled || stage === "lost"} onClick={() => onChange("lost")}
        className={cn("rounded px-2 py-1.5 text-xs font-medium", stage === "lost" ? "bg-danger text-white" : "bg-subtle text-muted hover:bg-danger/10 hover:text-danger")}>Lost</button>
    </div>
  );
}

export function Timeline({ items }: { items: any[] }) {
  if (!items.length) return <div className="px-1 py-4 text-center text-xs text-faint">No activity yet</div>;
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="flex gap-2.5">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
            {a.type === "note" ? <StickyNote className="h-3 w-3" /> : a.type === "contract" ? <Send className="h-3 w-3" /> : <ActivityIcon className="h-3 w-3" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-medium text-fg">{a.user?.full_name ?? "System"}</span>
              <Badge>{a.type.replace(/_/g, " ")}</Badge>
              <span className="ml-auto shrink-0 text-faint">{relTime(a.created_at)}</span>
            </div>
            {a.subject && <div className="mt-0.5 text-sm">{a.subject}</div>}
            {a.body && <div className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{a.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DealDrawer({ dealId, onClose }: { dealId: string | null; onClose: () => void }) {
  const q = trpc.deals.get.useQuery({ id: dealId ?? "" }, { enabled: !!dealId });
  const timeline = trpc.deals.timeline.useQuery({ id: dealId ?? "" }, { enabled: !!dealId });
  const team = useTeam();
  const me = trpc.team.me.useQuery();
  const { call } = useDialer();
  const [tab, setTab] = React.useState("details");
  const [note, setNote] = React.useState("");
  const [sendOpen, setSendOpen] = React.useState(false);
  React.useEffect(() => { setTab("details"); setNote(""); }, [dealId]);
  const update = trpc.deals.update.useMutation();
  const del = trpc.deals.delete.useMutation({ onSuccess: () => { toast.success("Deal deleted"); onClose(); } });
  const addNote = trpc.contacts.addNote.useMutation({ onSuccess: () => setNote("") });
  const d: any = q.data;
  const save = (patch: Record<string, unknown>) => d && update.mutate({ id: d.id, ...patch } as any);
  const changeStage = (s: Stage) => {
    if (!d) return;
    if (s === "lost") { const r = askLostReason(); if (!r) return; save({ stage: s, lost_reason: r }); return; }
    save({ stage: s });
  };
  const auto = d ? Number(d.est_cars_per_month) * Number(d.smog_price ?? 0) : 0;
  const overridden = d && Math.abs(Number(d.value_monthly) - auto) > 0.005;
  const contactEmail = d?.contact?.email ?? d?.company?.email ?? "";
  const contactName = d?.contact ? fullName(d.contact) : d?.company?.contact_name ?? "";
  const isAdmin = me.data?.role !== "rep";

  return (
    <Drawer open={!!dealId} onClose={onClose} width={620}
      title={d ? <span className="flex items-center gap-2"><span className="font-mono text-muted">{dealNo(d.number)}</span>{d.name}</span> : "Deal"}
      actions={d && <IconButton label="Delete deal" onClick={() => { if (confirmAction(`Delete ${dealNo(d.number)}? This removes its tasks and activity.`)) del.mutate({ id: d.id }); }}><Trash2 className="h-4 w-4" /></IconButton>}>
      {!d ? <Loading /> : (
        <div>
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><StagePill stage={d.stage} />
                  <span className="text-lg font-semibold tabular-nums">{money(d.value_monthly, { cents: false })}<span className="text-sm font-normal text-muted">/mo</span></span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                  {d.company && <Link href={`/accounts/${d.company.id}`} className="inline-flex items-center gap-1 hover:text-fg"><Building2 className="h-3 w-3" />{d.company.name}</Link>}
                  {d.contact && <Link href={`/contacts/${d.contact.id}`} className="inline-flex items-center gap-1 hover:text-fg"><User className="h-3 w-3" />{fullName(d.contact)}</Link>}
                  <span>{d.est_cars_per_month} cars/mo × {d.smog_price != null ? money(d.smog_price) : "—"}</span>
                </div>
              </div>
              <Button size="md" variant="primary" icon={<Send className="h-4 w-4" />} disabled={!d.company_id} title={!d.company_id ? "Link an account first" : undefined} onClick={() => setSendOpen(true)}>Send contract</Button>
            </div>
            <StageStepper stage={d.stage} onChange={changeStage} disabled={update.isPending} />
            {d.stage === "lost" && d.lost_reason && <div className="rounded bg-danger/10 px-2 py-1 text-xs text-danger">Lost: {d.lost_reason}</div>}
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "details", label: "Details" },
            { id: "tasks", label: "Tasks" },
            { id: "notes", label: "Notes & activity", count: timeline.data?.length },
          ]} />
          {tab === "details" && (
            <div className="space-y-5 p-4">
              <div className="space-y-0.5">
                <InlineField label="Deal name" value={d.name} onSave={(v) => v.trim() && save({ name: v.trim() })} />
                <Row label="Account">{d.company ? <Link href={`/accounts/${d.company.id}`} className="text-sm text-accent hover:underline">{d.company.name}</Link> : <span className="text-sm text-faint">None</span>}</Row>
                <Row label="Contact">
                  <div className="flex items-center gap-1">
                    <Select value={d.contact_id ?? ""} onChange={(e) => save({ contact_id: e.target.value || null })} className="flex-1">
                      <option value="">No contact</option>
                      {(d.company_contacts ?? []).map((c: any) => <option key={c.id} value={c.id}>{fullName(c)}{c.title ? ` · ${c.title}` : ""}</option>)}
                    </Select>
                    {d.contact?.phone && <IconButton label="Call" onClick={() => call({ number: d.contact.phone, contactId: d.contact.id, companyId: d.company_id, name: fullName(d.contact) })}><Phone className="h-3.5 w-3.5" /></IconButton>}
                    {d.contact?.email && <a href={`mailto:${d.contact.email}`} title={d.contact.email} className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"><Mail className="h-3.5 w-3.5" /></a>}
                  </div>
                </Row>
                {d.contact?.phone && <Row label="Phone"><span className="text-sm">{fmtPhone(d.contact.phone)}</span></Row>}
                <InlineField label="Est. cars / month" type="number" value={d.est_cars_per_month} onSave={(v) => save({ est_cars_per_month: Math.max(0, Math.round(Number(v) || 0)) })} />
                <InlineField label="Partner smog price" type="number" step="0.25" prefix="$" value={d.smog_price} onSave={(v) => save({ smog_price: v === "" ? null : Number(v) })} />
                <div className="flex items-center gap-1">
                  <div className="flex-1"><InlineField label="Value / month" type="number" step="0.01" prefix="$" value={d.value_monthly} suffix={overridden ? "override" : "auto"} onSave={(v) => save({ value_monthly: Number(v) || 0 })} /></div>
                  {overridden && <IconButton label={`Reset to cars × price (${money(auto)})`} onClick={() => save({ value_monthly: Math.round(auto * 100) / 100 })}><Calculator className="h-3.5 w-3.5" /></IconButton>}
                </div>
                <Row label="Owner">
                  {isAdmin ? (
                    <Select value={d.owner_id ?? ""} onChange={(e) => save({ owner_id: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
                    </Select>
                  ) : <span className="inline-flex items-center gap-1.5 text-sm">{d.owner && <Avatar name={d.owner.full_name} color={d.owner.color} size={18} />}{d.owner?.full_name ?? "Unassigned"}</span>}
                </Row>
                <InlineField label="Expected close" type="date" value={d.expected_close} onSave={(v) => save({ expected_close: v || null })} />
                {d.stage === "lost" && <InlineField label="Lost reason" value={d.lost_reason} onSave={(v) => v.trim() && save({ lost_reason: v.trim() })} />}
                <Row label="Created"><span className="text-sm text-muted">{relTime(d.created_at)}{d.closed_at ? ` · closed ${relTime(d.closed_at)}` : ""}</span></Row>
              </div>
              {d.company_id ? (
                <ContractsPanel companyId={d.company_id} dealId={d.id} defaultEmail={contactEmail} defaultName={contactName} />
              ) : <div className="rounded border border-dashed border-border p-3 text-xs text-faint">Link this deal to a partner account to send a contract.</div>}
            </div>
          )}
          {tab === "tasks" && <div className="p-4"><TasksPanel dealId={d.id} companyId={d.company_id} contactId={d.contact_id} /></div>}
          {tab === "notes" && (
            <div className="space-y-4 p-4">
              <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate({ deal_id: d.id, company_id: d.company_id ?? undefined, contact_id: d.contact_id ?? undefined, body: note.trim() }); }} className="space-y-2">
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this deal…"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
                <div className="flex justify-end"><Button type="submit" size="xs" variant="primary" loading={addNote.isPending} disabled={!note.trim()}>Add note</Button></div>
              </form>
              {timeline.isLoading ? <Loading /> : <Timeline items={timeline.data ?? []} />}
            </div>
          )}
          <SendContractDialog open={sendOpen} onClose={() => setSendOpen(false)} dealId={d.id} defaultEmail={contactEmail} defaultName={contactName}
            title={`Send partner agreement · ${dealNo(d.number)}`} />
        </div>
      )}
    </Drawer>
  );
}
