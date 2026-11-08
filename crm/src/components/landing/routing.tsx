"use client";
import * as React from "react";
import { toast } from "sonner";
import { Shuffle, Scale, Gauge, UserCheck, Ban, ArrowRight, RotateCcw, Save } from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Card, Checkbox, Input, Loading, Switch, confirmAction } from "@/components/ui";
import { cn, pct } from "@/lib/utils";
import { ROUTING_MODES, type RoutingMode } from "./types";

type Data = RouterOutputs["landing"]["get"];
const ICONS: Record<RoutingMode, React.ReactNode> = {
  round_robin: <Shuffle className="h-4 w-4" />, weighted: <Scale className="h-4 w-4" />, least_loaded: <Gauge className="h-4 w-4" />,
  specific: <UserCheck className="h-4 w-4" />, none: <Ban className="h-4 w-4" />,
};

export function RoutingTab({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const page = data.page;
  const team = trpc.team.list.useQuery();
  const preview = trpc.landing.routingPreview.useQuery({ id: page.id });
  const [mode, setMode] = React.useState<RoutingMode>(page.routing_mode);
  const [reps, setReps] = React.useState<string[]>(page.routing_reps ?? []);
  const [weights, setWeights] = React.useState<Record<string, number>>(page.routing_weights ?? {});
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (dirty) return;
    setMode(page.routing_mode); setReps(page.routing_reps ?? []); setWeights(page.routing_weights ?? {});
  }, [page.routing_mode, page.routing_reps, page.routing_weights]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = trpc.landing.updateRouting.useMutation({ onSuccess: () => { setDirty(false); toast.success("Routing saved"); } });
  const resetPtr = trpc.landing.resetRotation.useMutation({ onSuccess: () => toast.success("Rotation restarted from the first rep") });
  const pause = trpc.team.update.useMutation({ onSuccess: (p: any) => toast.success(`${p.full_name ?? p.email} ${p.rr_paused ? "paused" : "back in rotation"}`) });

  if (team.isLoading) return <Loading />;
  const members = ((team.data ?? []) as any[]).filter((m) => m.active);
  const byId = new Map(members.map((m) => [m.id, m]));
  const touch = () => setDirty(true);
  const toggle = (id: string, on: boolean) => { touch(); setReps((r) => (mode === "specific" ? (on ? [id] : []) : on ? [...r, id] : r.filter((x) => x !== id))); };
  const selected = reps.length ? reps.filter((id) => byId.has(id)) : members.map((m) => m.id);
  const totalW = selected.filter((id) => !byId.get(id)?.rr_paused).reduce((s, id) => s + (weights[id] ?? 1), 0) || 1;
  const p = preview.data;
  const name = (id: string | null | undefined) => (id ? byId.get(id)?.full_name ?? byId.get(id)?.email ?? "Former rep" : "Unassigned");

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Lead distribution" action={canEdit && (
            <Button size="xs" variant="primary" disabled={!dirty} loading={save.isPending} icon={<Save className="h-3 w-3" />}
              onClick={() => save.mutate({ id: page.id, mode, reps: mode === "specific" ? reps.slice(0, 1) : reps, weights })}>Save routing</Button>
          )}>
            <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {ROUTING_MODES.map((m) => (
                <button key={m.id} type="button" disabled={!canEdit} onClick={() => { setMode(m.id); if (m.id === "specific") setReps((r) => r.slice(0, 1)); touch(); }}
                  className={cn("rounded-md border p-3 text-left transition disabled:cursor-not-allowed", mode === m.id ? "border-accent bg-accent-soft ring-1 ring-accent/30" : "border-border hover:border-border-strong")}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", mode === m.id ? "border-accent" : "border-border-strong")}>
                      {mode === m.id && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </span>
                    <span className="text-muted">{ICONS[m.id]}</span>{m.label}
                  </div>
                  <div className="mt-1 text-xs text-muted">{m.body}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card title={mode === "specific" ? "Rep" : "Reps in rotation"} action={<span className="text-xs text-faint">{reps.length ? `${reps.length} selected` : "None selected = every active team member"}</span>}>
            {!members.length ? <div className="p-4 text-sm text-muted">No active team members yet. Invite reps from Team.</div> : (
              <div className="divide-y divide-border">
                {members.map((m) => {
                  const inPool = reps.includes(m.id);
                  const effective = reps.length ? inPool : true;
                  const share = mode === "weighted" && effective && !m.rr_paused ? (weights[m.id] ?? 1) / totalW : null;
                  return (
                    <div key={m.id} className={cn("flex items-center gap-3 px-4 py-2.5", m.rr_paused && "opacity-70")}>
                      {mode === "specific"
                        ? <input type="radio" name="specific-rep" checked={inPool} disabled={!canEdit} onChange={() => toggle(m.id, true)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
                        : <Checkbox checked={inPool} onChange={(on) => canEdit && toggle(m.id, on)} />}
                      <Avatar name={m.full_name ?? m.email} color={m.color} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.full_name ?? m.email}</div>
                        <div className="text-xs text-faint">{m.role} · {p?.load7?.[m.id] ?? 0} new contacts in 7d · {p?.distribution?.[m.id] ?? 0} from this page (30d)</div>
                      </div>
                      {mode === "weighted" && (
                        <div className="flex items-center gap-2">
                          <Input type="number" min={0} max={100} className="h-7 w-16 text-right" disabled={!canEdit || !effective}
                            value={weights[m.id] ?? 1} onChange={(e) => { touch(); setWeights((w) => ({ ...w, [m.id]: Math.max(0, Number(e.target.value) || 0) })); }} />
                          <span className="w-12 text-right text-xs tabular-nums text-muted">{share == null ? "–" : pct(share, 0)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted">
                        {m.rr_paused ? <Badge tone="amber">paused</Badge> : <span>in rotation</span>}
                        <Switch checked={!m.rr_paused} disabled={pause.isPending} onChange={(on) => pause.mutate({ id: m.id, rr_paused: !on })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-border px-4 py-2 text-xs text-faint">Pausing a rep removes them from every page's rotation (vacation, sick day) without losing their settings.</div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Next lead goes to" action={dirty && <Badge tone="amber">save to update</Badge>}>
            <div className="p-4">
              {!p ? <Loading /> : p.mode === "none" ? <div className="text-sm text-muted">Leads stay unassigned.</div>
                : !p.eligible.length ? <div className="text-sm text-danger">No eligible reps: every selected rep is paused or inactive, so leads will be unassigned.</div>
                : p.mode === "weighted" ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted">Random, weighted. Chance for the next lead:</div>
                    {p.eligible.map((id) => (
                      <div key={id} className="flex items-center gap-2 text-sm">
                        <Avatar name={name(id)} color={byId.get(id)?.color} size={20} /><span className="flex-1 truncate">{name(id)}</span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle"><div className="h-full bg-accent" style={{ width: `${(p.probabilities[id] ?? 0) * 100}%` }} /></div>
                        <span className="w-10 text-right tabular-nums text-muted">{pct(p.probabilities[id] ?? 0, 0)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2">
                      <Avatar name={name(p.next)} color={byId.get(p.next ?? "")?.color} size={32} />
                      <div><div className="text-base font-semibold">{name(p.next)}</div>
                        <div className="text-xs text-muted">{p.mode === "least_loaded" ? `Fewest new contacts this week (${p.load7[p.next ?? ""] ?? 0})` : p.mode === "specific" ? "Gets every lead" : `Rotation position ${(p.pointer % Math.max(1, p.eligible.length)) + 1} of ${p.eligible.length}`}</div></div>
                    </div>
                    {p.mode === "round_robin" && p.upcoming.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1 text-xs text-muted">
                        {p.upcoming.map((id, i) => <React.Fragment key={i}>{i > 0 && <ArrowRight className="h-3 w-3 text-faint" />}<span className={cn("rounded bg-subtle px-1.5 py-0.5", i === 0 && "bg-accent-soft font-medium text-fg")}>{name(id).split(" ")[0]}</span></React.Fragment>)}
                      </div>
                    )}
                    {p.mode === "round_robin" && canEdit && (
                      <Button className="mt-3" size="xs" variant="ghost" icon={<RotateCcw className="h-3 w-3" />}
                        onClick={() => { if (confirmAction("Restart the rotation from the first rep?")) resetPtr.mutate({ id: page.id }); }}>Restart rotation</Button>
                    )}
                  </div>
                )}
              {p?.pool_is_everyone && p.mode !== "none" && <div className="mt-3 text-xs text-faint">No reps selected, so every active, unpaused team member is in the pool.</div>}
            </div>
          </Card>
          <Card title="Assigned from this page (30 days)">
            <div className="space-y-1.5 p-4">
              {!p || !Object.keys(p.distribution).length ? <div className="text-sm text-muted">No leads yet.</div> :
                Object.entries(p.distribution).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
                  const total = Object.values(p.distribution).reduce((a, b) => a + b, 0);
                  return (
                    <div key={id} className="flex items-center gap-2 text-sm">
                      <Avatar name={name(id === "unassigned" ? null : id)} color={byId.get(id)?.color} size={20} /><span className="flex-1 truncate">{name(id === "unassigned" ? null : id)}</span>
                      <span className="tabular-nums">{n}</span><span className="w-10 text-right text-xs tabular-nums text-faint">{pct(n / total, 0)}</span>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
