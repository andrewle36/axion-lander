"use client";
import * as React from "react";
import { X, Trash2, Info } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Field, Input, Textarea, Select, Switch, Tabs } from "@/components/ui";
import { cn, renderTemplate } from "@/lib/utils";
import { CONDITIONS, CONTACT_STATUSES, DEAL_STAGES, VARIABLES, metaFor, sampleVars, smsSegments, type NodeData } from "./meta";
import { IconTile } from "./flow-node";

type Props = {
  node: { id: string; type: string; data: NodeData };
  triggers: { id: string; label: string; description: string }[];
  onChange: (patch: NodeData) => void;
  onChangeType: (type: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

/** Variable chips that insert {{var}} at the cursor of the last focused field. */
function useInserter() {
  const last = React.useRef<{ el: HTMLInputElement | HTMLTextAreaElement; set: (v: string) => void } | null>(null);
  const bind = (value: string, set: (v: string) => void) => ({
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value),
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { last.current = { el: e.target, set }; },
  });
  const insert = (key: string) => {
    const t = last.current; if (!t) return;
    const el = t.el, token = `{{${key}}}`;
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, s) + token + el.value.slice(e);
    t.set(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  };
  return { bind, insert };
}

function Chips({ onInsert }: { onInsert: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {VARIABLES.map((v) => (
        <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(v.key)} title={`Example: ${v.sample}`}
          className="rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-accent">
          {`{{${v.key}}}`}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div><div className="text-sm font-medium">{label}</div>{hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}</div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );
}

function Preview({ text, title }: { text: string; title?: string }) {
  return (
    <div className="rounded-md border border-border bg-subtle p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Preview{title ? ` · ${title}` : ""}</div>
      <div className="whitespace-pre-wrap text-sm text-fg">{renderTemplate(text, sampleVars) || <span className="text-faint">Nothing yet</span>}</div>
    </div>
  );
}

export function NodePanel({ node, triggers, onChange, onChangeType, onDelete, onClose }: Props) {
  const [tab, setTab] = React.useState("params");
  const { bind, insert } = useInserter();
  const d = node.data;
  const m = metaFor(node.type);
  const set = (k: string) => (v: any) => onChange({ [k]: v });

  return (
    <div className="absolute bottom-0 right-0 top-0 z-30 flex w-[460px] max-w-full flex-col border-l border-border bg-bg shadow-pop"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <IconTile type={node.type} size={36} />
        <div className="min-w-0 flex-1">
          <input value={d.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder={node.type === "trigger" ? "When this happens" : m.label}
            className="w-full rounded px-1 py-0.5 text-sm font-semibold text-fg hover:bg-hover focus:bg-bg focus:outline-none focus:ring-2 focus:ring-accent/20" />
          <div className="px-1 text-xs text-muted">{m.label}</div>
        </div>
        <button type="button" onClick={onDelete} title="Delete node" className="rounded p-1.5 text-muted hover:bg-hover hover:text-danger"><Trash2 className="h-4 w-4" /></button>
        <button type="button" onClick={onClose} title="Close (Esc)" className="rounded p-1.5 text-muted hover:bg-hover hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
      <Tabs tabs={[{ id: "params", label: "Parameters" }, { id: "settings", label: "Settings" }]} value={tab} onChange={setTab} />
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        {tab === "params" ? (
          <Params node={node} triggers={triggers} set={set} onChange={onChange} onChangeType={onChangeType} bind={bind} insert={insert} />
        ) : (
          <>
            {node.type !== "trigger" && node.type !== "end" && (
              <Toggle label="Continue on error" hint="If this step fails (e.g. no phone number), skip to the next step instead of failing the run."
                checked={!!d.continue_on_error} onChange={set("continue_on_error")} />
            )}
            <Field label="Notes" hint="Only visible in the editor.">
              <Textarea rows={4} value={d.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Why this step exists…" />
            </Field>
            <div className="text-xs text-faint">Node ID: <span className="font-mono">{node.id}</span></div>
          </>
        )}
      </div>
    </div>
  );
}

function Params({ node, triggers, set, onChange, onChangeType, bind, insert }: {
  node: Props["node"]; triggers: Props["triggers"]; set: (k: string) => (v: any) => void; onChange: (p: NodeData) => void; onChangeType: (t: string) => void;
  bind: ReturnType<typeof useInserter>["bind"]; insert: (k: string) => void;
}) {
  const d = node.data;
  switch (node.type) {
    case "trigger": return <TriggerParams d={d} triggers={triggers} onChange={onChange} />;
    case "sms": {
      const seg = smsSegments(renderTemplate(d.body ?? "", sampleVars));
      return (
        <>
          <Field label="Message">
            <Textarea rows={7} placeholder="Hi {{first_name}}…" {...bind(d.body ?? "", set("body"))} />
          </Field>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{seg.len} characters · {seg.segments} segment{seg.segments === 1 ? "" : "s"} · {seg.encoding}</span>
            {seg.segments > 2 && <span className="text-warning">Long message, costs {seg.segments}× per send</span>}
          </div>
          <Chips onInsert={insert} />
          <Preview text={d.body ?? ""} title="sample contact" />
          <div className="flex gap-2 rounded-md bg-subtle p-2.5 text-xs text-muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Sent from the shop's Telnyx number. Contacts who replied STOP are skipped automatically.</div>
        </>
      );
    }
    case "email": return (
      <>
        <Field label="Subject"><Input placeholder="Subject" {...bind(d.subject ?? "", set("subject"))} /></Field>
        <Field label="Body"><Textarea rows={11} {...bind(d.body ?? "", set("body"))} /></Field>
        <Chips onInsert={insert} />
        <Preview text={`${d.subject ?? ""}\n\n${d.body ?? ""}`} title="sample contact" />
      </>
    );
    case "ai_sms": case "ai_email": return (
      <>
        <Field label="Channel">
          <Select value={node.type} onChange={(e) => onChangeType(e.target.value)}>
            <option value="ai_sms">SMS</option><option value="ai_email">Email</option>
          </Select>
        </Field>
        <Field label="Goal / prompt" hint="The AI knows the shop's pricing, hours and address, plus the contact's name, source and notes.">
          <Textarea rows={6} placeholder="What should this message achieve?" {...bind(d.prompt ?? "", set("prompt"))} />
        </Field>
        <Chips onInsert={insert} />
      </>
    );
    case "wait": return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wait for"><Input type="number" min={1} value={d.amount ?? 1} onChange={(e) => set("amount")(Math.max(1, Number(e.target.value) || 1))} /></Field>
          <Field label="Unit">
            <Select value={d.unit ?? "hours"} onChange={(e) => set("unit")(e.target.value)}>
              <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-1">
          {[[5, "minutes"], [30, "minutes"], [2, "hours"], [1, "days"], [2, "days"], [7, "days"], [14, "days"]].map(([a, u]) => (
            <button key={`${a}${u}`} type="button" onClick={() => onChange({ amount: a, unit: u })}
              className={cn("rounded border px-2 py-0.5 text-xs", d.amount === a && d.unit === u ? "border-accent text-accent" : "border-border text-muted hover:text-fg")}>{a} {u}</button>
          ))}
        </div>
        <div className="text-xs text-muted">Runs resume on the next scheduler tick after the wait ends (every minute in production).</div>
      </>
    );
    case "condition": {
      const c = CONDITIONS.find((x) => x.id === d.check);
      return (
        <>
          <Field label="Check">
            <Select value={d.check ?? ""} onChange={(e) => onChange({ check: e.target.value, value: "" })}>
              <option value="" disabled>Pick a condition…</option>
              {CONDITIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </Select>
          </Field>
          {c?.needsValue === "tag" && <Field label="Tag"><TagInput value={d.value ?? ""} onChange={set("value")} /></Field>}
          {c?.needsValue === "status" && (
            <Field label="Status">
              <Select value={d.value ?? ""} onChange={(e) => set("value")(e.target.value)}>
                <option value="">Pick…</option>{CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          )}
          <div className="space-y-1 rounded-md bg-subtle p-3 text-xs text-muted">
            <div><span className="font-medium text-success">yes</span> output: condition is true</div>
            <div><span className="font-medium text-danger">no</span> output: condition is false</div>
            {(d.check === "replied" || d.check === "booked" || d.check === "email_opened") && <div>Only counts activity since the contact entered this automation.</div>}
          </div>
        </>
      );
    }
    case "assign": return <AssignParams d={d} onChange={onChange} />;
    case "update": return (
      <>
        <Field label="Set status">
          <Select value={d.status ?? ""} onChange={(e) => set("status")(e.target.value)}>
            <option value="">Don't change</option>{CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Add tag"><TagInput value={d.add_tag ?? ""} onChange={set("add_tag")} /></Field>
      </>
    );
    case "task": return (
      <>
        <Field label="Task title"><Input {...bind(d.title ?? "", set("title"))} /></Field>
        <Chips onInsert={insert} />
        <Field label="Due in (hours)" hint="Assigned to the contact's owner."><Input type="number" min={0} value={d.due_hours ?? 24} onChange={(e) => set("due_hours")(Number(e.target.value) || 0)} /></Field>
      </>
    );
    case "notify": return (
      <>
        <Field label="Alert message" hint="Posted to the contact's timeline as a system alert."><Textarea rows={4} {...bind(d.message ?? "", set("message"))} /></Field>
        <Chips onInsert={insert} />
      </>
    );
    case "webhook": return (
      <>
        <Field label="URL" hint="We POST JSON { contact, run_id }. A non-2xx response is logged as an error."><Input placeholder="https://hooks.zapier.com/…" value={d.url ?? ""} onChange={(e) => set("url")(e.target.value)} /></Field>
      </>
    );
    case "end": return <div className="text-sm text-muted">The run is marked completed when it reaches this node.</div>;
    default: return <div className="text-sm text-muted">This node has no parameters.</div>;
  }
}

function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tags = trpc.contacts.tags.useQuery(undefined, { staleTime: 60_000 });
  const id = React.useId();
  return (
    <>
      <Input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. partner" />
      <datalist id={id}>{(tags.data ?? []).map((t) => <option key={t} value={t} />)}</datalist>
    </>
  );
}

function AssignParams({ d, onChange }: { d: NodeData; onChange: (p: NodeData) => void }) {
  const team = trpc.team.list.useQuery(undefined, { staleTime: 60_000 });
  const pages = trpc.automations.landingPages.useQuery(undefined, { staleTime: 60_000 });
  const reps = (team.data ?? []).filter((p: any) => p.active);
  return (
    <>
      <Field label="Assign to">
        <Select value={d.rep_id ?? ""} onChange={(e) => {
          const rep = reps.find((r: any) => r.id === e.target.value) as any;
          onChange({ rep_id: e.target.value || null, rep_name: rep ? (rep.full_name ?? rep.email) : null });
        }}>
          <option value="">Round-robin (next available rep)</option>
          {reps.map((r: any) => <option key={r.id} value={r.id}>{r.full_name ?? r.email}</option>)}
        </Select>
      </Field>
      {!d.rep_id && (
        <Field label="Use routing from landing page" hint="Optional: follow that page's rep rotation and weights.">
          <Select value={d.landing_page_id ?? ""} onChange={(e) => onChange({ landing_page_id: e.target.value || null })}>
            <option value="">Global round-robin</option>
            {(pages.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      )}
    </>
  );
}

function TriggerParams({ d, triggers, onChange }: { d: NodeData; triggers: Props["triggers"]; onChange: (p: NodeData) => void }) {
  const c: Record<string, any> = d.config ?? {};
  const setC = (patch: Record<string, any>) => onChange({ config: { ...c, ...patch } });
  const pages = trpc.automations.landingPages.useQuery(undefined, { staleTime: 60_000 });
  const t = d.trigger_type as string;
  const info = triggers.find((x) => x.id === t);
  const landingField = (label: string, optional: boolean) => (
    pages.data && pages.data.length > 0 ? (
      <Field label={label}>
        <Select value={c.landing_page_id ?? ""} onChange={(e) => setC({ landing_page_id: e.target.value || undefined })}>
          <option value="">{optional ? "Any page / source" : "Any landing page"}</option>
          {pages.data.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status !== "published" ? ` (${p.status})` : ""}</option>)}
        </Select>
      </Field>
    ) : (
      <Field label={`${label} ID`} hint="No landing pages yet. Paste a page ID or leave blank for any.">
        <Input value={c.landing_page_id ?? ""} onChange={(e) => setC({ landing_page_id: e.target.value.trim() || undefined })} placeholder="Any" />
      </Field>
    )
  );
  return (
    <>
      <Field label="Trigger">
        <Select value={t ?? ""} onChange={(e) => onChange({ trigger_type: e.target.value })}>
          {triggers.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </Select>
      </Field>
      {info && <div className="text-xs text-muted">{info.description}</div>}
      {t === "form_submitted" && landingField("Landing page", false)}
      {t === "lead_created" && (
        <>
          {landingField("Only from landing page", true)}
          <Field label="Only from source" hint="e.g. landing, calendly, call, manual. Blank = any.">
            <Input value={c.source ?? ""} onChange={(e) => setC({ source: e.target.value.trim() || undefined })} placeholder="Any" />
          </Field>
        </>
      )}
      {t === "tag_added" && <Field label="Tag"><TagInput value={c.tag ?? ""} onChange={(v) => setC({ tag: v.trim() || undefined })} /></Field>}
      {t === "deal_stage_changed" && (
        <Field label="Stage">
          <Select value={c.stage ?? ""} onChange={(e) => setC({ stage: e.target.value || undefined })}>
            <option value="">Any stage</option>{DEAL_STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
      )}
      {t === "inbound_sms" && (
        <Field label="Keyword" hint="Only when the text contains this word. Blank = any inbound text.">
          <Input value={c.keyword ?? ""} onChange={(e) => setC({ keyword: e.target.value || undefined })} placeholder="e.g. BOOK" />
        </Field>
      )}
      {t === "smog_due" && (
        <Field label="Days before due date" hint="Checked once a day. Use {{vehicle}} and {{due_date}} in messages.">
          <Input type="number" min={1} max={120} value={c.days_before ?? 30} onChange={(e) => setC({ days_before: Math.max(1, Number(e.target.value) || 30) })} />
        </Field>
      )}
      <Toggle label="Stop sequence when contact replies" hint="Any inbound SMS or email stops their run so a rep can take over."
        checked={c.stop_on_reply !== false} onChange={(v) => setC({ stop_on_reply: v })} />
      <Toggle label="Allow re-entry" hint="Let a contact enter again while a previous run is still in progress."
        checked={!!c.allow_reentry} onChange={(v) => setC({ allow_reentry: v })} />
    </>
  );
}

