"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Button, Input, Field } from "@/components/ui";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const pending = params.get("pending");
  const [mode, setMode] = useState<"password" | "magic" | "signup">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const sb = supabaseBrowser();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      if (mode === "magic") {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: true } });
        if (error) throw error; setSent(true);
      } else if (mode === "signup") {
        const { error, data } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
        if (error) throw error;
        if (data.session) router.push(params.get("next") ?? "/dashboard"); else setSent(true);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(params.get("next") ?? "/dashboard"); router.refresh();
      }
    } catch (err) { toast.error((err as Error).message); } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-card">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-[#0E6B43] text-xs font-bold text-white">NS</span>
          <div><div className="text-sm font-semibold">Newport Smog CRM</div><div className="text-xs text-muted">Sign in to your workspace</div></div>
        </div>
        {pending && <div className="mb-4 rounded bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">Your account exists but hasn't been approved yet. Ask the owner to invite you from the Team page.</div>}
        {sent ? (
          <div className="rounded bg-accent-soft p-3 text-sm">Check <b>{email}</b> for a sign-in link.</div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label="Email"><Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@newportsmog.com" /></Field>
            {mode !== "magic" && <Field label="Password"><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
            <Button variant="primary" size="md" className="w-full" loading={loading} type="submit">
              {mode === "magic" ? "Email me a sign-in link" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        )}
        <div className="mt-4 flex justify-between text-xs text-muted">
          <button className="hover:text-fg" onClick={() => { setMode(mode === "magic" ? "password" : "magic"); setSent(false); }}>{mode === "magic" ? "Use password" : "Use magic link"}</button>
          <button className="hover:text-fg" onClick={() => { setMode(mode === "signup" ? "password" : "signup"); setSent(false); }}>{mode === "signup" ? "Have an account? Sign in" : "First time? Create account"}</button>
        </div>
      </div>
    </div>
  );
}
export default function LoginPage() { return <Suspense><LoginInner /></Suspense>; }
