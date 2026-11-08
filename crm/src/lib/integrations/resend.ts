import "server-only";
import crypto from "node:crypto";
import { env, requireKey } from "@/lib/env";
import { api } from "./http";

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string; text?: string; replyTo?: string; from?: string; tags?: { name: string; value: string }[] }) {
  const r = await api<{ id: string }>("Resend", "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireKey("Resend", env.resendKey, "RESEND_API_KEY")}` },
    json: { from: opts.from ?? env.resendFrom, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text, reply_to: opts.replyTo, tags: opts.tags },
  });
  return r.id;
}
export async function getReceivedEmail(id: string) {
  return api<{ html?: string; text?: string; subject?: string; from?: string }>("Resend", `https://api.resend.com/emails/receiving/${id}`, {
    headers: { Authorization: `Bearer ${requireKey("Resend", env.resendKey, "RESEND_API_KEY")}` },
  });
}
/** Svix-style signature verification (skipped when RESEND_WEBHOOK_SECRET is not set). */
export function verifyResend(raw: string, h: Headers) {
  if (!env.resendWebhookSecret) return true;
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), sig = h.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const secret = Buffer.from(env.resendWebhookSecret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", secret).update(`${id}.${ts}.${raw}`).digest("base64");
  return sig.split(" ").some((s) => s.split(",")[1] === expected);
}
export function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">${esc.replace(/\n/g, "<br>")}</div>`;
}
