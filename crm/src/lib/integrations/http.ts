import "server-only";
import { IntegrationError } from "@/lib/env";
export async function api<T = any>(provider: string, url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(headers as Record<string, string>) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const text = await res.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* text */ }
  if (!res.ok) {
    const msg = typeof body === "object" && body
      ? body.errors?.[0]?.detail ?? body.errors?.[0]?.title ?? body.error?.message ?? body.message ?? body.detail ?? body.title ?? JSON.stringify(body).slice(0, 300)
      : String(text).slice(0, 300);
    throw new IntegrationError(provider, `${res.status} ${msg}`);
  }
  return body as T;
}
