import { BRAND, BUSINESS, DEFAULT_CONTENT, type LandingContent } from "./types";

/** Starter templates. Copy is Newport Smog's own (from newportsmog.com and the shop price sheet). */
export type TemplateId = "smog" | "partner" | "dmv" | "blank";

const consent = DEFAULT_CONTENT.form.consent_text;
const HOURS_LINE = "Mon–Fri 8–6 · Sat 8–4 · 375 Bristol St, Unit 80, Costa Mesa";

const faq = {
  where: { title: "Where are you?", body: `${BUSINESS.address}, ${BUSINESS.city}. Look for the “Newport Smog Test Only” sign.` },
  hours: { title: "What are your hours?", body: "Monday to Friday 8:00 AM to 6:00 PM, Saturday 8:00 AM to 4:00 PM, and closed on Sunday." },
  star: { title: "My DMV renewal notice says I need a STAR station. Can you smog my car?", body: "Yes. If your DMV renewal notice says “Smog Certification Required at a STAR station,” you can bring your car to us. We are a STAR certified station, BAR # ARD 269691." },
  testOnly: { title: "What does test-only mean?", body: "We only test vehicles. We don't do repairs, so there is no repair upsell." },
  vehicles: { title: "What vehicles do you smog check?", body: "Vehicles from 1976 to the present that run on gasoline, diesel, CNG or hybrid power, including cars, vans, SUVs, trucks and RVs. We also smog high-performance and exotic cars." },
  appt: { title: "Do I need an appointment?", body: "You don't have to book ahead. You can check in online before you arrive, book an appointment, or call (714) 436-1700." },
  dmv: { title: "Do you offer DMV and auto registration services?", body: "Yes. We handle registration renewals, title transfers, non-resident transfers, duplicate titles, duplicate license plates, duplicate registrations and stickers, and VIN verification." },
  fleet: { title: "Do you offer fleet or partner pricing?", body: "Yes. Dealerships, rental companies, repair and exotic shops, and other car businesses can get special fleet and partner pricing on smog checks. Call (714) 436-1700 to set it up." },
};

const recognition = [
  { title: "People Love Us on Yelp, 2026", body: "Yelp, November 1, 2026", image: "/lp/yelp-2026-badge.webp" },
  { title: "BusinessRate Best of 2026", body: "Best Smog Inspection Station in Costa Mesa for 2026. Based on Google reviews.", image: "/lp/businessrate-2026-seal.webp" },
];

export const TEMPLATES: { id: TemplateId; name: string; description: string; slug: string; content: LandingContent }[] = [
  {
    id: "smog", name: "STAR smog check", slug: "star-smog-check",
    description: "Retail drivers: STAR test-only smog check with pricing, FAQ and quote form.",
    content: {
      theme: { ...BRAND },
      hero: {
        eyebrow: "STAR test-only smog station · Costa Mesa",
        headline: "Smog check, done right. Skip the wait.",
        subheadline: "STAR certified and test-only since 2001. We don't do repairs, so there's no repair upsell. Get a quote, or check in from your phone before you arrive.",
        cta_label: "Get my smog check quote",
        image: "/lp/hero-enzo.webp",
      },
      bullets: [
        "STAR certified station, BAR # ARD 269691",
        "Test-only: no repair upsell",
        "Passenger cars $73 + $8.25 certificate",
        "DMV notice says STAR station? We can test your car",
        HOURS_LINE,
      ],
      sections: [
        {
          type: "services", title: "Smog check pricing", body: "Call or stop by for a quote on anything not listed. The $8.25 state certificate is added when your vehicle passes.",
          items: [
            { title: "Passenger cars · $73", body: "Gas, hybrid, diesel and CNG cars, SUVs and trucks. Plus $8.25 certificate." },
            { title: "Vans · $83", body: "Passenger and cargo vans." },
            { title: "Exotics & Sprinter · $93", body: "Careful, experienced handling for high-end and high-performance cars." },
            { title: "Pre-2000 cars · $118", body: "Classic and older cars, 1976 and up." },
            { title: "Older luxury · $198", body: "Older luxury and specialty vehicles." },
            { title: "Retest · $43", body: "Plus $8.25 certificate ($63 for older cars)." },
          ],
        },
        {
          type: "trust", title: "Why Newport Smog", body: "Established in 2001, with over 20 years of experience.",
          items: [
            { title: "Test-only (STAR)", body: "We don't repair cars, so we have no reason to fail yours." },
            { title: "Check in online", body: "Fill in your details on your phone and we get your car ready." },
            { title: "Book ahead", body: "Pick a time that works for you, or just check in when you arrive." },
            { title: "Smog + registration", body: "Handle your smog check and auto registration in one stop." },
            ...recognition,
          ],
        },
        { type: "faq", title: "Questions", body: "", items: [faq.star, faq.testOnly, faq.vehicles, faq.appt, faq.hours, faq.where] },
        { type: "cta", title: "Ready when you are", body: "Walk in, book online, or call (714) 436-1700. Mon–Fri 8–6, Sat 8–4.", items: [] },
      ],
      form: { fields: ["name", "phone", "email", "vehicle"], submit_label: "Get my quote", consent_text: consent },
      seo: { title: "STAR Smog Check in Costa Mesa | Newport Smog", description: "STAR certified, test-only smog check station in Costa Mesa since 2001. BAR # ARD 269691. Passenger cars $73 + $8.25 certificate. Call (714) 436-1700." },
      phone: BUSINESS.phone,
    },
  },
  {
    id: "partner", name: "Dealer & fleet partner program", slug: "partner-program",
    description: "B2B: dealerships, rentals, repair/exotic shops and fleets. Partner pricing and month-end billing.",
    content: {
      theme: { ...BRAND },
      hero: {
        eyebrow: "Dealer & fleet partner program",
        headline: "Partner pricing on every smog check for your dealership or fleet.",
        subheadline: "For dealerships big or small, rental companies, repair and exotic shops, and any car business. Audi Fletcher Jones and Eurocar have trusted us for 20 years.",
        cta_label: "Get partner pricing",
        image: "/lp/storefront-mclaren.webp",
      },
      bullets: [
        "Special fleet and partner pricing on smog checks",
        "STAR certified, test-only station · BAR # ARD 269691",
        "Smog checks plus DMV registration in one stop",
        "One invoice at month end for partner accounts",
        "Established in 2001 · 375 Bristol St, Costa Mesa",
      ],
      sections: [
        {
          type: "services", title: "Who we work with", body: "Reliable service for dealers and fleets, with partner pricing.",
          items: [
            { title: "Dealerships", body: "New and pre-owned inventory, trade-ins and wholesale units, big or small stores." },
            { title: "Rental companies", body: "Keep the fleet registered and on the road." },
            { title: "Repair & exotic shops", body: "Many local mechanic and exotic car shops send their customers to us." },
            { title: "Fleets & car businesses", body: "Smog, title transfers, renewals and VIN verification for your whole fleet." },
          ],
        },
        {
          type: "trust", title: "Trusted by local dealerships and businesses", body: "",
          items: [
            { title: "Ferrari of Newport Beach", body: "" }, { title: "Aston Martin Newport Beach", body: "" }, { title: "Audi Fletcher Jones", body: "" },
            { title: "Eurocar", body: "" }, { title: "Newport Lexus", body: "" }, { title: "Silver Arrow Cars", body: "" },
            { title: "Scuderia Motorcars", body: "" }, { title: "Yost Auto Group", body: "" }, { title: "Enterprise Rent-A-Car", body: "" },
          ],
        },
        { type: "faq", title: "Questions", body: "", items: [faq.fleet, faq.vehicles, faq.dmv, faq.testOnly, faq.hours] },
        { type: "cta", title: "Set up partner pricing", body: "Call (714) 436-1700 to set up partner pricing for your business, or send the form and we'll reach out.", items: [] },
      ],
      form: { fields: ["name", "phone", "email", "message"], submit_label: "Get partner pricing", consent_text: consent },
      seo: { title: "Dealer & Fleet Smog Checks | Newport Smog Partner Program", description: "Partner pricing on STAR test-only smog checks for dealerships, rental companies, repair and exotic shops in Costa Mesa and Newport Beach. Call (714) 436-1700." },
      phone: BUSINESS.phone,
    },
  },
  {
    id: "dmv", name: "DMV registration services", slug: "dmv-registration",
    description: "Registration renewals, title transfers and VIN verification on site.",
    content: {
      theme: { ...BRAND },
      hero: {
        eyebrow: "Auto registration · Costa Mesa",
        headline: "Skip the DMV. Registration and title transfers, done on site.",
        subheadline: "Renewals, title transfers, non-resident transfers, duplicates and VIN verification, plus your smog check in the same stop.",
        cta_label: "Get help with my registration",
        image: "/lp/storefront-m4.webp",
      },
      bullets: [
        "Registration renewals and title transfers",
        "Non-resident transfers and VIN verification",
        "Duplicate titles, plates, registrations and stickers",
        "Smog check + registration in one stop",
        HOURS_LINE,
      ],
      sections: [
        {
          type: "services", title: "Registration services", body: "Call or stop by for a quote.",
          items: [
            { title: "Registration renewals", body: "Renew on site, with your smog check if you need one." },
            { title: "Title transfers", body: "Bought or sold a car? We handle the paperwork." },
            { title: "Non-resident transfers", body: "Bringing a car into California." },
            { title: "VIN verification", body: "Quick and done on site." },
            { title: "Duplicates", body: "Duplicate titles, license plates, registrations and stickers." },
          ],
        },
        { type: "faq", title: "Questions", body: "", items: [faq.dmv, faq.star, faq.appt, faq.hours, faq.where] },
        { type: "cta", title: "Skip the DMV line", body: "Call (714) 436-1700 or send the form and we'll tell you exactly what to bring.", items: [] },
      ],
      form: { fields: ["name", "phone", "email", "vehicle", "message"], submit_label: "Send my request", consent_text: consent },
      seo: { title: "DMV Registration & Title Transfers in Costa Mesa | Newport Smog", description: "Registration renewals, title transfers, non-resident transfers and VIN verification on site at Newport Smog & Auto Registration, Costa Mesa." },
      phone: BUSINESS.phone,
    },
  },
  {
    id: "blank", name: "Blank", slug: "new-page",
    description: "Start from an empty page with the Newport Smog brand.",
    content: { ...DEFAULT_CONTENT, hero: { ...DEFAULT_CONTENT.hero, eyebrow: "Newport Smog & Auto Registration", headline: "Your headline here" } },
  },
];
