import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function money(n: number | string | null | undefined, opts: { cents?: boolean } = {}) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: opts.cents === false ? 0 : 2, maximumFractionDigits: opts.cents === false ? 0 : 2 });
}
export function compactMoney(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1000) return "$" + (v / 1000).toFixed(v >= 100000 ? 0 : 1) + "k";
  return money(v, { cents: false });
}
export function pct(n: number | null | undefined, digits = 1) {
  return `${((n ?? 0) * 100).toFixed(digits)}%`;
}
/** Normalize to E.164 (US default). */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  const digits = d.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return digits ? "+" + digits : null;
}
export function fmtPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}
export function fullName(c: { first_name?: string | null; last_name?: string | null } | null | undefined) {
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unnamed";
}
export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";
}
export function relTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
export function shortDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}
export function dealNo(n: number | null | undefined) { return n ? `NS-${n}` : ""; }
export function jobNo(n: number | null | undefined) { return n ? `J-${n}` : ""; }
export function invNo(n: number | null | undefined) { return n ? `INV-${n}` : ""; }
const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0d9488", "#dc2626", "#2563eb", "#65a30d"];
export function colorFor(key: string | null | undefined) {
  let h = 0; for (const ch of key ?? "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
export function renderTemplate(tpl: string, vars: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => {
    const v = k.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined), vars);
    return v == null ? "" : String(v);
  });
}
