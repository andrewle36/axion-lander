import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let _admin: SupabaseClient | null = null;
/** Service-role client. Server only. Bypasses RLS: callers must authorize. */
export function db(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env.supabaseUrl, env.supabaseService, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}
