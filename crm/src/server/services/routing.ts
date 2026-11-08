import "server-only";
import { db } from "@/lib/supabase/admin";

/** Pick a rep for a landing page according to its routing mode. Returns profile id or null. */
export async function pickRep(pageId: string | null): Promise<string | null> {
  const sb = db();
  let page: any = null;
  if (pageId) page = (await sb.from("landing_pages").select("*").eq("id", pageId).maybeSingle()).data;
  if (!page) {
    const { data } = await sb.from("settings").select("value").eq("key", "default_routing").maybeSingle();
    page = { id: null, routing_mode: "round_robin", routing_reps: (data?.value as any)?.reps ?? [], routing_weights: {}, rr_pointer: (data?.value as any)?.pointer ?? 0 };
  }
  const { data: reps } = await sb.from("profiles").select("id, rr_paused, active").eq("active", true);
  const eligible = (page.routing_reps?.length ? page.routing_reps : (reps ?? []).map((r: any) => r.id))
    .filter((id: string) => (reps ?? []).some((r: any) => r.id === id && !r.rr_paused));
  if (!eligible.length || page.routing_mode === "none") return null;
  let chosen: string;
  switch (page.routing_mode) {
    case "specific": chosen = eligible[0]; break;
    case "weighted": {
      const w = eligible.map((id: string) => Math.max(0, Number(page.routing_weights?.[id] ?? 1)));
      const total = w.reduce((a: number, b: number) => a + b, 0) || 1;
      let r = Math.random() * total; chosen = eligible[eligible.length - 1];
      for (let i = 0; i < eligible.length; i++) { r -= w[i]; if (r <= 0) { chosen = eligible[i]; break; } }
      break;
    }
    case "least_loaded": {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const counts = await Promise.all(eligible.map(async (id: string) =>
        (await sb.from("contacts").select("id", { count: "exact", head: true }).eq("owner_id", id).gte("created_at", since)).count ?? 0));
      chosen = eligible[counts.indexOf(Math.min(...counts))];
      break;
    }
    default: {
      const ptr = Number(page.rr_pointer ?? 0);
      chosen = eligible[ptr % eligible.length];
      if (page.id) await sb.from("landing_pages").update({ rr_pointer: ptr + 1 }).eq("id", page.id);
      else await sb.from("settings").upsert({ key: "default_routing", value: { reps: page.routing_reps, pointer: ptr + 1 } });
    }
  }
  return chosen;
}
