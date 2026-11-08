"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, ExternalLink, Send, Mail, CreditCard, Rocket, ChevronDown, ChevronRight, Building2, ListPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Dialog, Empty, Field, Input, Loading, PageHeader, Select, StatusBadge, Toolbar, confirmAction } from "@/components/ui";
import { dealNo, fullName, money, relTime } from "@/lib/utils";
import { ChecklistItems, ProgressBar } from "@/components/deals/onboarding-checklist";
import { SendContractDialog, StagePill, useTeam } from "@/components/deals/shared";

const BILLING = [
  { v: "monthly_invoice", l: "Month-end invoice (Mercury)" }, { v: "per_job", l: "Pay per job" }, { v: "card_on_file", l: "Card on file" },
  { v: "zelle", l: "Zelle" }, { v: "check", l: "Check" }, { v: "cash", l: "Cash" },
];

export default function OnboardingPage() {
  const me = trpc.team.me.useQuery();
  const team = useTeam();
  const isAdmin = me.data ? me.data.role !== "rep" : false;
  const [owner, setOwner] = React.useState("");
  const [filter, setFilter] = React.useState<"onboarding" | "all">("onboarding");
  const board = trpc.onboarding.board.useQuery({ owner: owner || undefined });
  const tpl = trpc.onboarding.checklistTemplate.useQuery(undefined, { staleTime: Infinity });
  const rows = (board.data ?? []).filter((c: any) => filter === "all" || c.status === "onboarding");
  const recent = (board.data ?? []).filter((c: any) => c.status === "active").length;
  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<ClipboardCheck className="h-4 w-4" />} title="Onboarding" count={rows.length} />
      <Toolbar>
        <div className="flex items-center rounded border border-border p-0.5 text-xs">
          <button type="button" onClick={() => setFilter("onboarding")} className={`h-6 rounded px-2 ${filter === "onboarding" ? "bg-subtle font-medium text-fg" : "text-muted"}`}>In onboarding</button>
          <button type="button" onClick={() => setFilter("all")} className={`h-6 rounded px-2 ${filter === "all" ? "bg-subtle font-medium text-fg" : "text-muted"}`}>Include recently activated ({recent})</button>
        </div>
        {isAdmin && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44">
            <option value="">All reps</option><option value="me">Mine</option>
            {(team.data ?? []).filter((p: any) => p.active).map((p: any) => <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>)}
          </Select>
        )}
      </Toolbar>
      <div className="flex-1 overflow-auto bg-panel p-4">
        {board.isLoading ? <Loading /> : rows.length === 0 ? (
          <Empty icon={<ClipboardCheck className="h-8 w-8" />} title="No accounts onboarding" body="When a partner deal is won (or its PandaDoc contract is signed) the account lands here with its onboarding checklist." action={<Link href="/deals" className="text-sm text-accent hover:underline">Go to deals</Link>} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {rows.map((c: any) => <AccountCard key={c.id} c={c} required={tpl.data?.required ?? []} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountCard({ c, required }: { c: any; required: string[] }) {
  const [expanded, setExpanded] = React.useState(true);
  const [contractOpen, setContractOpen] = React.useState(false);
  const [billingOpen, setBillingOpen] = React.useState(false);
  const me = trpc.team.me.useQuery();
  const router = useRouter();
  const ensure = trpc.onboarding.ensureChecklist.useMutation();
  const welcome = trpc.onboarding.sendWelcome.useMutation({ onSuccess: () => toast.success("Welcome email sent") });
  const activate = trpc.onboarding.activate.useMutation({ onSuccess: () => toast.success(`${c.name} is now active`) });
  const welcomeDone = c.items.find((i: any) => i.key === "welcome_sent")?.done;
  const contractDone = c.items.find((i: any) => i.key === "contract_signed")?.done;
  const pc = c.primaryContact;
  const doActivate = () => {
    if (c.requiredDone) { activate.mutate({ companyId: c.id }); return; }
    if (me.data?.role !== "rep" && confirmAction("Required onboarding items are still open. Activate anyway?")) activate.mutate({ companyId: c.id, force: true });
    else if (me.data?.role === "rep") activate.mutate({ companyId: c.id });
  };
  return (
    <div className="rounded-md border border-border bg-bg">
      <div className="flex items-start gap-3 border-b border-border p-3">
        <Avatar name={c.name} square size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/accounts/${c.id}`} className="truncate text-sm font-semibold hover:text-accent">{c.name}</Link>
            <StatusBadge status={c.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {c.deal && <span className="font-mono">{dealNo(c.deal.number)}</span>}
            {c.deal && <StagePill stage={c.deal.stage} />}
            {c.smog_price != null && <span>{money(c.smog_price)}/car</span>}
            {c.deal && <span>~{c.deal.est_cars_per_month} cars/mo</span>}
            <span className="capitalize">{String(c.billing_method).replace(/_/g, " ")}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
            {pc ? <span>{fullName(pc)}{pc.email ? ` · ${pc.email}` : " · no email"}</span> : <span>No contacts yet</span>}
            {c.latestContract && <span>Contract: <StatusBadge status={c.latestContract.status} /></span>}
            <span>Updated {relTime(c.updated_at)}</span>
          </div>
        </div>
        {c.owner && <Avatar name={c.owner.full_name} color={c.owner.color} size={22} />}
      </div>
      <div className="p-3">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-2 text-left">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
          <ProgressBar done={c.done} total={c.total} className="flex-1" />
          {c.requiredDone && c.status !== "active" && <Badge tone="green">Ready</Badge>}
        </button>
        {expanded && (
          <div className="mt-2">
            {c.items.length ? <ChecklistItems items={c.items} required={required} /> : (
              <div className="flex items-center justify-between rounded border border-dashed border-border px-3 py-2 text-xs text-faint">
                No checklist yet
                <Button size="xs" icon={<ListPlus className="h-3 w-3" />} loading={ensure.isPending} onClick={() => ensure.mutate({ companyId: c.id, dealId: c.deal?.id })}>Create checklist</Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-border p-2.5">
        <Button size="xs" variant="ghost" icon={<ExternalLink className="h-3 w-3" />} onClick={() => router.push(`/accounts/${c.id}`)}>Open account</Button>
        {c.deal && <Button size="xs" variant="ghost" icon={<Building2 className="h-3 w-3" />} onClick={() => router.push(`/deals?open=${c.deal.id}`)}>{dealNo(c.deal.number)}</Button>}
        <Button size="xs" variant={contractDone ? "secondary" : "primary"} icon={<Send className="h-3 w-3" />} onClick={() => setContractOpen(true)}>{contractDone ? "Send new contract" : "Send contract"}</Button>
        <Button size="xs" icon={<Mail className="h-3 w-3" />} loading={welcome.isPending} onClick={() => {
          if (welcomeDone && !confirmAction("The welcome email was already sent. Send it again?")) return;
          welcome.mutate({ companyId: c.id });
        }}>{welcomeDone ? "Resend welcome" : "Send welcome email"}</Button>
        <Button size="xs" icon={<CreditCard className="h-3 w-3" />} onClick={() => setBillingOpen(true)}>Set up billing</Button>
        {c.status !== "active" && (
          <Button size="xs" variant={c.requiredDone ? "primary" : "outline"} className="ml-auto" icon={<Rocket className="h-3 w-3" />} loading={activate.isPending} onClick={doActivate}>Activate account</Button>
        )}
      </div>
      <SendContractDialog open={contractOpen} onClose={() => setContractOpen(false)} dealId={c.deal && c.deal.stage !== "lost" ? c.deal.id : null} companyId={c.id}
        defaultEmail={pc?.email ?? c.email} defaultName={pc ? fullName(pc) : c.contact_name} />
      <BillingDialog open={billingOpen} onClose={() => setBillingOpen(false)} c={c} />
    </div>
  );
}

function BillingDialog({ open, onClose, c }: { open: boolean; onClose: () => void; c: any }) {
  const [email, setEmail] = React.useState(c.email ?? "");
  const [method, setMethod] = React.useState(c.billing_method ?? "monthly_invoice");
  const [terms, setTerms] = React.useState(String(c.payment_terms_days ?? 15));
  React.useEffect(() => {
    if (open) { setEmail(c.email ?? c.primaryContact?.email ?? ""); setMethod(c.billing_method ?? "monthly_invoice"); setTerms(String(c.payment_terms_days ?? 15)); }
  }, [open, c]);
  const save = trpc.onboarding.setupBilling.useMutation({ onSuccess: (r) => { toast.success(r.note); onClose(); } });
  return (
    <Dialog open={open} onClose={onClose} title={`Set up billing · ${c.name}`} width={440}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!email.trim()}
        onClick={() => save.mutate({ companyId: c.id, email: email.trim(), billing_method: method as any, payment_terms_days: Math.max(0, Math.round(Number(terms) || 0)) })}>Save billing</Button></>}>
      <div className="space-y-3">
        <Field label="Billing email" hint="Month-end invoices and pay links go here (AP / office manager)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ap@dealer.com" /></Field>
        <Field label="Billing method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>{BILLING.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}</Select></Field>
        <Field label="Payment terms (days)" hint="Net days after the month-end invoice"><Input type="number" min={0} max={120} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
        {method === "monthly_invoice" && <p className="text-xs text-muted">We&apos;ll create the account&apos;s Mercury customer (if Mercury is connected) so month-end invoices are emailed automatically with a pay link.</p>}
      </div>
    </Dialog>
  );
}
