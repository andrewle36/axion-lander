"use client";
import * as React from "react";
import { FileSignature, RefreshCw, Link2, Download, RotateCw, Ban, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, IconButton, StatusBadge, Spinner, confirmAction } from "@/components/ui";
import { dealNo, shortDate } from "@/lib/utils";
import { SendContractDialog } from "./shared";

export function ContractsPanel({ companyId, dealId, defaultEmail, defaultName, compact }: {
  companyId: string; dealId?: string | null; defaultEmail?: string | null; defaultName?: string | null; compact?: boolean;
}) {
  const q = trpc.deals.contracts.useQuery(dealId ? { dealId } : { companyId });
  const [sendOpen, setSendOpen] = React.useState(false);
  const refresh = trpc.deals.refreshContract.useMutation({ onSuccess: (r) => toast.success(`Status: ${r.status}`) });
  const resend = trpc.deals.resendContract.useMutation({ onSuccess: () => toast.success("Contract re-sent") });
  const voidC = trpc.deals.voidContract.useMutation({ onSuccess: () => toast.success("Contract voided") });
  const link = trpc.deals.signingLink.useMutation({
    onSuccess: async (r) => {
      try { await navigator.clipboard.writeText(r.url); toast.success("Signing link copied (valid 1 hour)"); } catch { /* ignore */ }
      window.open(r.url, "_blank", "noopener");
    },
  });
  const rows = q.data ?? [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {!compact && <div className="flex items-center gap-1.5 text-sm font-semibold"><FileSignature className="h-4 w-4 text-muted" />Contracts</div>}
        <Button size="xs" variant="primary" className={compact ? "ml-auto" : ""} icon={<Send className="h-3 w-3" />} onClick={() => setSendOpen(true)}>Send contract</Button>
      </div>
      {q.isLoading ? <div className="py-3"><Spinner /></div> : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-faint">No contracts yet. Send the partner agreement in one click.</div>
      ) : (
        <div className="divide-y divide-border rounded border border-border">
          {rows.map((c: any) => (
            <div key={c.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted">
                    {c.deal?.number ? `${dealNo(c.deal.number)} · ` : ""}{c.recipient_email ?? "no recipient"}
                    {c.sent_at && ` · sent ${shortDate(c.sent_at)}`}{c.viewed_at && ` · viewed ${shortDate(c.viewed_at)}`}{c.completed_at && ` · signed ${shortDate(c.completed_at)}`}
                    {!c.sent_at && ` · ${shortDate(c.created_at)}`}
                  </div>
                </div>
                <StatusBadge status={c.status} />
                <div className="flex items-center">
                  {c.pandadoc_id && <IconButton label="Refresh status from PandaDoc" disabled={refresh.isPending} onClick={() => refresh.mutate({ id: c.id })}><RefreshCw className="h-3.5 w-3.5" /></IconButton>}
                  {c.pandadoc_id && ["sent", "viewed"].includes(c.status) && <IconButton label="Open signing link" disabled={link.isPending} onClick={() => link.mutate({ id: c.id })}><Link2 className="h-3.5 w-3.5" /></IconButton>}
                  {c.pandadoc_id && <a href={`/api/contracts/${c.id}/pdf`} target="_blank" rel="noreferrer" title="Download PDF" aria-label="Download PDF" className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"><Download className="h-3.5 w-3.5" /></a>}
                  {c.status !== "completed" && c.deal_id && <IconButton label={["sent", "viewed"].includes(c.status) ? "Resend" : "Send a new copy"} disabled={resend.isPending} onClick={() => resend.mutate({ id: c.id })}><RotateCw className="h-3.5 w-3.5" /></IconButton>}
                  {!["completed", "voided"].includes(c.status) && <IconButton label="Void" disabled={voidC.isPending} onClick={() => { if (confirmAction("Mark this contract voided?")) voidC.mutate({ id: c.id }); }}><Ban className="h-3.5 w-3.5" /></IconButton>}
                </div>
              </div>
              {c.status === "error" && c.error && <div className="mt-1 flex items-start gap-1.5 rounded bg-danger/10 px-2 py-1 text-xs text-danger"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{c.error}</div>}
            </div>
          ))}
        </div>
      )}
      <SendContractDialog open={sendOpen} onClose={() => setSendOpen(false)} dealId={dealId} companyId={companyId} defaultEmail={defaultEmail} defaultName={defaultName} />
    </div>
  );
}
