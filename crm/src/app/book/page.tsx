import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const FALLBACK = "https://checkin.newportsmog.com/s/newport/book";

/** Public short link: /book → the Calendly / check-in scheduling link from settings.booking_url. */
export default async function BookRedirect() {
  let url = FALLBACK;
  try {
    const { data } = await db().from("settings").select("value").eq("key", "booking_url").maybeSingle();
    const v = data?.value as unknown;
    const candidate = typeof v === "string" ? v : (v as { url?: string } | null)?.url;
    if (candidate && /^https?:\/\//.test(candidate)) url = candidate;
  } catch { /* fall back */ }
  redirect(url);
}
