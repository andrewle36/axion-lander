"use client";
import * as React from "react";
import { Plus, KanbanSquare } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Avatar, Button, Spinner } from "@/components/ui";
import { compactMoney, dealNo, shortDate } from "@/lib/utils";
import { StagePill } from "./shared";
import { NewDealDialog } from "./new-deal-dialog";
import { DealDrawer } from "./deal-drawer";

/** Embeddable list of an account's deals; clicking opens the deal drawer in place. */
export function DealsList({ companyId }: { companyId: string }) {
  const q = trpc.deals.list.useQuery({ companyId });
  const [newOpen, setNewOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const rows = q.data ?? [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold"><KanbanSquare className="h-4 w-4 text-muted" />Deals <span className="font-normal text-faint">{rows.length}</span></div>
        <Button size="xs" icon={<Plus className="h-3 w-3" />} onClick={() => setNewOpen(true)}>New deal</Button>
      </div>
      {q.isLoading ? <Spinner /> : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-faint">No deals for this account</div>
      ) : (
        <div className="divide-y divide-border rounded border border-border">
          {rows.map((d: any) => (
            <button key={d.id} type="button" onClick={() => setOpenId(d.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover">
              <span className="font-mono text-xs text-muted">{dealNo(d.number)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
              <StagePill stage={d.stage} />
              <span className="w-16 text-right text-xs tabular-nums">{compactMoney(d.value_monthly)}/mo</span>
              <span className="hidden w-20 text-right text-xs text-muted sm:inline">{d.expected_close ? shortDate(d.expected_close + "T12:00:00") : ""}</span>
              {d.owner && <Avatar name={d.owner.full_name} color={d.owner.color} size={18} />}
            </button>
          ))}
        </div>
      )}
      <NewDealDialog open={newOpen} onClose={() => setNewOpen(false)} companyId={companyId} onCreated={(d) => setOpenId(d.id)} />
      <DealDrawer dealId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
