"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Dialog, Input, Select, Field, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { IconTile } from "./flow-node";

export function NewAutomationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const templates = trpc.automations.templates.useQuery(undefined, { enabled: open });
  const triggers = trpc.automations.triggers.useQuery(undefined, { enabled: open });
  const create = trpc.automations.create.useMutation({ onSuccess: (a: any) => { onClose(); router.push(`/automations/${a.id}`); } });
  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState("lead_created");
  const [pending, setPending] = React.useState<string | null>(null);
  React.useEffect(() => { if (!open) { setName(""); setPending(null); } }, [open]);

  const go = (templateId?: string) => {
    setPending(templateId ?? "blank");
    create.mutate(templateId ? { templateId } : { name: name || undefined, trigger_type: trigger }, { onSettled: () => setPending(null) });
  };

  return (
    <Dialog open={open} onClose={onClose} title="New automation" width={720}>
      <div className="space-y-5">
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4" />Start from scratch</div>
          <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled automation" onKeyDown={(e) => { if (e.key === "Enter") go(); }} autoFocus /></Field>
            <Field label="Trigger">
              <Select value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                {(triggers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            </Field>
            <Button variant="primary" loading={pending === "blank"} disabled={!!pending} onClick={() => go()}>Create</Button>
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Or start from a template</div>
          {templates.isLoading ? <div className="flex justify-center p-6"><Spinner /></div> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(templates.data ?? []).map((t) => (
                <button key={t.id} type="button" disabled={!!pending} onClick={() => go(t.id)}
                  className={cn("group flex flex-col gap-2 rounded-lg border border-border p-3 text-left hover:border-accent hover:bg-hover disabled:opacity-60", pending === t.id && "border-accent")}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                    {pending === t.id ? <Spinner /> : <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent" />}
                  </div>
                  <div className="line-clamp-2 text-xs text-muted">{t.description}</div>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted"><Zap className="h-3 w-3 text-[#f97316]" />{t.trigger_label}</span>
                    {t.steps.map((s, i) => <IconTile key={i} type={s} size={18} />)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
