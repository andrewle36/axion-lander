import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { IntegrationError } from "@/lib/env";

export type Profile = {
  id: string; email: string; full_name: string | null; role: "owner" | "admin" | "rep"; active: boolean;
  commission_rate: number; commission_months: number; color: string; phone: string | null; rr_paused: boolean;
};

export async function createContext() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  let profile: Profile | null = null;
  if (user) {
    const { data } = await db().from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = (data as Profile) ?? null;
  }
  return { user, profile, db: db() };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return { ...shape, data: { ...shape.data, zodError: error.cause instanceof ZodError ? error.cause.flatten() : null } };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const mapErrors = t.middleware(async ({ next }) => {
  const r = await next();
  if (!r.ok && r.error.cause instanceof IntegrationError) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: r.error.cause.message, cause: r.error.cause });
  }
  return r;
});

export const protectedProcedure = t.procedure.use(mapErrors).use(({ ctx, next }) => {
  if (!ctx.user || !ctx.profile) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  if (!ctx.profile.active) throw new TRPCError({ code: "FORBIDDEN", message: "Your account is waiting for approval by the owner." });
  return next({ ctx: { ...ctx, user: ctx.user, profile: ctx.profile } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.profile.role === "rep") throw new TRPCError({ code: "FORBIDDEN", message: "Owner/admin only" });
  return next();
});

/** Throw a readable error when Supabase returns one. */
export function must<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: r.error.message });
  return r.data as NonNullable<T>;
}
export const isAdmin = (p: Profile) => p.role !== "rep";
