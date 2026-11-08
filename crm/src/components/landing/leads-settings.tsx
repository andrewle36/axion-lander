"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Copy, Save, Check } from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Avatar, Badge, Button, Card, Empty, Field, Input, Loading, StatusBadge, Table, Td, Th, Textarea } from "@/components/ui";
import { cn, fmtPhone, fullName, shortDate } from "@/lib/utils";
import { SLUG_RE, slugify } from "./types";

type Data = RouterOutputs["landing"]["get"];

export function LeadsTab({ pageId }: { pageId: string }) {
  const router = useRouter();
  const q = trpc.landing.leads.useQuery({ pageId });
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (!rows.length) return <Empty icon={<Users className="h-8 w-8" />} title="No leads yet" body="Form submissions from this page (and embeds that post its page_id) appear here, assigned by your routing rules." />;
  return (
    <div className="flex-1 overflow-auto">
      <Table>
        <thead><tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Status</Th><Th>Variant</Th><Th>Assigned to</Th><Th>UTM source</Th><Th>Submitted</Th></tr></thead>
        <tbody>
          {rows.map((c: any) => (
            <tr key={c.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/contacts/${c.id}`)}>
              <Td className="font-medium">{fullName(c)}</Td>
              <Td>{fmtPhone(c.phone)}</Td>
              <Td className="text-muted">{c.email}</Td>
              <Td><StatusBadge status={c.status} /></Td>
              <Td>{c.variant?.name ? <Badge>{c.variant.name}</Badge> : <span className="text-faint">–</span>}</Td>
              <Td>{c.owner ? <span className="inline-flex items-center gap-1.5"><Avatar name={c.owner.full_name} color={c.owner.color} size={18} />{c.owner.full_name}</span> : <span className="text-faint">Unassigned</span>}</Td>
              <Td className="text-muted">{c.utm?.utm_source ?? ""}{c.utm?.utm_campaign ? ` / ${c.utm.utm_campaign}` : ""}</Td>
              <Td className="text-muted">{shortDate(c.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function embedSnippet(origin: string, pageId: string, submit: string) {
  return `<!-- Newport Smog CRM lead form -->
<form id="ns-lead-form" action="${origin}/api/public/lead" method="POST">
  <input type="hidden" name="page_id" value="${pageId}">
  <input type="hidden" name="source" value="website">
  <input name="name" placeholder="Full name" autocomplete="name" required>
  <input name="phone" type="tel" placeholder="Mobile phone" autocomplete="tel" required>
  <input name="email" type="email" placeholder="Email" autocomplete="email">
  <input name="vehicle" placeholder="Vehicle (year, make, model)">
  <textarea name="message" placeholder="How can we help?"></textarea>
  <!-- spam trap: leave hidden -->
  <input name="hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">
  <button type="submit">${submit.replace(/</g, "&lt;")}</button>
  <p id="ns-lead-msg" hidden></p>
</form>
<script>
(function () {
  var f = document.getElementById("ns-lead-form"), msg = document.getElementById("ns-lead-msg"), t0 = Date.now();
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
    new URLSearchParams(location.search).forEach(function (v, k) { if (/^utm_|^gclid$|^fbclid$/.test(k)) d[k] = v; });
    d.source_url = location.href; d.referrer = document.referrer; d.elapsed_ms = Date.now() - t0;
    var b = f.querySelector("button"); b.disabled = true;
    fetch(f.action, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(d) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || "Please call (714) 436-1700.");
        if (j.redirect_url) { location.href = j.redirect_url; return; }
        f.reset(); msg.hidden = false; msg.textContent = j.message || "Thanks! We'll reach out shortly.";
      })
      .catch(function (err) { msg.hidden = false; msg.textContent = err.message; })
      .finally(function () { b.disabled = false; });
  });
})();
</script>`;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Button size="xs" variant="outline" icon={done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); toast.success("Copied"); setTimeout(() => setDone(false), 1500); } catch { toast.error("Clipboard blocked: select the text and copy manually."); } }}>
      {done ? "Copied" : label}
    </Button>
  );
}

export function SettingsTab({ data, canEdit }: { data: Data; canEdit: boolean }) {
  const page = data.page;
  const init = React.useCallback(() => ({
    name: page.name as string, slug: page.slug as string, seoTitle: page.content.seo.title, seoDesc: page.content.seo.description,
    after: (page.redirect_url ? "redirect" : "message") as "message" | "redirect",
    thank: (page.thank_you_message ?? "") as string, redirect: (page.redirect_url ?? "") as string,
  }), [page]);
  const [f, setF] = React.useState(init);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => { if (!dirty) setF(init()); }, [init]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<ReturnType<typeof init>>) => { setF((x) => ({ ...x, ...patch })); setDirty(true); };
  const save = trpc.landing.update.useMutation({ onSuccess: () => { setDirty(false); toast.success("Settings saved"); } });
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);
  const slugOk = SLUG_RE.test(f.slug);
  const snippet = embedSnippet(origin, page.id, page.content.form.submit_label);
  const publicUrl = `${origin}/p/${page.slug}`;

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
        <fieldset disabled={!canEdit} className="space-y-4">
          <Card title="Page" action={canEdit && <Button size="xs" variant="primary" disabled={!dirty || !slugOk} loading={save.isPending} icon={<Save className="h-3 w-3" />}
            onClick={() => save.mutate({
              id: page.id, name: f.name.trim() || page.name, slug: f.slug,
              content: { ...page.content, seo: { title: f.seoTitle, description: f.seoDesc } },
              thank_you_message: f.thank || null, redirect_url: f.after === "redirect" ? f.redirect.trim() || null : null,
            })}>Save settings</Button>}>
            <div className="space-y-3 p-4">
              <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="URL slug" hint={slugOk ? `${origin}/p/${f.slug}` : "Lowercase letters, numbers and single dashes only."}>
                <div className="flex gap-1.5">
                  <Input value={f.slug} className={cn(!slugOk && "border-danger")} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
                  <Button size="sm" variant="outline" onClick={() => set({ slug: slugify(f.slug) })}>Clean</Button>
                </div>
              </Field>
              {f.slug !== page.slug && page.status === "published" && <div className="rounded bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">Changing the slug breaks links to /p/{page.slug} that are already shared.</div>}
            </div>
          </Card>
          <Card title="SEO">
            <div className="space-y-3 p-4">
              <Field label="Title" hint={`${f.seoTitle.length}/60 characters. Falls back to the page name.`}><Input value={f.seoTitle} placeholder={page.name} onChange={(e) => set({ seoTitle: e.target.value })} /></Field>
              <Field label="Meta description" hint={`${f.seoDesc.length}/160 characters.`}><Textarea rows={3} value={f.seoDesc} placeholder={page.content.hero.subheadline} onChange={(e) => set({ seoDesc: e.target.value })} /></Field>
              <div className="rounded border border-border p-3">
                <div className="truncate text-xs text-success">{publicUrl}</div>
                <div className="truncate text-[15px] text-blue-600 dark:text-blue-400">{f.seoTitle || f.name}</div>
                <div className="line-clamp-2 text-xs text-muted">{f.seoDesc || page.content.hero.subheadline}</div>
              </div>
            </div>
          </Card>
          <Card title="After submit">
            <div className="space-y-3 p-4">
              <div className="flex gap-4 text-sm">
                {(["message", "redirect"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5">
                    <input type="radio" name="after" checked={f.after === k} onChange={() => set({ after: k })} className="accent-[rgb(var(--accent))]" />
                    {k === "message" ? "Show a thank-you message" : "Redirect to a URL"}
                  </label>
                ))}
              </div>
              {f.after === "message"
                ? <Field label="Thank-you message"><Textarea rows={3} value={f.thank} placeholder="Thanks! We'll reach out shortly." onChange={(e) => set({ thank: e.target.value })} /></Field>
                : <Field label="Redirect URL" hint="e.g. https://newportsmog.com/thanks or /book"><Input value={f.redirect} placeholder="https://" onChange={(e) => set({ redirect: e.target.value })} /></Field>}
            </div>
          </Card>
        </fieldset>
        <div className="space-y-4">
          <Card title="Share" action={<CopyButton text={publicUrl} label="Copy link" />}>
            <div className="space-y-2 p-4 text-sm">
              <div className="break-all font-mono text-xs">{publicUrl}</div>
              <div className="text-xs text-muted">Add UTM tags for ad campaigns, e.g. <span className="font-mono">?utm_source=google&utm_campaign=star</span>. They're saved on each lead.</div>
            </div>
          </Card>
          <Card title="Embed on newportsmog.com" action={<CopyButton text={snippet} label="Copy code" />}>
            <div className="space-y-2 p-4">
              <div className="text-xs text-muted">
                Paste this HTML into any site. It posts to <span className="font-mono">/api/public/lead</span> (CORS enabled), credits this page in analytics, and assigns the lead using this page's routing.
                Without JavaScript it still works as a normal form post.
              </div>
              <pre className="scroll-thin max-h-[420px] overflow-auto rounded border border-border bg-subtle p-3 font-mono text-[11px] leading-relaxed">{snippet}</pre>
              <div className="text-xs text-muted">Endpoint fields: name or first_name/last_name, phone, email, vehicle or vehicle_year/make/model, message, page_id, variant_id, visitor_id, utm_*, source, hp (honeypot). Phone or email is required.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
