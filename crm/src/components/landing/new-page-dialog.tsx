"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button, Dialog, Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { slugify } from "./types";
import type { TemplateId } from "./templates";

export function NewPageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const templates = trpc.landing.templates.useQuery(undefined, { enabled: open });
  const [tpl, setTpl] = React.useState<TemplateId>("smog");
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const create = trpc.landing.create.useMutation({
    onSuccess: (p) => { toast.success("Page created as a draft"); onClose(); router.push(`/landing-pages/${p.id}`); },
  });
  const chosen = templates.data?.find((t) => t.id === tpl);
  const effectiveSlug = slugTouched ? slug : slugify(name || chosen?.slug || "");

  return (
    <Dialog open={open} onClose={onClose} title="New landing page" width={720}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={create.isPending}
          onClick={() => create.mutate({ template: tpl, name: name.trim() || undefined, slug: slugTouched || name.trim() ? effectiveSlug : undefined })}>Create page</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {(templates.data ?? []).map((t) => (
          <button key={t.id} type="button" onClick={() => setTpl(t.id as TemplateId)}
            className={cn("overflow-hidden rounded-md border text-left transition", tpl === t.id ? "border-accent ring-2 ring-accent/30" : "border-border hover:border-border-strong")}>
            <div className="relative h-24 bg-[#0B1F17]">
              {t.id !== "blank" && <img src={t.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
              <div className="absolute inset-x-3 bottom-2 line-clamp-2 text-xs font-bold text-white">{t.headline}</div>
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="mt-0.5 text-xs text-muted">{t.description}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Page name" hint="Internal name shown in the CRM.">
          <Input value={name} placeholder={chosen?.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="URL slug" hint={`Public URL: /p/${effectiveSlug || "…"}`}>
          <Input value={effectiveSlug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")); }} />
        </Field>
      </div>
    </Dialog>
  );
}
