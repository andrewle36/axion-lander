import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { fullName, fmtPhone } from "@/lib/utils";

export const searchRouter = router({
  global: protectedProcedure.input(z.object({ q: z.string() })).query(async ({ ctx, input }) => {
    const q = input.q.trim().replace(/[%,()]/g, " ");
    if (q.length < 2) return { contacts: [], companies: [], deals: [] };
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    const [c, co, d, v] = await Promise.all([
      ctx.db.from("contacts").select("id, first_name, last_name, email, phone")
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}${digits.length >= 3 ? `,phone.ilike.%${digits}%` : ""}`).limit(8),
      ctx.db.from("companies").select("id, name, kind, phone").or(`name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`).limit(6),
      ctx.db.from("deals").select("id, number, name, stage").or(`name.ilike.${like}${/^\d+$/.test(digits) && digits.length >= 3 ? `,number.eq.${digits}` : ""}`).limit(5),
      ctx.db.from("vehicles").select("contact_id, company_id, year, make, model, vin, plate").or(`vin.ilike.${like},plate.ilike.${like}`).limit(5),
    ]);
    const contacts = (c.data ?? []).map((x) => ({ id: x.id, label: fullName(x), sub: x.email ?? fmtPhone(x.phone) }));
    for (const veh of v.data ?? []) if (veh.contact_id) contacts.push({ id: veh.contact_id, label: `${veh.year ?? ""} ${veh.make ?? ""} ${veh.model ?? ""}`.trim(), sub: veh.vin ?? veh.plate ?? "" });
    return {
      contacts,
      companies: (co.data ?? []).map((x) => ({ id: x.id, label: x.name, sub: x.kind })),
      deals: (d.data ?? []).map((x) => ({ id: x.id, number: x.number, label: x.name, sub: x.stage })),
    };
  }),
});
