"use client";
import * as React from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2, Save, Undo2, ChevronRight, Image as ImageIcon } from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Button, Checkbox, Field, IconButton, Input, Menu, MenuItem, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FORM_FIELDS, LP_IMAGES, SECTION_TYPES, mergeContent, type LandingContent, type Section, type FormField } from "./types";
import { ScaledPreview, DeviceToggle } from "./preview";

type Data = RouterOutputs["landing"]["get"];

function move<T>(arr: T[], i: number, d: -1 | 1) {
  const j = i + d; if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice(); [next[i], next[j]] = [next[j]!, next[i]!]; return next;
}

export function Group({ title, children, defaultOpen = true, right }: { title: string; children: React.ReactNode; defaultOpen?: boolean; right?: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1 px-4 py-2.5">
        <button type="button" onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted hover:text-fg">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />{title}
        </button>
        {right}
      </div>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

export function ImagePicker({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-1.5">
        {LP_IMAGES.map((img) => (
          <button key={img.src} type="button" title={img.label} onClick={() => onChange(img.src)}
            className={cn("aspect-[4/3] overflow-hidden rounded border", value === img.src ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-border-strong")}>
            <img src={img.src} alt={img.label} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <div className="relative">
        <ImageIcon className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-faint" />
        <Input className="pl-7" value={value} placeholder={placeholder ?? "Image URL (https://… or /lp/…)"} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function ListEditor({ items, onChange, placeholder, addLabel = "Add" }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string; addLabel?: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((b, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input value={b} placeholder={placeholder} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
          <IconButton label="Move up" disabled={i === 0} onClick={() => onChange(move(items, i, -1))}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="Move down" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, 1))}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="Remove" onClick={() => onChange(items.filter((_, k) => k !== i))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      ))}
      <Button size="xs" variant="ghost" icon={<Plus className="h-3 w-3" />} onClick={() => onChange([...items, ""])}>{addLabel}</Button>
    </div>
  );
}

function SectionEditor({ s, onChange }: { s: Section; onChange: (s: Section) => void }) {
  const meta = SECTION_TYPES.find((t) => t.id === s.type)!;
  const setItem = (i: number, patch: Partial<Section["items"][number]>) => onChange({ ...s, items: s.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const itemLabels = s.type === "faq" ? ["Question", "Answer"] : s.type === "testimonials" ? ["Name", "Quote"] : ["Title", "Description"];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[140px_1fr] gap-2">
        <Select value={s.type} onChange={(e) => onChange({ ...s, type: e.target.value as Section["type"] })}>
          {SECTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
        <Input value={s.title} placeholder="Section heading" onChange={(e) => onChange({ ...s, title: e.target.value })} />
      </div>
      <Textarea rows={2} value={s.body} placeholder="Intro text (optional)" onChange={(e) => onChange({ ...s, body: e.target.value })} />
      <div className="text-xs text-faint">{meta.hint}</div>
      {s.type !== "cta" && (
        <div className="space-y-2">
          {s.items.map((it, i) => (
            <div key={i} className="rounded border border-border bg-panel p-2">
              <div className="flex items-center gap-1">
                <Input value={it.title} placeholder={itemLabels[0]} onChange={(e) => setItem(i, { title: e.target.value })} />
                <IconButton label="Move up" disabled={i === 0} onClick={() => onChange({ ...s, items: move(s.items, i, -1) })}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                <IconButton label="Move down" disabled={i === s.items.length - 1} onClick={() => onChange({ ...s, items: move(s.items, i, 1) })}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                <IconButton label="Remove item" onClick={() => onChange({ ...s, items: s.items.filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
              </div>
              <Textarea className="mt-1.5" rows={2} value={it.body} placeholder={itemLabels[1]} onChange={(e) => setItem(i, { body: e.target.value })} />
              {s.type === "trust" && (
                <Input className="mt-1.5" value={it.image ?? ""} placeholder="Badge image URL (optional), e.g. /lp/yelp-2026-badge.webp"
                  onChange={(e) => setItem(i, { image: e.target.value || undefined })} />
              )}
            </div>
          ))}
          <Button size="xs" variant="ghost" icon={<Plus className="h-3 w-3" />} onClick={() => onChange({ ...s, items: [...s.items, { title: "", body: "" }] })}>Add item</Button>
        </div>
      )}
    </div>
  );
}

export function ContentTab({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const page = data.page;
  const [draft, setDraft] = React.useState<LandingContent>(page.content);
  const [dirty, setDirty] = React.useState(false);
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [previewId, setPreviewId] = React.useState<string>("");
  const save = trpc.landing.update.useMutation({ onSuccess: () => { setDirty(false); toast.success("Content saved"); } });

  React.useEffect(() => { if (!dirty) setDraft(page.content); }, [page.content, page.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (fn: (c: LandingContent) => LandingContent) => { setDraft((c) => fn(c)); setDirty(true); };
  const hero = <K extends keyof LandingContent["hero"]>(k: K, v: string) => set((c) => ({ ...c, hero: { ...c.hero, [k]: v } }));
  const previewVariant = data.variants.find((v) => v.id === previewId) ?? data.variants.find((v) => v.is_control) ?? null;
  const previewContent = previewVariant && !previewVariant.is_control ? mergeContent(draft, previewVariant.content) : draft;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="scroll-thin flex w-[440px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border bg-panel px-4 py-2">
          <span className="text-xs text-muted">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <div className="ml-auto flex gap-1.5">
            <Button size="xs" variant="ghost" disabled={!dirty} icon={<Undo2 className="h-3 w-3" />} onClick={() => { setDraft(page.content); setDirty(false); }}>Discard</Button>
            <Button size="xs" variant="primary" disabled={!dirty || !canEdit} loading={save.isPending} icon={<Save className="h-3 w-3" />}
              onClick={() => save.mutate({ id: page.id, content: { ...draft, seo: page.content.seo } })}>Save</Button>
          </div>
        </div>
        <fieldset disabled={!canEdit} className="flex-1 overflow-y-auto">
          <Group title="Hero">
            <Field label="Eyebrow"><Input value={draft.hero.eyebrow} onChange={(e) => hero("eyebrow", e.target.value)} /></Field>
            <Field label="Headline"><Textarea rows={2} value={draft.hero.headline} onChange={(e) => hero("headline", e.target.value)} /></Field>
            <Field label="Subheadline"><Textarea rows={3} value={draft.hero.subheadline} onChange={(e) => hero("subheadline", e.target.value)} /></Field>
            <Field label="Button label" hint="Used on the hero button, form heading and sticky mobile bar."><Input value={draft.hero.cta_label} onChange={(e) => hero("cta_label", e.target.value)} /></Field>
            <Field label="Background image"><ImagePicker value={draft.hero.image} onChange={(v) => hero("image", v)} /></Field>
          </Group>
          <Group title={`Bullets (${draft.bullets.length})`}>
            <ListEditor items={draft.bullets} onChange={(b) => set((c) => ({ ...c, bullets: b }))} placeholder="Short benefit" addLabel="Add bullet" />
          </Group>
          <Group title={`Sections (${draft.sections.length})`} right={
            <Menu align="right" width={200} trigger={<Button size="xs" variant="ghost" icon={<Plus className="h-3 w-3" />}>Add</Button>}>
              {(close) => SECTION_TYPES.map((t) => (
                <MenuItem key={t.id} onClick={() => { close(); set((c) => ({ ...c, sections: [...c.sections, { type: t.id, title: t.label, body: "", items: t.id === "cta" ? [] : [{ title: "", body: "" }] }] })); }}>{t.label}</MenuItem>
              ))}
            </Menu>
          }>
            {!draft.sections.length && <div className="text-xs text-faint">No sections. Add services, FAQ, trust badges or a call-to-action banner.</div>}
            {draft.sections.map((s, i) => (
              <div key={i} className="rounded-md border border-border">
                <div className="flex items-center gap-1 border-b border-border bg-subtle px-2 py-1">
                  <span className="flex-1 truncate text-xs font-medium">{i + 1}. {s.title || SECTION_TYPES.find((t) => t.id === s.type)?.label}</span>
                  <IconButton label="Move section up" disabled={i === 0} onClick={() => set((c) => ({ ...c, sections: move(c.sections, i, -1) }))}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                  <IconButton label="Move section down" disabled={i === draft.sections.length - 1} onClick={() => set((c) => ({ ...c, sections: move(c.sections, i, 1) }))}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                  <IconButton label="Remove section" onClick={() => set((c) => ({ ...c, sections: c.sections.filter((_, k) => k !== i) }))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                </div>
                <div className="p-2"><SectionEditor s={s} onChange={(ns) => set((c) => ({ ...c, sections: c.sections.map((x, k) => (k === i ? ns : x)) }))} /></div>
              </div>
            ))}
          </Group>
          <Group title="Form">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted">Fields (phone or email is always required)</div>
              {FORM_FIELDS.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={draft.form.fields.includes(f.id)} onChange={(on) => set((c) => ({
                    ...c, form: { ...c.form, fields: (on ? [...c.form.fields, f.id] : c.form.fields.filter((x) => x !== f.id)).sort((a, b) => FORM_FIELDS.findIndex((x) => x.id === a) - FORM_FIELDS.findIndex((x) => x.id === b)) as FormField[] },
                  }))} />{f.label}
                </label>
              ))}
            </div>
            <Field label="Submit button"><Input value={draft.form.submit_label} onChange={(e) => set((c) => ({ ...c, form: { ...c.form, submit_label: e.target.value } }))} /></Field>
            <Field label="Consent text" hint="Shown under the button. Keep TCPA consent if you text leads."><Textarea rows={3} value={draft.form.consent_text} onChange={(e) => set((c) => ({ ...c, form: { ...c.form, consent_text: e.target.value } }))} /></Field>
          </Group>
          <Group title="Brand & phone" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2">
              {(["primary", "dark"] as const).map((k) => (
                <Field key={k} label={k === "primary" ? "Primary color" : "Dark color"}>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={draft.theme[k]} onChange={(e) => set((c) => ({ ...c, theme: { ...c.theme, [k]: e.target.value } }))} className="h-8 w-9 cursor-pointer rounded border border-border bg-bg p-0.5" />
                    <Input value={draft.theme[k]} onChange={(e) => set((c) => ({ ...c, theme: { ...c.theme, [k]: e.target.value } }))} />
                  </div>
                </Field>
              ))}
            </div>
            <Field label="Click-to-call phone"><Input value={draft.phone} onChange={(e) => set((c) => ({ ...c, phone: e.target.value }))} /></Field>
          </Group>
        </fieldset>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-subtle">
        <div className="flex items-center gap-2 border-b border-border bg-bg px-4 py-2">
          <span className="text-xs text-muted">Preview</span>
          <Select className="w-56" value={previewVariant?.id ?? ""} onChange={(e) => setPreviewId(e.target.value)}>
            {!data.variants.length && <option value="">Base content</option>}
            {data.variants.map((v) => <option key={v.id} value={v.id}>{v.name}{v.is_control ? " (control)" : ""}{v.active ? "" : " · inactive"}</option>)}
          </Select>
          {previewVariant && !previewVariant.is_control && <span className="text-xs text-faint">Variant overrides applied on top of your draft</span>}
          <div className="ml-auto"><DeviceToggle value={device} onChange={setDevice} /></div>
        </div>
        <div className="scroll-thin flex-1 overflow-auto p-4">
          <ScaledPreview content={previewContent} pageId={page.id} variantId={previewVariant?.id ?? null} device={device} thankYou={page.thank_you_message} />
        </div>
      </div>
    </div>
  );
}
