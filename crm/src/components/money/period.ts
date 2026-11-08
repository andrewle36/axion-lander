import {
  startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth, subDays, subMonths, startOfQuarter, startOfYear, format, differenceInCalendarDays, subYears,
} from "date-fns";

export type Range = { from: Date; to: Date };
export const tzOffset = () => new Date().getTimezoneOffset();

export const JOB_PRESETS = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "week", label: "This week" },
  { id: "month", label: "This month" }, { id: "last_month", label: "Last month" }, { id: "custom", label: "Custom" },
] as const;
export const FINANCE_PRESETS = [
  { id: "mtd", label: "Month to date" }, { id: "last_month", label: "Last month" }, { id: "qtd", label: "Quarter to date" },
  { id: "ytd", label: "Year to date" }, { id: "l12m", label: "Last 12 months" }, { id: "custom", label: "Custom" },
] as const;

export function presetRange(id: string, custom?: { from: string; to: string }): Range {
  const now = new Date();
  switch (id) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "week": return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    case "month": case "mtd": return { from: startOfMonth(now), to: endOfDay(now) };
    case "last_month": { const m = subMonths(now, 1); return { from: startOfMonth(m), to: endOfMonth(m) }; }
    case "qtd": return { from: startOfQuarter(now), to: endOfDay(now) };
    case "ytd": return { from: startOfYear(now), to: endOfDay(now) };
    case "l12m": return { from: startOfMonth(subMonths(now, 11)), to: endOfDay(now) };
    case "custom": {
      const f = custom?.from ? new Date(custom.from + "T00:00:00") : startOfMonth(now);
      const t = custom?.to ? new Date(custom.to + "T00:00:00") : now;
      return { from: startOfDay(f), to: endOfDay(t) };
    }
    default: return { from: startOfMonth(now), to: endOfDay(now) };
  }
}
/** Previous comparable period: same calendar span one month/quarter/year back for calendar presets, else the equal-length window before. */
export function previousRange(id: string, r: Range): Range {
  if (id === "mtd" || id === "month") { const f = subMonths(r.from, 1); return { from: f, to: endOfDay(subMonths(r.to, 1)) }; }
  if (id === "last_month") { const f = subMonths(r.from, 1); return { from: f, to: endOfMonth(f) }; }
  if (id === "qtd") return { from: subMonths(r.from, 3), to: endOfDay(subMonths(r.to, 3)) };
  if (id === "ytd" || id === "l12m") return { from: subYears(r.from, 1), to: endOfDay(subYears(r.to, 1)) };
  const days = differenceInCalendarDays(r.to, r.from) + 1;
  return { from: startOfDay(subDays(r.from, days)), to: endOfDay(subDays(r.from, 1)) };
}
export const rangeLabel = (r: Range) => format(r.from, "MMM d, yyyy") === format(r.to, "MMM d, yyyy")
  ? format(r.from, "EEE, MMM d, yyyy") : `${format(r.from, "MMM d, yyyy")} – ${format(r.to, "MMM d, yyyy")}`;
export const toISO = (r: Range) => ({ from: r.from.toISOString(), to: r.to.toISOString() });
export const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** Percent change helper; null when there is no base. */
export function delta(cur: number | null | undefined, prev: number | null | undefined) {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const PAYMENT_METHODS = ["cash", "card", "check", "zelle", "invoice"] as const;
export const SERVICE_CATEGORY_LABEL: Record<string, string> = { smog: "Smog", retest: "Retest", dmv: "DMV / registration", vin: "VIN verification", other: "Other" };
export const TXN_CATEGORY_LABEL: Record<string, string> = {
  revenue: "Revenue", cogs: "COGS", payroll: "Payroll", rent: "Rent", utilities: "Utilities", marketing: "Marketing", software: "Software",
  commission: "Commission", supplies: "Supplies", insurance: "Insurance", fees: "Fees", other_opex: "Other opex", interest: "Interest",
  taxes: "Taxes", depreciation: "Depreciation", owner_draw: "Owner draw", transfer: "Transfer", uncategorized: "Uncategorized",
};
