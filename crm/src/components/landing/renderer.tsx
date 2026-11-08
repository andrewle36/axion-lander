"use client";
import * as React from "react";
import { Phone, Check, MapPin, Clock, ChevronDown, ShieldCheck, Star, CalendarCheck, Loader2, Quote } from "lucide-react";
import { BUSINESS, type LandingContent, type Section } from "./types";

export type RendererProps = {
  content: LandingContent;
  pageId: string;
  variantId: string | null;
  /** live = public page (tracks + submits), preview = editor (no network). */
  mode: "live" | "preview";
  /** auto uses viewport breakpoints; mobile/desktop force a layout (editor preview). */
  layout?: "auto" | "mobile" | "desktop";
  thankYou?: string | null;
  redirectUrl?: string | null;
  bookingUrl?: string;
  /** live only: record a view and set the sticky variant cookie. */
  track?: boolean;
  assignCookie?: boolean;
  banner?: React.ReactNode;
};

/* ---------- cookies + beacons (live mode) ---------- */
function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[-.]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]!) : null;
}
function setCookie(name: string, value: string, days: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${days * 86400}; samesite=lax`;
}
function visitorId() {
  let v = getCookie("lp_vid");
  if (!v) {
    v = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    setCookie("lp_vid", v, 365);
  }
  return v;
}
function beacon(body: Record<string, unknown>) {
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/public/track", new Blob([json], { type: "application/json" }))) return;
  } catch { /* fall through */ }
  void fetch("/api/public/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true }).catch(() => {});
}
function urlParams() {
  const out: Record<string, string> = {};
  if (typeof window === "undefined") return out;
  new URLSearchParams(window.location.search).forEach((v, k) => { if (/^utm_/.test(k) || k === "gclid" || k === "fbclid") out[k] = v; });
  return out;
}
const telHref = (p: string) => { const d = p.replace(/\D/g, ""); return `tel:+${d.length === 10 ? "1" + d : d}`; };

/* ---------- renderer ---------- */
export function LandingRenderer(props: RendererProps) {
  const { content: c, pageId, variantId, mode, layout = "auto", bookingUrl = BUSINESS.bookingFallback } = props;
  const live = mode === "live";
  const L = (auto: string, mobile: string, desktop: string) => (layout === "auto" ? auto : layout === "desktop" ? desktop : mobile);
  const primary = c.theme.primary, dark = c.theme.dark;
  const vidRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!live) return;
    vidRef.current = visitorId();
    if (props.assignCookie && variantId) setCookie(`lp_v_${pageId}`, variantId, 90);
    if (props.track) beacon({ type: "view", page_id: pageId, variant_id: variantId, visitor_id: vidRef.current, meta: { ...urlParams(), referrer: document.referrer || undefined, path: location.pathname } });
  }, [live, pageId, variantId, props.track, props.assignCookie]);

  const trackClick = (type: "call_click" | "cta_click", where: string) => {
    if (!live || !props.track) return;
    beacon({ type, page_id: pageId, variant_id: variantId, visitor_id: vidRef.current ?? visitorId(), meta: { where } });
  };
  const scrollToForm = (where: string) => {
    trackClick("cta_click", where);
    document.getElementById(`lp-form-${pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => (document.querySelector(`#lp-form-${pageId} input:not([type=hidden])`) as HTMLInputElement | null)?.focus({ preventScroll: true }), 450);
  };

  const CallBtn = ({ where, className, label }: { where: string; className?: string; label?: string }) => (
    <a href={telHref(c.phone)} onClick={() => trackClick("call_click", where)}
      className={"inline-flex min-h-[52px] items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-bold transition hover:brightness-110 " + (className ?? "")}>
      <Phone className="h-[18px] w-[18px]" />{label ?? `Call ${c.phone}`}
    </a>
  );

  return (
    <div className="min-h-full bg-[#f7f8f6] font-sans text-[16px] leading-relaxed text-[#14231c] antialiased" style={{ colorScheme: "light" }}
      onClickCapture={(e) => { if (!live && (e.target as HTMLElement).closest("a")) e.preventDefault(); }}>
      {props.banner}
      {/* top bar */}
      <header className={(live ? "sticky top-0" : "relative") + " z-30 border-b border-black/5 bg-white/95 backdrop-blur"} style={{ boxShadow: `0 2px 0 ${primary}` }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-extrabold uppercase tracking-wide">{BUSINESS.short}</div>
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: primary }}>Smog check · Auto registration</div>
          </div>
          <div className="flex items-center gap-2">
            <a href={bookingUrl} target="_blank" rel="noopener" onClick={() => trackClick("cta_click", "header_book")}
              className={L("hidden h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold sm:inline-flex", "hidden", "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold")}
              style={{ borderColor: primary, color: primary }}><CalendarCheck className="h-4 w-4" />Book online</a>
            <a href={telHref(c.phone)} onClick={() => trackClick("call_click", "header")}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white" style={{ background: primary }}>
              <Phone className="h-4 w-4" /><span>{c.phone}</span>
            </a>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden" style={{ background: dark }}>
        {c.hero.image && <img src={c.hero.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${dark}66 0%, ${dark}cc 55%, ${dark} 100%), linear-gradient(90deg, ${dark}ee 0%, ${dark}55 70%)` }} />
        <div className={L("relative mx-auto grid max-w-6xl gap-8 px-4 pb-10 pt-12 md:grid-cols-[1.15fr_1fr] md:items-start md:pb-16 md:pt-20", "relative grid gap-8 px-4 pb-10 pt-12", "relative mx-auto grid max-w-6xl grid-cols-[1.15fr_1fr] items-start gap-8 px-4 pb-16 pt-20")}>
          <div className="text-white">
            {c.hero.eyebrow && <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/90 ring-1 ring-white/20"><ShieldCheck className="h-3.5 w-3.5" />{c.hero.eyebrow}</div>}
            <h1 className={L("text-[32px] font-extrabold leading-[1.1] tracking-tight md:text-[48px]", "text-[32px] font-extrabold leading-[1.1] tracking-tight", "text-[48px] font-extrabold leading-[1.1] tracking-tight")}>{c.hero.headline}</h1>
            <div className="mt-4 h-1.5 w-20 rounded-full" style={{ background: primary }} />
            {c.hero.subheadline && <p className={L("mt-5 max-w-xl text-[17px] text-white/85 md:text-[19px]", "mt-5 text-[17px] text-white/85", "mt-5 max-w-xl text-[19px] text-white/85")}>{c.hero.subheadline}</p>}
            {c.bullets.length > 0 && (
              <ul className="mt-6 grid gap-2.5">
                {c.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[15px] text-white/95">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: primary }}><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>{b}
                  </li>
                ))}
              </ul>
            )}
            <div className={L("mt-7 grid gap-3 sm:flex", "mt-7 grid gap-3", "mt-7 flex gap-3")}>
              <button type="button" onClick={() => scrollToForm("hero")} className="inline-flex min-h-[52px] items-center justify-center rounded-lg bg-white px-6 text-[15px] font-bold transition hover:brightness-95" style={{ color: dark }}>{c.hero.cta_label}</button>
              <CallBtn where="hero" className="text-white ring-1 ring-white/50 hover:bg-white/10" />
            </div>
            <div className="mt-4 text-[13px] text-white/70">STAR certified · Test-only · {BUSINESS.bar} · Since {BUSINESS.since}</div>
          </div>
          <LeadForm {...props} layout={layout} primary={primary} vidRef={vidRef} />
        </div>
      </section>

      {c.sections.map((s, i) => <SectionBlock key={i} s={s} i={i} L={L} primary={primary} dark={dark} c={c} onForm={() => scrollToForm(`section_${i}`)} CallBtn={CallBtn} />)}

      {/* location + hours */}
      <section className="border-t border-black/5 bg-white">
        <div className={L("mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-2", "grid gap-8 px-4 py-12", "mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-12")}>
          <div>
            <h2 className="text-[24px] font-extrabold tracking-tight">Easy to find on Bristol St</h2>
            <div className="mt-3 flex items-start gap-2 text-[17px] font-semibold"><MapPin className="mt-1 h-5 w-5 shrink-0" style={{ color: primary }} />{BUSINESS.address}, {BUSINESS.city}</div>
            <p className="mt-1 text-[15px] text-[#4a5a52]">Look for the “Newport Smog Test Only” sign.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={BUSINESS.maps} target="_blank" rel="noopener" className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border px-4 text-[15px] font-semibold" style={{ borderColor: primary, color: primary }}><MapPin className="h-4 w-4" />Directions</a>
              <a href={bookingUrl} target="_blank" rel="noopener" onClick={() => trackClick("cta_click", "location_book")} className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border px-4 text-[15px] font-semibold" style={{ borderColor: primary, color: primary }}><CalendarCheck className="h-4 w-4" />Book an appointment</a>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-black/10" style={{ borderTop: `4px solid ${primary}` }}>
            <div className="flex items-center gap-2 px-5 pt-4 text-[13px] font-bold uppercase tracking-wider" style={{ color: primary }}><Clock className="h-4 w-4" />Hours</div>
            {BUSINESS.hours.map(([d, h]) => (
              <div key={d} className="flex justify-between gap-4 border-b border-black/5 px-5 py-3 text-[16px] last:border-0"><span className="font-semibold">{d}</span><span className="text-[#4a5a52]">{h}</span></div>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-4 pb-28 pt-8 text-center text-[13px] text-white/70" style={{ background: dark }}>
        <div className="font-bold text-white">{BUSINESS.name}</div>
        <div className="mt-1">{BUSINESS.address}, {BUSINESS.city} · {c.phone} · {BUSINESS.email}</div>
        <div className="mt-1">STAR Certified Smog Station · Test-only · {BUSINESS.bar} · Mon–Fri 8–6 · Sat 8–4 · Sun closed</div>
      </footer>

      {/* sticky mobile action bar */}
      <div className={L("fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-black/10 bg-white/95 p-2 backdrop-blur md:hidden", layout === "mobile" ? "relative z-40 grid grid-cols-2 gap-2 border-t border-black/10 bg-white/95 p-2" : "hidden", "hidden")}>
        <CallBtn where="sticky_bar" label="Call now" className="text-white" />
        <button type="button" onClick={() => scrollToForm("sticky_bar")} className="min-h-[52px] rounded-lg border-2 text-[15px] font-bold" style={{ borderColor: primary, color: primary }}>{c.hero.cta_label}</button>
      </div>
    </div>
  );
}

/* ---------- sections ---------- */
function SectionBlock({ s, i, L, primary, dark, c, onForm, CallBtn }: {
  s: Section; i: number; L: (a: string, m: string, d: string) => string; primary: string; dark: string; c: LandingContent; onForm: () => void;
  CallBtn: (p: { where: string; className?: string; label?: string }) => React.ReactElement;
}) {
  const alt = i % 2 === 1;
  const Head = () => (
    <>
      {s.title && <h2 className={L("text-[26px] font-extrabold tracking-tight md:text-[32px]", "text-[26px] font-extrabold tracking-tight", "text-[32px] font-extrabold tracking-tight")}>{s.title}</h2>}
      {s.title && <div className="mt-3 h-1.5 w-16 rounded-full" style={{ background: primary }} />}
      {s.body && <p className="mt-4 max-w-2xl whitespace-pre-line text-[16px] text-[#4a5a52]">{s.body}</p>}
    </>
  );
  if (s.type === "cta") {
    return (
      <section className="px-4 py-12" style={{ background: primary }}>
        <div className="mx-auto max-w-4xl text-center text-white">
          <h2 className={L("text-[26px] font-extrabold tracking-tight md:text-[34px]", "text-[26px] font-extrabold tracking-tight", "text-[34px] font-extrabold tracking-tight")}>{s.title}</h2>
          {s.body && <p className="mx-auto mt-3 max-w-2xl whitespace-pre-line text-[17px] text-white/90">{s.body}</p>}
          <div className={L("mt-6 grid gap-3 sm:flex sm:justify-center", "mt-6 grid gap-3", "mt-6 flex justify-center gap-3")}>
            <button type="button" onClick={onForm} className="min-h-[52px] rounded-lg bg-white px-6 text-[15px] font-bold" style={{ color: dark }}>{c.hero.cta_label}</button>
            <CallBtn where={`section_${i}`} className="text-white ring-1 ring-white/60 hover:bg-white/10" />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={alt ? "border-y border-black/5 bg-[#eef2ef]" : "bg-[#f7f8f6]"}>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Head />
        {s.type === "services" && (
          <div className={L("mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3", "mt-7 grid gap-4", "mt-7 grid grid-cols-3 gap-4")}>
            {s.items.map((it, k) => (
              <article key={k} className="rounded-xl border border-black/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderTop: `4px solid ${primary}` }}>
                <h3 className="text-[17px] font-bold">{it.title}</h3>
                {it.body && <p className="mt-1.5 text-[15px] text-[#4a5a52]">{it.body}</p>}
              </article>
            ))}
          </div>
        )}
        {s.type === "trust" && (
          <>
            <ul className={L("mt-7 grid gap-3 sm:grid-cols-2", "mt-7 grid gap-3", "mt-7 grid grid-cols-2 gap-3")}>
              {s.items.filter((it) => !it.image).map((it, k) => (
                <li key={k} className="flex items-start gap-3 rounded-xl border border-black/10 bg-white p-4" style={{ borderLeft: `5px solid ${primary}` }}>
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: primary }} />
                  <div><div className="font-bold">{it.title}</div>{it.body && <div className="text-[15px] text-[#4a5a52]">{it.body}</div>}</div>
                </li>
              ))}
            </ul>
            {s.items.some((it) => it.image) && (
              <div className={L("mt-6 grid gap-4 sm:grid-cols-2", "mt-6 grid gap-4", "mt-6 grid grid-cols-2 gap-4")}>
                {s.items.filter((it) => it.image).map((it, k) => (
                  <div key={k} className="flex items-center gap-4 rounded-xl border border-black/10 bg-white p-4">
                    <img src={it.image} alt={it.title} className="h-20 w-20 shrink-0 object-contain" />
                    <div><div className="flex items-center gap-1.5 font-bold"><Star className="h-4 w-4" style={{ color: primary }} />{it.title}</div>{it.body && <div className="text-[14px] text-[#4a5a52]">{it.body}</div>}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {s.type === "faq" && (
          <div className="mt-7 grid max-w-3xl gap-3">
            {s.items.map((it, k) => (
              <details key={k} className="group rounded-xl border border-black/10 bg-white px-5 py-4 open:shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-bold">{it.title}<ChevronDown className="h-5 w-5 shrink-0 transition group-open:rotate-180" style={{ color: primary }} /></summary>
                <p className="mt-2 whitespace-pre-line text-[15px] text-[#4a5a52]">{it.body}</p>
              </details>
            ))}
          </div>
        )}
        {s.type === "testimonials" && (
          <div className={L("mt-7 grid gap-4 md:grid-cols-2", "mt-7 grid gap-4", "mt-7 grid grid-cols-2 gap-4")}>
            {s.items.map((it, k) => (
              <blockquote key={k} className="rounded-xl border border-black/10 bg-white p-5" style={{ borderLeft: `5px solid ${primary}` }}>
                <Quote className="h-5 w-5" style={{ color: primary }} />
                <p className="mt-2 text-[16px]">{it.body}</p>
                <footer className="mt-3 text-[14px] font-bold" style={{ color: primary }}>{it.title}</footer>
              </blockquote>
            ))}
          </div>
        )}
        {s.type === "text" && s.items.length > 0 && (
          <div className="mt-6 grid max-w-3xl gap-4">
            {s.items.map((it, k) => <div key={k}><h3 className="text-[18px] font-bold">{it.title}</h3><p className="mt-1 whitespace-pre-line text-[16px] text-[#4a5a52]">{it.body}</p></div>)}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- form ---------- */
const FIELD_META = {
  name: { label: "Full name", type: "text", auto: "name", placeholder: "Jane Driver" },
  phone: { label: "Mobile phone", type: "tel", auto: "tel", placeholder: "(714) 555-0123" },
  email: { label: "Email", type: "email", auto: "email", placeholder: "you@example.com" },
  vehicle: { label: "Vehicle", type: "text", auto: "off", placeholder: "2016 Toyota Camry" },
  message: { label: "Anything we should know?", type: "textarea", auto: "off", placeholder: "" },
} as const;

function LeadForm(props: RendererProps & { primary: string; vidRef: React.MutableRefObject<string | null> }) {
  const { content: c, pageId, variantId, mode, primary } = props;
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = React.useState("");
  const started = React.useRef(Date.now());
  const fields = c.form.fields.length ? c.form.fields : (["name", "phone"] as const);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "preview") { setState("error"); setMsg("Preview only: submissions are disabled here. Use “View live” to send a real test lead."); return; }
    if (!vals.phone?.trim() && !vals.email?.trim()) { setState("error"); setMsg("Please enter a phone number or email so we can reach you."); return; }
    setState("sending"); setMsg("");
    try {
      const hp = (e.currentTarget.elements.namedItem("hp") as HTMLInputElement | null)?.value ?? "";
      const res = await fetch("/api/public/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...vals, hp, page_id: pageId, variant_id: variantId, visitor_id: props.vidRef.current ?? getCookie("lp_vid"), elapsed_ms: Date.now() - started.current, ...urlParams(), referrer: document.referrer || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Something went wrong. Please call us instead.");
      const redirect = props.redirectUrl || j.redirect_url;
      if (redirect) { window.location.href = redirect; return; }
      setState("done"); setMsg(props.thankYou || j.message || "Thanks! We'll reach out shortly.");
    } catch (err) { setState("error"); setMsg((err as Error).message); }
  }

  return (
    <div id={`lp-form-${pageId}`} className="scroll-mt-24 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5 sm:p-6">
      {state === "done" ? (
        <div className="py-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: primary }}><Check className="h-7 w-7" strokeWidth={3} /></div>
          <div className="mt-4 text-[20px] font-extrabold">You're all set</div>
          <p className="mt-2 whitespace-pre-line text-[15px] text-[#4a5a52]">{msg}</p>
          <a href={telHref(c.phone)} className="mt-5 inline-flex min-h-[48px] items-center gap-2 rounded-lg px-5 font-bold text-white" style={{ background: primary }}><Phone className="h-4 w-4" />{c.phone}</a>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-3">
          <div className="text-[19px] font-extrabold">{c.hero.cta_label}</div>
          <div className="-mt-2 text-[14px] text-[#4a5a52]">We usually reply within business hours.</div>
          {fields.map((f) => {
            const m = FIELD_META[f];
            const common = {
              name: f, value: vals[f] ?? "", autoComplete: m.auto, placeholder: m.placeholder,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVals((v) => ({ ...v, [f]: e.target.value })),
              className: "w-full rounded-lg border border-[#cfd8d3] bg-white px-3.5 text-[16px] text-[#14231c] placeholder:text-[#9aa8a0] focus:outline-none focus:ring-2",
              style: { ["--tw-ring-color" as string]: primary + "55" } as React.CSSProperties,
            };
            return (
              <label key={f} className="grid gap-1">
                <span className="text-[13px] font-semibold text-[#33443b]">{m.label}</span>
                {m.type === "textarea" ? <textarea {...common} rows={3} className={common.className + " py-2.5"} />
                  : <input {...common} type={m.type} inputMode={f === "phone" ? "tel" : undefined} className={common.className + " h-12"} />}
              </label>
            );
          })}
          {/* honeypot: hidden from humans */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>Website<input name="hp" type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
          </div>
          {state === "error" && <div className="rounded-lg bg-[#fdecec] px-3 py-2 text-[14px] text-[#9b1c1c]">{msg}</div>}
          <button type="submit" disabled={state === "sending"} className="mt-1 inline-flex min-h-[54px] items-center justify-center gap-2 rounded-lg text-[16px] font-bold text-white transition hover:brightness-110 disabled:opacity-70" style={{ background: primary }}>
            {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}{c.form.submit_label}
          </button>
          {c.form.consent_text && <p className="text-[12px] leading-snug text-[#6b7a72]">{c.form.consent_text}</p>}
        </form>
      )}
    </div>
  );
}
