"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X, Loader2, ChevronDown, Check } from "lucide-react";
import { cn, initials, colorFor } from "@/lib/utils";

/* ---------- Button ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline"; size?: "xs" | "sm" | "md"; loading?: boolean; icon?: React.ReactNode;
};
export const Button = React.forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "sm", loading, icon, className, children, disabled, ...p }, ref) {
  return (
    <button ref={ref} disabled={disabled || loading} {...p}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        size === "xs" && "h-6 px-2 text-xs", size === "sm" && "h-8 px-3 text-sm", size === "md" && "h-9 px-4 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent/90",
        variant === "secondary" && "bg-bg border border-border text-fg hover:bg-hover shadow-card",
        variant === "outline" && "border border-border-strong text-fg hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "bg-danger text-white hover:bg-danger/90",
        className)}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
});
export function IconButton({ className, label, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} {...p} className={cn("inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg disabled:opacity-40", className)} />;
}

/* ---------- Inputs ---------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cn("h-8 w-full rounded border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15", className)} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} {...p} className={cn("w-full rounded border border-border bg-bg px-2.5 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15", className)} />;
});
export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select {...p} className="h-8 w-full appearance-none rounded border border-border bg-bg pl-2.5 pr-7 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15">{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-faint" />
    </div>
  );
}
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}
export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-accent" : "bg-border-strong")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
    </button>
  );
}
export function Checkbox({ checked, onChange, className }: { checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border", checked ? "border-accent bg-accent text-white" : "border-border-strong bg-bg", className)}>
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

/* ---------- Display ---------- */
const TONES: Record<string, string> = {
  gray: "bg-subtle text-muted", blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400", green: "bg-green-500/10 text-green-700 dark:text-green-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400", amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400", purple: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-400", pink: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
};
export function Badge({ tone = "gray", className, children }: { tone?: keyof typeof TONES | string; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs font-medium whitespace-nowrap", TONES[tone] ?? TONES.gray, className)}>{children}</span>;
}
export const STATUS_TONE: Record<string, string> = {
  lead: "blue", contacted: "purple", booked: "amber", customer: "green", lost: "red",
  prospect: "blue", onboarding: "amber", active: "green", paused: "gray", churned: "red",
  qualified: "purple", proposal: "amber", contract_sent: "teal", won: "green",
  draft: "gray", sent: "blue", viewed: "purple", completed: "green", declined: "red", voided: "gray", error: "red",
  paid: "green", partial: "amber", overdue: "red", void: "gray", earned: "blue", approved: "purple",
  pass: "green", fail: "red", na: "gray", published: "green", archived: "gray", waiting: "amber", running: "blue", failed: "red", stopped: "gray",
};
export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{status.replace(/_/g, " ")}</Badge>;
}
export function Avatar({ name, size = 20, square, className, color }: { name: string | null | undefined; size?: number; square?: boolean; className?: string; color?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center font-semibold text-white", square ? "rounded" : "rounded-full", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42), background: color ?? colorFor(name) }}>
      {initials(name)}
    </span>
  );
}
export function Card({ className, children, title, action }: { className?: string; children: React.ReactNode; title?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("rounded-md border border-border bg-bg", className)}>
      {(title || action) && <div className="flex items-center justify-between border-b border-border px-4 py-2.5"><div className="text-sm font-semibold">{title}</div>{action}</div>}
      {children}
    </div>
  );
}
export function Stat({ label, value, sub, tone, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down"; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-bg p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">{icon}{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className={cn("mt-0.5 text-xs", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : "text-faint")}>{sub}</div>}
    </div>
  );
}
export function Spinner({ className }: { className?: string }) { return <Loader2 className={cn("h-4 w-4 animate-spin text-faint", className)} />; }
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 p-10 text-sm text-faint"><Spinner />{label}</div>;
}
export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <div className="text-sm font-semibold">{title}</div>
      {body && <div className="max-w-sm text-sm text-muted">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------- Overlays ---------- */
function useEsc(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}
export function Portal({ children }: { children: React.ReactNode }) {
  const [m, setM] = React.useState(false); React.useEffect(() => setM(true), []);
  return m ? createPortal(children, document.body) : null;
}
export function Dialog({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[10vh]" onMouseDown={onClose}>
        <div className="flex max-h-[80vh] w-full flex-col rounded-lg border border-border bg-bg shadow-pop" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">{title}</div>
            <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
export function Drawer({ open, onClose, title, children, width = 480, actions }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; width?: number; actions?: React.ReactNode }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-40" onMouseDown={onClose}>
        <div className="absolute bottom-2 right-2 top-2 flex flex-col rounded-lg border border-border bg-bg shadow-pop" style={{ width: `min(${width}px, calc(100vw - 16px))` }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
            {actions}
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </Portal>
  );
}
/** Lightweight dropdown menu anchored to its trigger. */
export function Menu({ trigger, children, align = "left", width = 200 }: { trigger: React.ReactNode; children: React.ReactNode | ((close: () => void) => React.ReactNode); align?: "left" | "right"; width?: number }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className={cn("absolute z-50 mt-1 rounded-md border border-border bg-bg p-1 shadow-pop", align === "right" ? "right-0" : "left-0")} style={{ width }}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
export function MenuItem({ icon, children, onClick, danger, active }: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-hover", danger ? "text-danger" : "text-fg", active && "bg-hover")}>
      {icon && <span className="text-muted">{icon}</span>}<span className="flex-1 truncate">{children}</span>{active && <Check className="h-3.5 w-3.5 text-accent" />}
    </button>
  );
}
export function Tabs({ tabs, value, onChange, className }: { tabs: { id: string; label: React.ReactNode; icon?: React.ReactNode; count?: number }[]; value: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-border px-3", className)}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn("-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-sm", value === t.id ? "border-fg font-medium text-fg" : "border-transparent text-muted hover:text-fg")}>
          {t.icon}{t.label}{t.count != null && <span className="rounded bg-subtle px-1 text-xs text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function confirmAction(msg: string) { return typeof window !== "undefined" && window.confirm(msg); }

/* ---------- Page chrome ---------- */
export function PageHeader({ icon, title, count, actions, children }: { icon?: React.ReactNode; title: React.ReactNode; count?: number; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-2">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        {icon && <span className="text-muted">{icon}</span>}<span className="truncate">{title}</span>
        {count != null && <span className="text-faint">{count}</span>}
      </div>
      {children}
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-1.5">{children}</div>;
}
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("scroll-thin overflow-auto", className)}><table className="w-full border-collapse text-sm">{children}</table></div>;
}
export function Th({ children, className, onClick }: { children?: React.ReactNode; className?: string; onClick?: () => void }) {
  return <th onClick={onClick} className={cn("sticky top-0 z-10 h-8 whitespace-nowrap border-b border-r border-border bg-bg px-3 text-left text-xs font-medium text-muted last:border-r-0", onClick && "cursor-pointer hover:bg-hover", className)}>{children}</th>;
}
export function Td({ children, className, onClick }: { children?: React.ReactNode; className?: string; onClick?: () => void }) {
  return <td onClick={onClick} className={cn("h-9 whitespace-nowrap border-b border-r border-border px-3 last:border-r-0", className)}>{children}</td>;
}
export function Markdown({ text }: { text: string }) {
  const html = React.useMemo(() => {
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return esc
      .replace(/^### (.*)$/gm, "<h4 class='font-semibold mt-3'>$1</h4>").replace(/^## (.*)$/gm, "<h3 class='font-semibold mt-3'>$1</h3>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\s)\*(.+?)\*/g, "$1<em>$2</em>")
      .replace(/^\s*[-•] (.*)$/gm, "<li class='ml-4 list-disc'>$1</li>").replace(/^\s*(\d+)\. (.*)$/gm, "<li class='ml-4 list-decimal'>$2</li>")
      .replace(/\n{2,}/g, "<br/>").replace(/\n/g, "<br/>").replace(/<\/li><br\/>/g, "</li>");
  }, [text]);
  return <div className="text-sm leading-relaxed [&_strong]:text-fg" dangerouslySetInnerHTML={{ __html: html }} />;
}
