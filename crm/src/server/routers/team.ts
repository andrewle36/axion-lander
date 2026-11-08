import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, must } from "@/server/trpc";
import { env } from "@/lib/env";

export const teamRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.profile),
  list: protectedProcedure.query(async ({ ctx }) =>
    must(await ctx.db.from("profiles").select("*").order("created_at"))),
  invites: adminProcedure.query(async ({ ctx }) => must(await ctx.db.from("team_invites").select("*").order("created_at"))),
  invite: adminProcedure.input(z.object({ email: z.string().email(), full_name: z.string().optional(), role: z.enum(["admin", "rep"]), commission_rate: z.number().min(0).max(1) }))
    .mutation(async ({ ctx, input }) => {
      must(await ctx.db.from("team_invites").upsert({ ...input, email: input.email.toLowerCase(), invited_by: ctx.profile.id }));
      const { error } = await ctx.db.auth.admin.inviteUserByEmail(input.email, { redirectTo: `${env.appUrl}/auth/callback` });
      if (error && !/already/i.test(error.message)) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      return { ok: true };
    }),
  cancelInvite: adminProcedure.input(z.object({ email: z.string() })).mutation(async ({ ctx, input }) => {
    must(await ctx.db.from("team_invites").delete().eq("email", input.email)); return { ok: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.string().uuid(), full_name: z.string().optional(), phone: z.string().nullable().optional(), color: z.string().optional(),
    role: z.enum(["owner", "admin", "rep"]).optional(), active: z.boolean().optional(), commission_rate: z.number().min(0).max(1).optional(),
    commission_months: z.number().int().min(0).max(120).optional(), rr_paused: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { id, ...patch } = input;
    const self = id === ctx.profile.id;
    const admin = ctx.profile.role !== "rep";
    if (!admin && (!self || patch.role || patch.active !== undefined || patch.commission_rate !== undefined || patch.commission_months !== undefined))
      throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can change that." });
    if (patch.role === "owner" && ctx.profile.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can grant owner." });
    return must(await ctx.db.from("profiles").update(patch).eq("id", id).select().single());
  }),
});
