/** Shared landing-page content model. Pure module: safe on server and client. */

export type SectionType = "services" | "trust" | "faq" | "testimonials" | "cta" | "text";
export type SectionItem = { title: string; body: string; image?: string };
export type Section = { type: SectionType; title: string; body: string; items: SectionItem[] };
export type FormField = "name" | "phone" | "email" | "vehicle" | "message";

export type LandingContent = {
  theme: { primary: string; dark: string };
  hero: { eyebrow: string; headline: string; subheadline: string; cta_label: string; image: string };
  bullets: string[];
  sections: Section[];
  form: { fields: FormField[]; submit_label: string; consent_text: string };
  seo: { title: string; description: string };
  phone: string;
};

/** A variant stores partial overrides of the page content. */
export type VariantOverrides = {
  theme?: Partial<LandingContent["theme"]>;
  hero?: Partial<LandingContent["hero"]>;
  bullets?: string[];
  form?: Partial<Pick<LandingContent["form"], "submit_label" | "consent_text">>;
};

export const BUSINESS = {
  name: "Newport Smog & Auto Registration",
  short: "Newport Smog",
  phone: "(714) 436-1700",
  email: "newportsmog@gmail.com",
  address: "375 Bristol St, Unit 80",
  city: "Costa Mesa, CA 92626",
  bar: "BAR # ARD 269691",
  hours: [["Monday – Friday", "8:00 AM – 6:00 PM"], ["Saturday", "8:00 AM – 4:00 PM"], ["Sunday", "Closed"]] as [string, string][],
  maps: "https://www.google.com/maps/dir/?api=1&destination=Newport+Smog+%26+Auto+Registration,+375+Bristol+St+Unit+80,+Costa+Mesa,+CA+92626",
  bookingFallback: "https://checkin.newportsmog.com/s/newport/book",
  since: "2001",
};

export const BRAND = { primary: "#0E6B43", dark: "#0B1F17" };

export const SECTION_TYPES: { id: SectionType; label: string; hint: string }[] = [
  { id: "services", label: "Services / pricing", hint: "Cards with a title and short description (or price)." },
  { id: "trust", label: "Trust / why us", hint: "Checklist of reasons, optional badge images." },
  { id: "faq", label: "FAQ", hint: "Questions (title) and answers (body)." },
  { id: "testimonials", label: "Testimonials", hint: "Only quote reviewers who gave written consent. Title = name, body = quote." },
  { id: "cta", label: "Call to action", hint: "Banner with call + form buttons." },
  { id: "text", label: "Text", hint: "Heading and paragraphs." },
];

export const FORM_FIELDS: { id: FormField; label: string }[] = [
  { id: "name", label: "Name" }, { id: "phone", label: "Phone" }, { id: "email", label: "Email" },
  { id: "vehicle", label: "Vehicle (year, make, model)" }, { id: "message", label: "Message" },
];

export const LP_IMAGES = [
  { src: "/lp/hero-enzo.webp", label: "Enzo in the bay" },
  { src: "/lp/storefront-mclaren.webp", label: "Storefront · McLaren" },
  { src: "/lp/storefront-gt3.webp", label: "Storefront · GT3" },
  { src: "/lp/storefront-m4.webp", label: "Storefront · M4" },
  { src: "/lp/porsche-gt3-green.webp", label: "Porsche GT3 green" },
  { src: "/lp/porsche-911-blue.webp", label: "Porsche 911 blue" },
];

export const ROUTING_MODES = [
  { id: "round_robin", label: "Round robin", body: "Leads rotate through the selected reps in order, one each. Paused reps are skipped." },
  { id: "weighted", label: "Weighted", body: "Each lead goes to a rep at random, in proportion to the weight you give them." },
  { id: "least_loaded", label: "Least loaded", body: "Each lead goes to the rep with the fewest new contacts in the last 7 days." },
  { id: "specific", label: "Specific rep", body: "Every lead goes to one rep (the first unpaused rep selected)." },
  { id: "none", label: "Unassigned", body: "Leads are created without an owner so the team can claim them." },
] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number]["id"];

export const DEFAULT_CONTENT: LandingContent = {
  theme: { ...BRAND },
  hero: { eyebrow: "", headline: "Your headline", subheadline: "", cta_label: "Get a quote", image: "/lp/hero-enzo.webp" },
  bullets: [],
  sections: [],
  form: {
    fields: ["name", "phone", "email"],
    submit_label: "Send",
    consent_text: "By submitting, you agree Newport Smog may contact you by call, text or email about your request. Msg & data rates may apply. Reply STOP to opt out.",
  },
  seo: { title: "", description: "" },
  phone: BUSINESS.phone,
};

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SECTION_IDS = SECTION_TYPES.map((s) => s.id) as string[];
const FIELD_IDS = FORM_FIELDS.map((f) => f.id) as string[];

/** Coerce any stored jsonb into a complete LandingContent. */
export function normalizeContent(raw: unknown): LandingContent {
  const c = isObj(raw) ? raw : {};
  const theme = isObj(c.theme) ? c.theme : {};
  const hero = isObj(c.hero) ? c.hero : {};
  const form = isObj(c.form) ? c.form : {};
  const seo = isObj(c.seo) ? c.seo : {};
  const D = DEFAULT_CONTENT;
  return {
    theme: { primary: str(theme.primary, D.theme.primary) || D.theme.primary, dark: str(theme.dark, D.theme.dark) || D.theme.dark },
    hero: {
      eyebrow: str(hero.eyebrow), headline: str(hero.headline, D.hero.headline), subheadline: str(hero.subheadline),
      cta_label: str(hero.cta_label, D.hero.cta_label), image: str(hero.image, D.hero.image),
    },
    bullets: Array.isArray(c.bullets) ? c.bullets.filter((b): b is string => typeof b === "string") : [],
    sections: Array.isArray(c.sections)
      ? c.sections.filter(isObj).map((s) => ({
          type: (SECTION_IDS.includes(str(s.type)) ? s.type : "text") as SectionType,
          title: str(s.title), body: str(s.body),
          items: Array.isArray(s.items) ? s.items.filter(isObj).map((i) => ({ title: str(i.title), body: str(i.body), ...(str(i.image) ? { image: str(i.image) } : {}) })) : [],
        }))
      : [],
    form: {
      fields: Array.isArray(form.fields) ? (form.fields.filter((f) => typeof f === "string" && FIELD_IDS.includes(f)) as FormField[]) : D.form.fields,
      submit_label: str(form.submit_label, D.form.submit_label) || D.form.submit_label,
      consent_text: str(form.consent_text, D.form.consent_text),
    },
    seo: { title: str(seo.title), description: str(seo.description) },
    phone: str(c.phone, D.phone) || D.phone,
  };
}

/** Remove empty strings / empty arrays so only real overrides are stored. */
export function cleanOverrides(raw: unknown): VariantOverrides {
  const o = isObj(raw) ? raw : {};
  const out: VariantOverrides = {};
  const pick = (src: unknown, keys: string[]) => {
    if (!isObj(src)) return undefined;
    const r: Record<string, string> = {};
    for (const k of keys) { const v = src[k]; if (typeof v === "string" && v.trim()) r[k] = v; }
    return Object.keys(r).length ? r : undefined;
  };
  const theme = pick(o.theme, ["primary", "dark"]); if (theme) out.theme = theme;
  const hero = pick(o.hero, ["eyebrow", "headline", "subheadline", "cta_label", "image"]); if (hero) out.hero = hero;
  const form = pick(o.form, ["submit_label", "consent_text"]); if (form) out.form = form;
  if (Array.isArray(o.bullets)) { const b = o.bullets.filter((x): x is string => typeof x === "string" && !!x.trim()); if (b.length) out.bullets = b; }
  return out;
}

/** Apply a variant's overrides on top of the base page content. */
export function mergeContent(base: LandingContent, overrides: unknown): LandingContent {
  const o = cleanOverrides(overrides);
  return {
    ...base,
    theme: { ...base.theme, ...o.theme },
    hero: { ...base.hero, ...o.hero },
    bullets: o.bullets ?? base.bullets,
    form: { ...base.form, ...o.form },
  };
}

export function overrideCount(overrides: unknown) {
  const o = cleanOverrides(overrides);
  return Object.keys(o.theme ?? {}).length + Object.keys(o.hero ?? {}).length + Object.keys(o.form ?? {}).length + (o.bullets ? 1 : 0);
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[_\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "page";
}

/** Fixed categorical order for variants (control = slot 1). */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const seriesColor = (i: number) => SERIES[i % SERIES.length]!;
