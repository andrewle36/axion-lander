import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { download } from "@/lib/integrations/pandadoc";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: profile } = await db().from("profiles").select("id, role, active").eq("id", user.id).maybeSingle();
  if (!profile?.active) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: c } = await db().from("contracts").select("id, name, pandadoc_id, deal:deals(owner_id)").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const owner = (c as any).deal?.owner_id as string | undefined;
  if (profile.role === "rep" && owner && owner !== profile.id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!c.pandadoc_id) return NextResponse.json({ error: "This contract was never created in PandaDoc" }, { status: 400 });

  try {
    const res = await download(c.pandadoc_id);
    const filename = `${String(c.name).replace(/[^\w\- ]+/g, "").trim() || "contract"}.pdf`;
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
