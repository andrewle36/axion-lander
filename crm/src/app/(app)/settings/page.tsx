"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Plug, Wrench, Sparkles, Palette, Database, User, Building, Copy, CheckCircle2, XCircle, Plus, Shuffle } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select, Switch, Table, Td, Th, Textarea } from "@/components/ui";
import { useTheme } from "@/components/layout/theme";
import { cn, money } from "@/lib/utils";

const SECTIONS = [
  { id: "general", label: "Business", icon: Building },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "services", label: "Services & pricing", icon: Wrench },
  { id: "routing", label: "Lead routing", icon: Shuffle },
  { id: "ai", label: "AI models", icon: Sparkles },
  { id: "profile", label: "My profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data", icon: Database },
];

export default function SettingsPage() {
  const [s, setS] = useState("general");
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<Settings className="h-4 w-4" />} title="Settings" />
      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 space-y-0.5 border-r border-border p-2">
          {SECTIONS.map((x) => (
            <button key={x.id} onClick={() => setS(x.id)} className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-sm", s === x.id ? "bg-hover font-medium" : "text-muted hover:bg-hover")}>
              <x.icon className="h-4 w-4" />{x.label}
            </button>
          ))}
        </nav>
        <div className="scroll-thin min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-4">
            {s === "general" && <General />}
            {s === "integrations" && <Integrations />}
            {s === "services" && <Services />}
            {s === "routing" && <Routing />}
            {s === "ai" && <AiModels />}
            {s === "profile" && <Profile />}
            {s === "appearance" && <Appearance />}
            {s === "data" && <DataSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function useSetting<T>(key: string, fallback: T) {
  const q = trpc.settings.get.useQuery({ key });
  const set = trpc.settings.set.useMutation({ onSuccess: () => toast.success("Saved") });
  return { value: (q.data ?? fallback) as T, loading: q.isLoading, save: (value: T) => set.mutate({ key, value }), saving: set.isPending };
}

function General() {
  const booking = useSetting<string>("booking_url", "https://checkin.newportsmog.com/s/newport/book");
  const pay = useSetting<string>("payment_instructions", "ACH / wire: see Mercury invoice link.\nZelle: newportsmog@gmail.com\nChecks payable to Newport Smog & Auto Registration, 375 Bristol St Unit 80, Costa Mesa, CA 92626");
  const [b, setB] = useState(""); const [p, setP] = useState("");
  useEffect(() => setB(booking.value), [booking.value]);
  useEffect(() => setP(pay.value), [pay.value]);
  return (
    <>
      <Card title="Business">
        <div className="grid grid-cols-2 gap-3 p-4 text-sm">
          <div><div className="text-xs text-muted">Name</div>Newport Smog &amp; Auto Registration</div>
          <div><div className="text-xs text-muted">BAR #</div>ARD 269691 (STAR certified, test-only)</div>
          <div><div className="text-xs text-muted">Phone</div>(714) 436-1700</div>
          <div><div className="text-xs text-muted">Address</div>375 Bristol St Unit 80, Costa Mesa, CA 92626</div>
          <div><div className="text-xs text-muted">Hours</div>Mon–Fri 8–6 · Sat 8–4 · Sun closed</div>
          <div><div className="text-xs text-muted">Email</div>newportsmog@gmail.com</div>
        </div>
      </Card>
      <Card title="Booking link">
        <div className="space-y-2 p-4">
          <Field label="Calendly scheduling URL" hint="Used for {{booking_link}} in texts/emails and the public /book redirect.">
            <Input value={b} onChange={(e) => setB(e.target.value)} placeholder="https://calendly.com/newportsmog/smog-check" />
          </Field>
          <Button variant="primary" loading={booking.saving} onClick={() => booking.save(b)}>Save</Button>
        </div>
      </Card>
      <Card title="Payment instructions (shown on invoices)">
        <div className="space-y-2 p-4"><Textarea rows={4} value={p} onChange={(e) => setP(e.target.value)} /><Button variant="primary" loading={pay.saving} onClick={() => pay.save(p)}>Save</Button></div>
      </Card>
    </>
  );
}

const PROVIDERS = [
  { id: "openrouter", key: "openrouter", name: "OpenRouter", what: "AI overviews, drafting, call summaries, AI follow-ups", env: ["OPENROUTER_API_KEY"] },
  { id: "telnyx", key: "telnyx_sms", name: "Telnyx SMS", what: "Two-way texting", env: ["TELNYX_API_KEY", "TELNYX_PHONE_NUMBER", "TELNYX_MESSAGING_PROFILE_ID", "TELNYX_PUBLIC_KEY"], hook: "telnyx" },
  { id: "telnyx", key: "telnyx_voice", name: "Telnyx Voice", what: "Browser softphone (WebRTC)", env: ["TELNYX_CREDENTIAL_CONNECTION_ID"], noTest: true },
  { id: "resend", key: "resend", name: "Resend", what: "Outbound + inbound email, invoice emails", env: ["RESEND_API_KEY", "RESEND_FROM", "RESEND_WEBHOOK_SECRET"], hook: "resend" },
  { id: "calendly", key: "calendly", name: "Calendly", what: "Bookings sync into the calendar + automations", env: ["CALENDLY_TOKEN", "CALENDLY_WEBHOOK_SIGNING_KEY"], hook: "calendly" },
  { id: "pandadoc", key: "pandadoc", name: "PandaDoc", what: "1-click partner agreements", env: ["PANDADOC_API_KEY", "PANDADOC_TEMPLATE_ID", "PANDADOC_WEBHOOK_KEY"], hook: "pandadoc" },
  { id: "mercury", key: "mercury", name: "Mercury", what: "Invoices + payment links, bank sync for P&L", env: ["MERCURY_API_TOKEN", "MERCURY_ACCOUNT_ID"] },
] as const;

function Integrations() {
  const q = trpc.settings.integrations.useQuery();
  const test = trpc.settings.testIntegration.useMutation({ onSuccess: (r) => toast.success(r?.detail ?? "Connected") });
  const [testing, setTesting] = useState("");
  if (q.isLoading) return <Loading />;
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  return (
    <>
      <p className="text-sm text-muted">API keys live in Vercel environment variables (never in the database). Set them in Vercel → Project → Settings → Environment Variables, then redeploy.</p>
      {PROVIDERS.map((p) => {
        const ok = (q.data?.status as any)?.[p.key];
        const hook = "hook" in p ? (q.data?.webhooks as any)?.[p.hook] : null;
        return (
          <Card key={p.key}>
            <div className="flex items-start gap-3 p-4">
              {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" /> : <XCircle className="mt-0.5 h-5 w-5 text-faint" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold">{p.name}</span><Badge tone={ok ? "green" : "gray"}>{ok ? "Configured" : "Not configured"}</Badge></div>
                <div className="text-sm text-muted">{p.what}</div>
                <div className="mt-2 flex flex-wrap gap-1">{p.env.map((e) => <code key={e} className="rounded bg-subtle px-1.5 py-0.5 text-xs">{e}</code>)}</div>
                {hook && <div className="mt-2 flex items-center gap-2 text-xs"><span className="text-muted">Webhook URL:</span><code className="truncate rounded bg-subtle px-1.5 py-0.5">{hook}</code>
                  <button onClick={() => copy(hook)} className="text-muted hover:text-fg"><Copy className="h-3.5 w-3.5" /></button></div>}
              </div>
              {!("noTest" in p) && <Button size="xs" disabled={!ok} loading={test.isPending && testing === p.id}
                onClick={() => { setTesting(p.id); test.mutate({ provider: p.id as any }); }}>{p.id === "calendly" ? "Test + connect webhook" : "Test"}</Button>}
            </div>
          </Card>
        );
      })}
      <Card title="Lead capture endpoint">
        <div className="space-y-2 p-4 text-sm"><p className="text-muted">POST leads from any website or form tool (JSON or form-encoded: name, phone, email, source, message).</p>
          <div className="flex items-center gap-2"><code className="flex-1 truncate rounded bg-subtle px-2 py-1 text-xs">{q.data?.webhooks.leads}</code><Button size="xs" icon={<Copy className="h-3 w-3" />} onClick={() => copy(q.data!.webhooks.leads)}>Copy</Button></div>
        </div>
      </Card>
    </>
  );
}

function Services() {
  const list = trpc.settings.services.useQuery();
  const save = trpc.settings.saveService.useMutation({ onSuccess: () => toast.success("Saved") });
  const [draft, setDraft] = useState<any>(null);
  return (
    <Card title="Service catalog" action={<Button size="xs" icon={<Plus className="h-3 w-3" />} onClick={() => setDraft({ code: "", name: "", category: "smog", price: 0, cert_fee: 0, cost: 0, active: true, sort: (list.data?.length ?? 0) + 1 })}>Add service</Button>}>
      {list.isLoading ? <Loading /> : (
        <Table><thead><tr><Th>Service</Th><Th>Category</Th><Th>Vehicle</Th><Th className="text-right">Price</Th><Th className="text-right">Cert fee</Th><Th className="text-right">Cost (COGS)</Th><Th className="text-right">Customer pays</Th><Th>Active</Th></tr></thead>
          <tbody>
            {[...(list.data ?? []), ...(draft ? [draft] : [])].map((sv: any, i: number) => (
              <ServiceRow key={sv.id ?? `new-${i}`} sv={sv} onSave={(v) => { save.mutate(v); if (!sv.id) setDraft(null); }} />
            ))}
          </tbody></Table>
      )}
      <p className="px-4 pb-3 text-xs text-faint">Prices from the shop price sheet. Partner accounts override the smog price on their account. The $8.25 certificate fee is passed through to the state and counted as cost of goods.</p>
    </Card>
  );
}
function ServiceRow({ sv, onSave }: { sv: any; onSave: (v: any) => void }) {
  const [v, setV] = useState(sv);
  useEffect(() => setV(sv), [sv]);
  const dirty = JSON.stringify(v) !== JSON.stringify(sv) || !sv.id;
  const n = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  return (
    <tr>
      <Td><div className="flex gap-1"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="w-52" placeholder="Name" />{!sv.id && <Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} className="w-24" placeholder="code" />}</div></Td>
      <Td><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className="w-24">{["smog", "retest", "dmv", "vin", "other"].map((c) => <option key={c}>{c}</option>)}</Select></Td>
      <Td className="text-muted">{v.vehicle_category ?? "any"}</Td>
      <Td><Input type="number" step="0.01" value={v.price} onChange={n("price")} className="w-20 text-right" /></Td>
      <Td><Input type="number" step="0.01" value={v.cert_fee} onChange={n("cert_fee")} className="w-20 text-right" /></Td>
      <Td><Input type="number" step="0.01" value={v.cost} onChange={n("cost")} className="w-20 text-right" /></Td>
      <Td className="text-right font-medium">{money(Number(v.price) + Number(v.cert_fee))}</Td>
      <Td><div className="flex items-center gap-2"><Switch checked={v.active} onChange={(a) => setV({ ...v, active: a })} />
        {dirty && <Button size="xs" variant="primary" onClick={() => onSave({ id: v.id, code: v.code, name: v.name, category: v.category, vehicle_category: v.vehicle_category ?? null, price: Number(v.price), cert_fee: Number(v.cert_fee), cost: Number(v.cost), active: v.active, sort: v.sort ?? 0 })}>Save</Button>}</div></Td>
    </tr>
  );
}

function Routing() {
  const team = trpc.team.list.useQuery();
  const r = useSetting<{ reps: string[]; pointer: number }>("default_routing", { reps: [], pointer: 0 });
  const [reps, setReps] = useState<string[]>([]);
  useEffect(() => setReps(r.value.reps ?? []), [r.value]);
  return (
    <Card title="Default round-robin (leads not from a landing page)">
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Calendly bookings, inbound calls/texts and API leads rotate across these reps. Landing pages have their own routing rules on each page. Leave empty to rotate across all active, unpaused teammates.</p>
        {team.data?.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reps.includes(t.id)} onChange={(e) => setReps(e.target.checked ? [...reps, t.id] : reps.filter((x) => x !== t.id))} />
            {t.full_name ?? t.email}{t.rr_paused && <Badge tone="amber">paused</Badge>}</label>
        ))}
        <Button variant="primary" loading={r.saving} onClick={() => r.save({ reps, pointer: r.value.pointer ?? 0 })}>Save</Button>
      </div>
    </Card>
  );
}

function AiModels() {
  const cur = trpc.settings.aiModels.useQuery();
  const set = trpc.settings.set.useMutation({ onSuccess: () => toast.success("Saved") });
  const [m, setM] = useState({ primary: "", fast: "" });
  useEffect(() => { if (cur.data) setM(cur.data); }, [cur.data]);
  return (
    <Card title="OpenRouter models">
      <div className="space-y-3 p-4">
        <Field label="Primary model" hint="AI overviews, business insights. Default x-ai/grok-4"><Input value={m.primary} onChange={(e) => setM({ ...m, primary: e.target.value })} /></Field>
        <Field label="Fast model" hint="Drafting texts/emails, AI follow-ups, call summaries. Default x-ai/grok-4-fast"><Input value={m.fast} onChange={(e) => setM({ ...m, fast: e.target.value })} /></Field>
        <div className="flex flex-wrap gap-1 text-xs">{["x-ai/grok-4", "x-ai/grok-4-fast", "anthropic/claude-sonnet-4.5", "openai/gpt-5-mini", "google/gemini-2.5-flash"].map((x) => (
          <button key={x} onClick={() => setM({ ...m, fast: x })} className="rounded border border-border px-2 py-0.5 text-muted hover:bg-hover">{x}</button>))}</div>
        <Button variant="primary" loading={set.isPending} onClick={() => set.mutate({ key: "ai_models", value: m })}>Save</Button>
      </div>
    </Card>
  );
}

function Profile() {
  const me = trpc.team.me.useQuery();
  const update = trpc.team.update.useMutation({ onSuccess: () => toast.success("Saved") });
  const [f, setF] = useState({ full_name: "", phone: "" });
  useEffect(() => { if (me.data) setF({ full_name: me.data.full_name ?? "", phone: me.data.phone ?? "" }); }, [me.data]);
  return (
    <Card title="My profile">
      <div className="space-y-3 p-4">
        <Field label="Name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="Mobile (for alerts)"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <div className="text-xs text-muted">Signed in as {me.data?.email} · role {me.data?.role}</div>
        <Button variant="primary" loading={update.isPending} onClick={() => me.data && update.mutate({ id: me.data.id, full_name: f.full_name, phone: f.phone || null })}>Save</Button>
      </div>
    </Card>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <Card title="Theme">
      <div className="flex gap-3 p-4">
        {(["light", "dark"] as const).map((t) => (
          <button key={t} onClick={() => setTheme(t)} className={cn("w-40 rounded-md border p-3 text-left text-sm capitalize", theme === t ? "border-accent ring-2 ring-accent/20" : "border-border hover:bg-hover")}>
            <div className={cn("mb-2 h-16 rounded border border-border", t === "dark" ? "bg-[#171717]" : "bg-white")} />{t}
          </button>
        ))}
      </div>
    </Card>
  );
}

function DataSection() {
  const counts = trpc.settings.demoCounts.useQuery();
  const wipe = trpc.settings.wipeDemo.useMutation({ onSuccess: (r) => toast.success(`Removed ${Object.values(r).reduce((a, b) => a + b, 0)} demo rows`) });
  const [confirm, setConfirm] = useState("");
  const total = Object.values(counts.data ?? {}).reduce((a, b) => a + b, 0);
  return (
    <Card title="Demo data">
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">Sample drivers, deals, jobs, invoices, bank transactions and messages were loaded so every page has data. Your real partner accounts and price list are not demo data and are kept.</p>
        <div className="flex flex-wrap gap-2">{Object.entries(counts.data ?? {}).map(([k, v]) => <Badge key={k}>{k}: {v}</Badge>)}</div>
        <Field label='Type "DELETE DEMO DATA" to confirm'><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <Button variant="danger" disabled={confirm !== "DELETE DEMO DATA" || !total} loading={wipe.isPending} onClick={() => wipe.mutate({ confirm: "DELETE DEMO DATA" })}>Delete all demo data</Button>
      </div>
    </Card>
  );
}
