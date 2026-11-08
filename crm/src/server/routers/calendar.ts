import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, must, isAdmin, type Profile } from "@/server/trpc";
import { db } from "@/lib/supabase/admin";
import { logActivity, findContact } from "@/server/services/comms";
import { createLead } from "@/server/services/leads";
import { fireTrigger } from "@/server/services/automations";
import * as calendly from "@/lib/integrations/calendly";
import { fullName } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EVENT_SELECT =
  "*, calendar:calendars(id,name,color,kind), contact:contacts(id,first_name,last_name,phone,email,status), company:companies(id,name), vehicle:vehicles(id,year,make,model,plate)";

const STATUS = z.enum(["confirmed", "tentative", "cancelled", "no_show", "completed"]);
const iso = z.string().min(1);

const eventFields = z.object({
  calendar_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  start_at: iso.optional(),
  end_at: iso.optional(),
  all_day: z.boolean().optional(),
  color: z.string().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  status: STATUS.optional(),
  meeting_url: z.string().nullable().optional(),
  attendees: z.array(z.object({ name: z.string().optional(), email: z.string().optional(), phone: z.string().optional() })).optional(),
});
const createSchema = eventFields.extend({ start_at: iso, end_at: iso });

/* ---------------- calendars ---------------- */

const DEFAULTS = {
  appointments: { name: "Appointments", color: "#039be5", sort: 0 },
  team: { name: "Team", color: "#33b679", sort: 1 },
  personal: { name: "Personal", color: "#8e24aa", sort: 2 },
} as const;

/** Shared "Appointments" calendar (created on demand). Used by Calendly sync + webhook. */
export async function appointmentsCalendarId(): Promise<string> {
  const sb = db();
  const find = async () => (await sb.from("calendars").select("id").eq("kind", "appointments").order("created_at").limit(1)).data?.[0]?.id as string | undefined;
  const found = await find();
  if (found) return found;
  const { data: c, error } = await sb.from("calendars").insert({ ...DEFAULTS.appointments, kind: "appointments", owner_id: null }).select("id").single();
  if (error) { const again = await find(); if (again) return again; throw new Error(error.message); }
  return c.id as string;
}

async function ensureDefaults(profile: Profile) {
  const sb = db();
  const { data: shared } = await sb.from("calendars").select("id,kind").in("kind", ["appointments", "team"]);
  const kinds = new Set((shared ?? []).map((c: any) => c.kind));
  const inserts: any[] = [];
  if (!kinds.has("appointments")) inserts.push({ ...DEFAULTS.appointments, kind: "appointments", owner_id: null });
  if (!kinds.has("team")) inserts.push({ ...DEFAULTS.team, kind: "team", owner_id: null });
  const { data: mine } = await sb.from("calendars").select("id").eq("kind", "personal").eq("owner_id", profile.id).limit(1);
  if (!mine?.length) inserts.push({ ...DEFAULTS.personal, kind: "personal", owner_id: profile.id });
  // one insert per row so a concurrent first load (blocked by the unique indexes in 0002_calendar.sql) can't drop the others
  for (const row of inserts) await sb.from("calendars").insert(row);
}

async function visibleCalendars(profile: Profile) {
  const sb = db();
  const { data, error } = await sb.from("calendars").select("*, owner:profiles(id,full_name,color)")
    .or(`owner_id.is.null,owner_id.eq.${profile.id}`).order("sort").order("created_at");
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return (data ?? []) as any[];
}

async function assertCanEditCalendar(profile: Profile, id: string) {
  const c = must(await db().from("calendars").select("*").eq("id", id).single()) as any;
  if (c.owner_id && c.owner_id !== profile.id && !isAdmin(profile)) throw new TRPCError({ code: "FORBIDDEN", message: "Not your calendar" });
  if (!c.owner_id && !isAdmin(profile)) throw new TRPCError({ code: "FORBIDDEN", message: "Only owners/admins can edit shared calendars" });
  return c;
}

async function assertCanSeeEvent(profile: Profile, id: string) {
  const e = must(await db().from("events").select("*, calendar:calendars(owner_id)").eq("id", id).single()) as any;
  const owner = e.calendar?.owner_id;
  if (owner && owner !== profile.id && !isAdmin(profile)) throw new TRPCError({ code: "FORBIDDEN", message: "Not your event" });
  return e;
}

/* ---------------- event side effects ---------------- */

async function onContactBooked(ev: any, userId: string | null, source: string) {
  if (!ev.contact_id) return;
  const sb = db();
  const when = new Date(ev.start_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
  await logActivity({
    type: "meeting", contact_id: ev.contact_id, company_id: ev.company_id ?? null, user_id: userId,
    subject: `Appointment: ${ev.title}`, body: `${when}${ev.location ? ` · ${ev.location}` : ""}`, meta: { event_id: ev.id, source },
  });
  const { data: c } = await sb.from("contacts").select("status").eq("id", ev.contact_id).single();
  if (c && (c.status === "lead" || c.status === "contacted")) await sb.from("contacts").update({ status: "booked" }).eq("id", ev.contact_id);
  await fireTrigger("appointment_booked", ev.contact_id, { event_id: ev.id, source, start_at: ev.start_at });
}

async function onStatusChange(ev: any, status: string, userId: string | null) {
  if (!ev.contact_id) return;
  const label = status === "no_show" ? "No-show" : status === "cancelled" ? "Cancelled" : status === "completed" ? "Completed" : status;
  await logActivity({ type: "meeting", contact_id: ev.contact_id, company_id: ev.company_id ?? null, user_id: userId, subject: `Appointment ${label.toLowerCase()}: ${ev.title}`, meta: { event_id: ev.id, status } });
  if (status === "cancelled") await fireTrigger("appointment_cancelled", ev.contact_id, { event_id: ev.id });
}

function normalize(input: z.infer<typeof eventFields>) {
  const v: any = { ...input };
  if (v.title !== undefined) v.title = v.title.trim() || "(No title)";
  if (v.start_at && v.end_at && new Date(v.end_at) <= new Date(v.start_at)) {
    v.end_at = new Date(new Date(v.start_at).getTime() + (v.all_day ? 86400000 : 1800000)).toISOString();
  }
  return v;
}

async function createEvent(profile: Profile, input: z.infer<typeof createSchema>) {
  const sb = db();
  const v = normalize(input);
  if (!v.calendar_id) {
    if (v.contact_id) v.calendar_id = await appointmentsCalendarId();
    else {
      await ensureDefaults(profile);
      const { data } = await sb.from("calendars").select("id").eq("kind", "personal").eq("owner_id", profile.id).limit(1);
      v.calendar_id = data?.[0]?.id ?? (await appointmentsCalendarId());
    }
  }
  if (v.contact_id && v.company_id === undefined) {
    const { data: c } = await sb.from("contacts").select("company_id").eq("id", v.contact_id).single();
    v.company_id = c?.company_id ?? null;
  }
  const ev = must(await sb.from("events").insert({ ...v, title: v.title ?? "(No title)", source: "manual", created_by: profile.id }).select(EVENT_SELECT).single()) as any;
  await onContactBooked(ev, profile.id, "calendar");
  return ev;
}

/* ---------------- Calendly ---------------- */

function phoneFromInvitee(inv: { text_reminder_number?: string | null; questions_and_answers?: { question: string; answer: string }[] | null }) {
  if (inv.text_reminder_number) return inv.text_reminder_number;
  const qa = (inv.questions_and_answers ?? []).find((q) => /phone|mobile|cell|number/i.test(q.question) && /\d{7,}/.test(q.answer.replace(/\D/g, "")));
  return qa?.answer ?? null;
}

export type CalendlyInvitee = { name?: string; email?: string; text_reminder_number?: string | null; questions_and_answers?: { question: string; answer: string }[] | null };
export type CalendlyEvent = { uri: string; name: string; start_time: string; end_time: string; status?: string; location?: { location?: string; join_url?: string; type?: string } | null };

/** Find or create the contact for a Calendly invitee. */
export async function contactForInvitee(inv: CalendlyInvitee) {
  const phone = phoneFromInvitee(inv);
  const existing = await findContact({ phone, email: inv.email ?? null });
  if (existing) return existing as any;
  const notes = (inv.questions_and_answers ?? []).map((q) => `${q.question}: ${q.answer}`).join("\n") || null;
  const { contact } = await createLead({ name: inv.name ?? inv.email ?? "Calendly guest", email: inv.email ?? null, phone, source: "calendly", notes });
  return contact as any;
}

/**
 * Upsert a Calendly scheduled event into `events` (keyed by calendly_uri).
 * Returns the row plus whether it was newly created so callers can fire triggers.
 */
export async function upsertCalendlyEvent(ev: CalendlyEvent, invitees: CalendlyInvitee[], opts: { cancelled?: boolean } = {}) {
  const sb = db();
  const primary = invitees[0];
  const contact = primary ? await contactForInvitee(primary) : null;
  const { data: existing } = await sb.from("events").select("*").eq("calendly_uri", ev.uri).maybeSingle();
  const prevAttendees: any[] = (existing?.attendees as any[]) ?? [];
  const attendees = [...prevAttendees];
  for (const i of invitees) {
    if (!attendees.some((a) => a.email && i.email && a.email.toLowerCase() === i.email.toLowerCase())) attendees.push({ name: i.name ?? "", email: i.email ?? "", phone: phoneFromInvitee(i) ?? undefined });
  }
  const loc = ev.location ?? {};
  const join = loc.join_url ?? (loc.location && /^https?:\/\//.test(loc.location) ? loc.location : null);
  const cancelled = opts.cancelled || ev.status === "canceled" || ev.status === "cancelled";
  const row: any = {
    title: contact ? `${ev.name} – ${fullName(contact)}` : ev.name,
    start_at: ev.start_time, end_at: ev.end_time,
    location: loc.location && !/^https?:\/\//.test(loc.location) ? loc.location : existing?.location ?? null,
    meeting_url: join ?? existing?.meeting_url ?? null,
    attendees,
    description: primary?.questions_and_answers?.length ? primary.questions_and_answers.map((q) => `${q.question}: ${q.answer}`).join("\n") : existing?.description ?? null,
  };
  if (contact) { row.contact_id = contact.id; row.company_id = contact.company_id ?? null; }
  if (cancelled) row.status = "cancelled";
  if (existing) {
    const updated = must(await sb.from("events").update(row).eq("id", existing.id).select().single());
    return { event: updated as any, created: false, contact, wasCancelled: existing.status === "cancelled" };
  }
  const calendar_id = await appointmentsCalendarId();
  const created = must(await sb.from("events").insert({ ...row, calendar_id, source: "calendly", calendly_uri: ev.uri, status: cancelled ? "cancelled" : "confirmed" }).select().single());
  return { event: created as any, created: true, contact, wasCancelled: false };
}

/* ---------------- router ---------------- */

export const calendarRouter = router({
  /** Calendars visible to the user; auto-creates Appointments/Team (shared) and Personal (per user). */
  calendars: protectedProcedure.query(async ({ ctx }) => {
    await ensureDefaults(ctx.profile);
    return visibleCalendars(ctx.profile);
  }),
  createCalendar: protectedProcedure.input(z.object({ name: z.string().min(1), color: z.string().default("#039be5"), shared: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      if (input.shared && !isAdmin(ctx.profile)) throw new TRPCError({ code: "FORBIDDEN", message: "Only owners/admins can create shared calendars" });
      return must(await ctx.db.from("calendars").insert({ name: input.name.trim(), color: input.color, kind: "custom", owner_id: input.shared ? null : ctx.profile.id, sort: 10 }).select().single());
    }),
  updateCalendar: protectedProcedure.input(z.object({ id: z.string().uuid(), name: z.string().min(1).optional(), color: z.string().optional(), sort: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanEditCalendar(ctx.profile, input.id);
      const { id, ...patch } = input;
      return must(await ctx.db.from("calendars").update(patch).eq("id", id).select().single());
    }),
  deleteCalendar: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const c = await assertCanEditCalendar(ctx.profile, input.id);
    if (c.kind === "appointments") throw new TRPCError({ code: "BAD_REQUEST", message: "The Appointments calendar receives bookings and can't be deleted" });
    must(await ctx.db.from("calendars").delete().eq("id", input.id));
    return { ok: true };
  }),

  /** Vehicles for a contact (editor's vehicle select). */
  vehicles: protectedProcedure.input(z.object({ contactId: z.string().uuid() })).query(async ({ ctx, input }) => {
    return must(await ctx.db.from("vehicles").select("id,year,make,model,plate").eq("contact_id", input.contactId).order("created_at")) as any[];
  }),
  /** Contact search for the "Search for people" box / editor (lightweight). */
  people: protectedProcedure.input(z.object({ q: z.string() })).query(async ({ ctx, input }) => {
    if (!input.q.trim()) return [];
    const s = `%${input.q.replace(/[%,()]/g, " ")}%`;
    let q = ctx.db.from("contacts").select("id,first_name,last_name,phone,email,status,company_id").or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`).limit(10);
    if (!isAdmin(ctx.profile)) q = q.eq("owner_id", ctx.profile.id);
    return must(await q) as any[];
  }),

  events: router({
    /** Events overlapping [start, end). */
    range: protectedProcedure.input(z.object({ start: iso, end: iso, calendarIds: z.array(z.string().uuid()).optional() }))
      .query(async ({ ctx, input }) => {
        const cals = (await visibleCalendars(ctx.profile)).map((c) => c.id as string);
        const ids = input.calendarIds ? input.calendarIds.filter((id) => cals.includes(id)) : cals;
        if (!ids.length) return [];
        return must(await ctx.db.from("events").select(EVENT_SELECT).in("calendar_id", ids).lt("start_at", input.end).gt("end_at", input.start).order("start_at").limit(2000)) as any[];
      }),
    search: protectedProcedure.input(z.object({ q: z.string().min(1), calendarIds: z.array(z.string().uuid()).optional() })).query(async ({ ctx, input }) => {
      const cals = (await visibleCalendars(ctx.profile)).map((c) => c.id as string);
      const ids = input.calendarIds ? input.calendarIds.filter((id) => cals.includes(id)) : cals;
      if (!ids.length) return [];
      const s = `%${input.q.replace(/[%,()]/g, " ")}%`;
      return must(await ctx.db.from("events").select(EVENT_SELECT).in("calendar_id", ids).or(`title.ilike.${s},description.ilike.${s},location.ilike.${s}`).order("start_at", { ascending: false }).limit(200)) as any[];
    }),
    /** Events for a contact or company (profile pages). */
    forRecord: protectedProcedure.input(z.object({ contactId: z.string().uuid().optional(), companyId: z.string().uuid().optional() })).query(async ({ ctx, input }) => {
      if (!input.contactId && !input.companyId) return [];
      let q = ctx.db.from("events").select(EVENT_SELECT).order("start_at", { ascending: false }).limit(100);
      q = input.contactId ? q.eq("contact_id", input.contactId) : q.eq("company_id", input.companyId!);
      return must(await q) as any[];
    }),
    get: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
      await assertCanSeeEvent(ctx.profile, input.id);
      return must(await ctx.db.from("events").select(EVENT_SELECT).eq("id", input.id).single()) as any;
    }),
    create: protectedProcedure.input(createSchema).mutation(({ ctx, input }) => createEvent(ctx.profile, input)),
    /** Quick-create from the grid popover. */
    quickCreate: protectedProcedure.input(z.object({ title: z.string(), start_at: iso, end_at: iso, all_day: z.boolean().default(false), calendar_id: z.string().uuid().nullable().optional() }))
      .mutation(({ ctx, input }) => createEvent(ctx.profile, input)),
    update: protectedProcedure.input(eventFields.extend({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const before = await assertCanSeeEvent(ctx.profile, input.id);
      const { id, ...rest } = input;
      const patch = normalize(rest);
      if (patch.start_at && !patch.end_at && new Date(before.end_at) <= new Date(patch.start_at)) patch.end_at = new Date(new Date(patch.start_at).getTime() + 1800000).toISOString();
      if (patch.contact_id && patch.company_id === undefined && patch.contact_id !== before.contact_id) {
        const { data: c } = await ctx.db.from("contacts").select("company_id").eq("id", patch.contact_id).single();
        patch.company_id = c?.company_id ?? null;
      }
      const after = must(await ctx.db.from("events").update(patch).eq("id", id).select(EVENT_SELECT).single()) as any;
      if (patch.contact_id && patch.contact_id !== before.contact_id) await onContactBooked(after, ctx.profile.id, "calendar");
      if (patch.status && patch.status !== before.status) await onStatusChange(after, patch.status, ctx.profile.id);
      return after;
    }),
    /** Drag to move / resize. */
    move: protectedProcedure.input(z.object({ id: z.string().uuid(), start_at: iso, end_at: iso, all_day: z.boolean().optional(), calendar_id: z.string().uuid().optional() }))
      .mutation(async ({ ctx, input }) => {
        await assertCanSeeEvent(ctx.profile, input.id);
        const { id, ...patch } = input;
        if (new Date(patch.end_at) <= new Date(patch.start_at)) throw new TRPCError({ code: "BAD_REQUEST", message: "End must be after start" });
        return must(await ctx.db.from("events").update(patch).eq("id", id).select(EVENT_SELECT).single()) as any;
      }),
    setStatus: protectedProcedure.input(z.object({ id: z.string().uuid(), status: STATUS })).mutation(async ({ ctx, input }) => {
      const before = await assertCanSeeEvent(ctx.profile, input.id);
      const after = must(await ctx.db.from("events").update({ status: input.status }).eq("id", input.id).select(EVENT_SELECT).single()) as any;
      if (before.status !== input.status) await onStatusChange(after, input.status, ctx.profile.id);
      return after;
    }),
    delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      await assertCanSeeEvent(ctx.profile, input.id);
      must(await ctx.db.from("events").delete().eq("id", input.id));
      return { ok: true };
    }),
  }),
  /* ---- Calendly ---- */
  syncCalendly: protectedProcedure.mutation(async ({ ctx }) => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const events = await calendly.scheduledEvents(since);
    let created = 0, updated = 0;
    for (const ev of events) {
      const invitees = await calendly.eventInvitees(ev.uri);
      const r = await upsertCalendlyEvent(ev, invitees);
      if (r.created) {
        created++;
        if (r.event.contact_id && r.event.status !== "cancelled") await onContactBooked(r.event, ctx.profile.id, "calendly");
      } else updated++;
    }
    await logActivity({ type: "system", user_id: ctx.profile.id, subject: "Calendly sync", body: `${created} new, ${updated} updated`, meta: { since } });
    return { created, updated, total: events.length };
  }),
  calendlyLinks: protectedProcedure.query(async () => {
    const types = await calendly.eventTypes();
    return types.filter((t) => t.active).map((t) => ({ uri: t.uri, name: t.name, url: t.scheduling_url, duration: t.duration, color: t.color }));
  }),
  connectCalendly: protectedProcedure.mutation(async () => {
    const w = await calendly.ensureWebhook();
    return { uri: w.uri, state: w.state, callback_url: w.callback_url };
  }),
});
