import type { Metadata } from "next";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { LandingRenderer } from "@/components/landing/renderer";
import { BUSINESS, mergeContent, normalizeContent } from "@/components/landing/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const loadPage = cache(async (slug: string) => {
  const { data: page } = await db().from("landing_pages").select("*").eq("slug", slug).maybeSingle();
  if (!page) return null;
  const { data: variants } = await db().from("landing_variants").select("*").eq("page_id", page.id).order("is_control", { ascending: false }).order("created_at");
  return { page: page as any, variants: (variants ?? []) as any[] };
});

async function isStaff() {
  try {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data } = await db().from("profiles").select("active").eq("id", user.id).maybeSingle();
    return !!data?.active;
  } catch { return false; }
}

async function bookingUrl() {
  const { data } = await db().from("settings").select("value").eq("key", "booking_url").maybeSingle();
  const v = data?.value as unknown;
  const url = typeof v === "string" ? v : (v as { url?: string } | null)?.url;
  return url && /^https?:\/\//.test(url) ? url : BUSINESS.bookingFallback;
}

function pickWeighted<T extends { weight: number }>(list: T[]): T | null {
  if (!list.length) return null;
  const total = list.reduce((s, v) => s + Math.max(0, v.weight), 0);
  if (total <= 0) return list[0]!;
  let r = Math.random() * total;
  for (const v of list) { r -= Math.max(0, v.weight); if (r <= 0) return v; }
  return list[list.length - 1]!;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await loadPage(slug);
  if (!d) return { title: "Page not found" };
  const c = normalizeContent(d.page.content);
  const title = c.seo.title || d.page.name;
  const description = c.seo.description || c.hero.subheadline || undefined;
  return {
    title, description,
    robots: d.page.status === "published" ? undefined : { index: false, follow: false },
    openGraph: { title, description, images: c.hero.image ? [c.hero.image] : undefined, type: "website" },
  };
}

export default async function PublicLandingPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const d = await loadPage(slug);
  if (!d) notFound();
  const { page, variants } = d;
  const published = page.status === "published";
  const staff = published ? false : await isStaff();
  if (!published && !staff) notFound();

  // Variant: forced (?v=id, for QA, untracked) → sticky cookie → weighted random among active.
  const active = variants.filter((v) => v.active);
  const forcedId = typeof sp.v === "string" ? sp.v : null;
  const forced = forcedId ? variants.find((v) => v.id === forcedId) ?? null : null;
  const store = await cookies();
  const sticky = store.get(`lp_v_${page.id}`)?.value;
  const variant = forced ?? active.find((v) => v.id === sticky) ?? pickWeighted(active) ?? variants.find((v) => v.is_control) ?? null;

  const content = mergeContent(normalizeContent(page.content), variant?.content);
  const track = published && !forced;

  return (
    <LandingRenderer
      content={content} pageId={page.id} variantId={variant?.id ?? null} mode="live" layout="auto"
      thankYou={page.thank_you_message} redirectUrl={page.redirect_url} bookingUrl={await bookingUrl()}
      track={track} assignCookie={track}
      banner={!published || forced ? (
        <div className="bg-[#fff4d6] px-4 py-2 text-center text-[13px] font-semibold text-[#7a5300]">
          {!published ? `Preview: this page is ${page.status} and only visible to signed-in staff.` : "Preview of a forced variant: views are not tracked."}
          {variant ? ` Showing “${variant.name}”.` : ""} Form submissions create real leads.
        </div>
      ) : undefined}
    />
  );
}
