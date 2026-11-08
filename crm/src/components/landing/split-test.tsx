"use client";
import * as React from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trophy, Trash2, Copy, ExternalLink, FlaskConical, Info } from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Badge, Button, Dialog, Field, IconButton, Input, Switch, Table, Td, Th, Textarea, confirmAction, Menu, MenuItem } from "@/components/ui";
import { cn, pct } from "@/lib/utils";
import { cleanOverrides, overrideCount, seriesColor, type VariantOverrides } from "./types";
import { ImagePicker } from "./content-editor";

type Data = RouterOutputs["landing"]["get"];
type Variant = Data["variants"][number];

function WeightCell({ v, canEdit }: { v: Variant; canEdit: boolean }) {
  const [w, setW] = React.useState(v.weight);
  React.useEffect(() => setW(v.weight), [v.weight]);
  const upd = trpc.landing.updateVariant.useMutation();
  const commit = () => { if (w !== v.weight) upd.mutate({ id: v.id, weight: Math.max(0, Math.min(1000, Math.round(w))) }); };
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={0} max={100} value={Math.min(100, w)} disabled={!canEdit || !v.active}
        onChange={(e) => setW(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} className="w-24 accent-[rgb(var(--accent))]" />
      <Input type="number" min={0} max={1000} value={w} disabled={!canEdit} className="h-7 w-16 text-right"
        onChange={(e) => setW(Number(e.target.value) || 0)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
    </div>
  );
}

function EditCopyDialog({ v, base, onClose }: { v: Variant | null; base: Data["page"]["content"]; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [o, setO] = React.useState<VariantOverrides>({});
  const [bullets, setBullets] = React.useState("");
  React.useEffect(() => {
    if (!v) return;
    setName(v.name); setO(cleanOverrides(v.content)); setBullets((cleanOverrides(v.content).bullets ?? []).join("\n"));
  }, [v]);
  const upd = trpc.landing.updateVariant.useMutation({ onSuccess: () => { toast.success("Variant saved"); onClose(); } });
  if (!v) return null;
  const hero = (k: keyof NonNullable<VariantOverrides["hero"]>, val: string) => setO((x) => ({ ...x, hero: { ...x.hero, [k]: val } }));
  const saveIt = () => upd.mutate({ id: v.id, name: name.trim() || v.name, content: { ...o, bullets: bullets.split("\n").map((b) => b.trim()).filter(Boolean) } });
  return (
    <Dialog open onClose={onClose} title={`Edit copy · ${v.name}`} width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="ghost" onClick={() => { setO({}); setBullets(""); }}>Clear all overrides</Button>
        <Button variant="primary" loading={upd.isPending} onClick={saveIt}>Save variant</Button></>}>
      <div className="mb-3 flex items-start gap-2 rounded border border-border bg-subtle p-2.5 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Leave a field empty to use the control's copy (shown as the placeholder). Sections and the rest of the page are shared by every variant.
      </div>
      <div className="space-y-3">
        <Field label="Variant name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Eyebrow"><Input value={o.hero?.eyebrow ?? ""} placeholder={base.hero.eyebrow} onChange={(e) => hero("eyebrow", e.target.value)} /></Field>
        <Field label="Headline"><Textarea rows={2} value={o.hero?.headline ?? ""} placeholder={base.hero.headline} onChange={(e) => hero("headline", e.target.value)} /></Field>
        <Field label="Subheadline"><Textarea rows={3} value={o.hero?.subheadline ?? ""} placeholder={base.hero.subheadline} onChange={(e) => hero("subheadline", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Button label"><Input value={o.hero?.cta_label ?? ""} placeholder={base.hero.cta_label} onChange={(e) => hero("cta_label", e.target.value)} /></Field>
          <Field label="Form submit label"><Input value={o.form?.submit_label ?? ""} placeholder={base.form.submit_label} onChange={(e) => setO((x) => ({ ...x, form: { ...x.form, submit_label: e.target.value } }))} /></Field>
        </div>
        <Field label="Bullets (one per line)" hint="Replaces all control bullets when filled.">
          <Textarea rows={5} value={bullets} placeholder={base.bullets.join("\n")} onChange={(e) => setBullets(e.target.value)} />
        </Field>
        <Field label="Hero image"><ImagePicker value={o.hero?.image ?? ""} placeholder={`Control: ${base.hero.image}`} onChange={(val) => hero("image", val)} /></Field>
        <Field label="Primary color" hint={`Control: ${base.theme.primary}`}>
          <Input value={o.theme?.primary ?? ""} placeholder={base.theme.primary} onChange={(e) => setO((x) => ({ ...x, theme: { ...x.theme, primary: e.target.value } }))} />
        </Field>
      </div>
    </Dialog>
  );
}

export function SplitTestTab({ data, canEdit, onEditControl }: { data: Data; canEdit: boolean; onEditControl: () => void }) {
  const [editing, setEditing] = React.useState<Variant | null>(null);
  const create = trpc.landing.createVariant.useMutation({ onSuccess: (v: any) => toast.success(`${v.name} added`) });
  const upd = trpc.landing.updateVariant.useMutation();
  const del = trpc.landing.deleteVariant.useMutation({ onSuccess: () => toast.success("Variant deleted") });
  const win = trpc.landing.declareWinner.useMutation({ onSuccess: () => toast.success("Winner declared: it now gets 100% of traffic") });
  const vs = data.variants;
  const active = vs.filter((v) => v.active);
  const leader = vs.filter((v) => !v.is_control && v.significant && (v.uplift ?? 0) > 0).sort((a, b) => b.conversion - a.conversion)[0];

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <FlaskConical className="h-4 w-4 text-muted" />
        <div className="text-sm">
          {active.length > 1 ? <>Testing <b>{active.length}</b> variants. Each visitor sticks to one variant (cookie) so counts are unique daily visitors.</>
            : <>Only one variant is live. Add a variant to start an A/B/n test of your copy.</>}
        </div>
        {leader && <Badge tone="green"><Trophy className="h-3 w-3" />{leader.name} is beating control at {leader.confidence?.toFixed(0)}% confidence</Badge>}
        {canEdit && <Button className="ml-auto" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} loading={create.isPending} onClick={() => create.mutate({ page_id: data.page.id })}>Add variant</Button>}
      </div>
      <Table>
        <thead><tr>
          <Th>Variant</Th><Th>Active</Th><Th>Weight</Th><Th className="text-right">Traffic</Th><Th className="text-right">Views</Th><Th className="text-right">Submits</Th>
          <Th className="text-right">Conv. rate</Th><Th className="text-right">Uplift</Th><Th className="text-right">Confidence</Th><Th>Overrides</Th><Th className="w-px" />
        </tr></thead>
        <tbody>
          {vs.map((v, i) => (
            <tr key={v.id} className={cn(!v.active && "opacity-60")}>
              <Td>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: seriesColor(i) }} />
                  <span className="font-medium">{v.name}</span>{v.is_control && <Badge tone="blue">control</Badge>}
                </div>
                <div className="ml-[18px] max-w-[260px] truncate text-xs text-faint">{v.content.hero?.headline ?? data.page.content.hero.headline}</div>
              </Td>
              <Td><Switch checked={v.active} disabled={!canEdit} onChange={(on) => upd.mutate({ id: v.id, active: on })} /></Td>
              <Td><WeightCell v={v} canEdit={canEdit} /></Td>
              <Td className="text-right tabular-nums">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full" style={{ width: `${v.traffic_share * 100}%`, background: seriesColor(i) }} /></div>
                  {pct(v.traffic_share, 0)}
                </div>
              </Td>
              <Td className="text-right tabular-nums">{v.views.toLocaleString()}</Td>
              <Td className="text-right tabular-nums">{v.submits.toLocaleString()}</Td>
              <Td className="text-right tabular-nums font-medium">{v.views ? pct(v.conversion) : "–"}</Td>
              <Td className={cn("text-right tabular-nums", (v.uplift ?? 0) > 0 ? "text-success" : (v.uplift ?? 0) < 0 ? "text-danger" : "")}>
                {v.is_control ? <span className="text-faint">baseline</span> : v.uplift == null ? "–" : `${v.uplift > 0 ? "+" : ""}${(v.uplift * 100).toFixed(1)}%`}
              </Td>
              <Td className="text-right tabular-nums">
                {v.is_control || v.confidence == null ? <span className="text-faint">–</span>
                  : <Badge tone={v.confidence >= 95 ? "green" : v.confidence >= 80 ? "amber" : "gray"}>{v.confidence.toFixed(0)}%</Badge>}
              </Td>
              <Td className="text-xs text-muted">{v.is_control ? "Base content" : `${overrideCount(v.content)} field${overrideCount(v.content) === 1 ? "" : "s"}`}</Td>
              <Td>
                <div className="flex items-center gap-1">
                  <Button size="xs" variant="outline" icon={<Pencil className="h-3 w-3" />} disabled={!canEdit} onClick={() => (v.is_control ? onEditControl() : setEditing(v))}>Edit copy</Button>
                  <Button size="xs" variant="outline" icon={<Trophy className="h-3 w-3" />} disabled={!canEdit}
                    onClick={() => { if (confirmAction(`Declare “${v.name}” the winner? It gets 100% of traffic and every other variant is paused.`)) win.mutate({ id: v.id }); }}>Declare winner</Button>
                  <Menu align="right" width={190} trigger={<IconButton label="More"><span className="text-lg leading-none">⋮</span></IconButton>}>
                    {(close) => <>
                      <MenuItem icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => { close(); window.open(`/p/${data.page.slug}?v=${v.id}`, "_blank"); }}>Open this variant</MenuItem>
                      {canEdit && <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => { close(); create.mutate({ page_id: data.page.id, from_id: v.id, name: `${v.name} copy` }); }}>Duplicate</MenuItem>}
                      {canEdit && !v.is_control && <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { close(); if (confirmAction(`Delete ${v.name} and its stats?`)) del.mutate({ id: v.id }); }}>Delete</MenuItem>}
                    </>}
                  </Menu>
                </div>
              </Td>
            </tr>
          ))}
          {!vs.length && <tr><td colSpan={11} className="h-16 border-b border-border text-center text-sm text-muted">No variants yet. Click “Add variant” to create the control and a challenger.</td></tr>}
        </tbody>
      </Table>
      {(data.unattributed.views > 0 || data.unattributed.submits > 0) && (
        <div className="px-4 py-2 text-xs text-faint">Plus {data.unattributed.views} views and {data.unattributed.submits} submits not attributed to a variant (embedded forms or pages viewed before variants existed).</div>
      )}
      <div className="m-4 rounded-md border border-border bg-panel p-3 text-xs leading-relaxed text-muted">
        <b className="text-fg">How to read this.</b> Traffic share = weight ÷ total weight of active variants. Conversion = form submits ÷ unique daily views.
        Confidence comes from a two-proportion z-test against the control (1 − p-value). Wait for ≥95% and at least ~100 views per variant before declaring a winner.
      </div>
      <EditCopyDialog v={editing} base={data.page.content} onClose={() => setEditing(null)} />
    </div>
  );
}
