import "server-only";
import { env, requireKey } from "@/lib/env";
import { api } from "./http";
import { db } from "@/lib/supabase/admin";

export const DEFAULT_MODELS = { primary: "x-ai/grok-4", fast: "x-ai/grok-4-fast" };
export async function models(): Promise<{ primary: string; fast: string }> {
  const { data } = await db().from("settings").select("value").eq("key", "ai_models").maybeSingle();
  return { ...DEFAULT_MODELS, ...((data?.value as object) ?? {}) };
}
export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export async function chat(messages: ChatMsg[], opts: { tier?: "primary" | "fast"; json?: boolean; maxTokens?: number; model?: string } = {}) {
  const m = opts.model ?? (await models())[opts.tier ?? "primary"];
  const r = await api<{ choices: { message: { content: string } }[] }>("OpenRouter", "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey("OpenRouter", env.openrouterKey, "OPENROUTER_API_KEY")}`, "HTTP-Referer": env.appUrl, "X-Title": "Newport Smog CRM" },
    json: { model: m, messages, max_tokens: opts.maxTokens ?? 1200, ...(opts.json ? { response_format: { type: "json_object" } } : {}) },
  });
  return r.choices[0]?.message.content?.trim() ?? "";
}
export const BUSINESS_CONTEXT = `You work for Newport Smog & Auto Registration, a STAR certified test-only smog check station and DMV registration service at 375 Bristol St Unit 80, Costa Mesa CA 92626, phone (714) 436-1700. Hours Mon-Fri 8-6, Sat 8-4, closed Sunday. Retail smog: passenger $73 + $8.25 certificate, vans $83, exotics/Sprinter $93, pre-2000 cars $118, old luxury $198; retests $43 ($63 old). Dealers, rentals, repair/exotic shops get partner pricing (usually $50-$81.25) and month-end billing. Test only, no repairs, so no upsell. Be concise, warm, and practical.`;
