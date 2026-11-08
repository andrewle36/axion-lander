"use client";
import * as React from "react";
import { ClipboardCheck, ListPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button, Checkbox, Spinner } from "@/components/ui";
import { cn, shortDate } from "@/lib/utils";

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const p = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
        <div className={cn("h-full rounded-full transition-all", p === 100 ? "bg-success" : "bg-accent")} style={{ width: `${p}%` }} />
      </div>
      <span className="w-14 text-right text-xs tabular-nums text-muted">{done}/{total}</span>
    </div>
  );
}

export function ChecklistItems({ items, required }: { items: any[]; required?: string[] }) {
  const toggle = trpc.onboarding.toggle.useMutation();
  return (
    <div className="space-y-0.5">
      {items.map((i) => (
        <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-hover">
          <Checkbox checked={i.done} onChange={(v) => toggle.mutate({ id: i.id, done: v })} />
          <span className={cn("flex-1 text-sm", i.done && "text-faint line-through")}>{i.label}
            {required?.includes(i.key) && !i.done && <span className="ml-1 text-xs text-warning">required</span>}
          </span>
          {i.done && i.done_at && <span className="text-xs text-faint">{shortDate(i.done_at)}</span>}
        </label>
      ))}
    </div>
  );
}

/** Embeddable onboarding checklist for an account profile. */
export function OnboardingChecklist({ companyId }: { companyId: string }) {
  const q = trpc.onboarding.items.useQuery({ companyId });
  const tpl = trpc.onboarding.checklistTemplate.useQuery(undefined, { staleTime: Infinity });
  const ensure = trpc.onboarding.ensureChecklist.useMutation();
  const items = q.data ?? [];
  const done = items.filter((i: any) => i.done).length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted" />
        <span className="text-sm font-semibold">Onboarding</span>
        {items.length > 0 && <ProgressBar done={done} total={items.length} className="ml-2 flex-1" />}
        {items.length > 0 && items.length < (tpl.data?.items.length ?? 6) && (
          <Button size="xs" variant="ghost" loading={ensure.isPending} onClick={() => ensure.mutate({ companyId })}>Add missing items</Button>
        )}
      </div>
      {q.isLoading ? <Spinner /> : items.length === 0 ? (
        <div className="flex items-center justify-between rounded border border-dashed border-border px-3 py-3 text-xs text-faint">
          No onboarding checklist yet.
          <Button size="xs" icon={<ListPlus className="h-3 w-3" />} loading={ensure.isPending} onClick={() => ensure.mutate({ companyId })}>Create checklist</Button>
        </div>
      ) : <ChecklistItems items={items} required={tpl.data?.required} />}
    </div>
  );
}
