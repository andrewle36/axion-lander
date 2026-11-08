"use client";
import * as React from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Field, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

export const STAGES = ["lead", "qualified", "proposal", "contract_sent", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_META: Record<Stage, { label: string; color: string }> = {
  lead: { label: "Lead", color: "#3b82f6" },
  qualified: { label: "Qualified", color: "#8b5cf6" },
  proposal: { label: "Proposal", color: "#f59e0b" },
  contract_sent: { label: "Contract sent", color: "#14b8a6" },
  won: { label: "Won", color: "#22c55e" },
  lost: { label: "Lost", color: "#ef4444" },
};
export const COMPANY_KINDS = ["dealer", "rental", "repair", "exotic", "fleet", "storage", "other"] as const;

export function StageDot({ stage, className }: { stage: string; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: STAGE_META[stage as Stage]?.color ?? "#9ca3af" }} />;
}
export function StagePill({ stage }: { stage: string }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded bg-subtle px-1.5 text-xs font-medium text-fg">
      <StageDot stage={stage} />{STAGE_META[stage as Stage]?.label ?? stage}
    </span>
  );
}

/** Prompt for a lost reason. Returns null if cancelled. */
export function askLostReason(): string | null {
  if (typeof window === "undefined") return null;
  const r = window.prompt("Why was this deal lost? (required)");
  if (r == null) return null;
  if (!r.trim()) { toast.error("A lost reason is required"); return null; }
  return r.trim();
}

/** Confirm-and-send dialog for the one-click PandaDoc contract. */
export function SendContractDialog({ open, onClose, dealId, companyId, defaultEmail, defaultName, title }: {
  open: boolean; onClose: () => void; dealId?: string | null; companyId?: string | null; defaultEmail?: string | null; defaultName?: string | null; title?: string;
}) {
  const [email, setEmail] = React.useState(defaultEmail ?? "");
  const [name, setName] = React.useState(defaultName ?? "");
  const [message, setMessage] = React.useState("");
  React.useEffect(() => { if (open) { setEmail(defaultEmail ?? ""); setName(defaultName ?? ""); setMessage(""); } }, [open, defaultEmail, defaultName]);
  const viaDeal = trpc.deals.sendContract.useMutation({ onSuccess: () => { toast.success("Contract sent via PandaDoc"); onClose(); } });
  const viaCompany = trpc.onboarding.sendContract.useMutation({ onSuccess: () => { toast.success("Contract sent via PandaDoc"); onClose(); } });
  const pending = viaDeal.isPending || viaCompany.isPending;
  const submit = () => {
    if (dealId) viaDeal.mutate({ dealId, recipientEmail: email.trim() || undefined, recipientName: name.trim() || undefined, message: message.trim() || undefined });
    else if (companyId) viaCompany.mutate({ companyId, recipientEmail: email.trim() || undefined });
  };
  // Stop React (portal) mousedown bubbling so the backdrop click doesn't also close a parent Drawer.
  return (
    <span onMouseDown={(e) => e.stopPropagation()} className="contents">
    <Dialog open={open} onClose={onClose} title={title ?? "Send partner agreement"} width={460}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Send className="h-3.5 w-3.5" />} loading={pending} onClick={submit}>Send via PandaDoc</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Generates the partner agreement from your PandaDoc template with the deal&apos;s pricing, volume and month-end billing terms, then emails it for e-signature.</p>
        <Field label="Recipient email" hint="Defaults to the deal contact, then the account email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@dealer.com" /></Field>
        {dealId && <Field label="Recipient name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" /></Field>}
        {dealId && <Field label="Message (optional)"><Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign your Newport Smog partner agreement." /></Field>}
      </div>
    </Dialog>
    </span>
  );
}

export function useTeam() {
  return trpc.team.list.useQuery(undefined, { staleTime: 60_000 });
}
