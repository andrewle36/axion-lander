import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  if (code) { const sb = await supabaseServer(); await sb.auth.exchangeCodeForSession(code); }
  return NextResponse.redirect(new URL(next, url.origin));
}
