import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
import { db } from "@/lib/supabase/admin";
import { env, integrationStatus } from "@/lib/env";
import { processDue, fireSmogDue } from "@/server/services/automations";
import { markOverdue, generateMonthlyInvoices, syncMercury } from "@/server/services/billing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOUR = 36e5;

async function getSetting(key: string): Promise<any> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSetting(key: string, value: unknown) {
  await db().from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function authorized(req: NextRequest) {
  if (!env.cronSecret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${env.cronSecret}`) return true;
  return req.nextUrl.searchParams.get("secret") === env.cronSecret;
}

async function tick(req: NextRequest) {
  if (!env.cronSecret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const started = Date.now();
  const summary: Record<string, any> = { at: new Date().toISOString() };

  try { summary.processed_runs = await processDue(100); } catch (e) { summary.processed_runs_error = errMsg(e); }

  // Hourly jobs
  try {
    const last = await getSetting("last_hourly");
    if (!last || Date.now() - new Date(String(last)).getTime() >= HOUR - 60_000) {
      await setSetting("last_hourly", new Date().toISOString());
      try { summary.overdue_marked = await markOverdue(); } catch (e) { summary.overdue_error = errMsg(e); }
    } else summary.hourly = "skipped";
  } catch (e) { summary.hourly_error = errMsg(e); }

  // Daily jobs
  try {
    const today = format(new Date(), "yyyy-MM-dd");
    const last = await getSetting("last_daily");
    if (last !== today) {
      await setSetting("last_daily", today);
      try { summary.smog_due_enrolled = await fireSmogDue(); } catch (e) { summary.smog_due_error = errMsg(e); }
      if (new Date().getDate() === 1) {
        try {
          const month = format(new Date(), "yyyy-MM");
          if ((await getSetting("last_monthly_invoice")) !== month) {
            await setSetting("last_monthly_invoice", month);
            summary.monthly_invoices = await generateMonthlyInvoices(undefined, { send: true });
          } else summary.monthly_invoices = "already generated";
        } catch (e) { summary.monthly_invoices_error = errMsg(e); }
      }
      if (integrationStatus().mercury) {
        try { summary.mercury = await syncMercury(); } catch (e) { summary.mercury_error = errMsg(e); }
      }
    } else summary.daily = "skipped";
  } catch (e) { summary.daily_error = errMsg(e); }

  summary.ms = Date.now() - started;
  return NextResponse.json(summary);
}

export const GET = tick;
export const POST = tick;
