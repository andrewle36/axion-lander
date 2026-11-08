-- 0002: automations helpers (NOT applied automatically; review then run).

-- Faster execution lists / stats.
create index if not exists automation_runs_automation_idx on public.automation_runs(automation_id, created_at desc);
create index if not exists automation_runs_contact_idx on public.automation_runs(contact_id, status);
create index if not exists messages_run_idx on public.messages(automation_run_id) where automation_run_id is not null;

-- Keep automation_runs.updated_at fresh (the engine also sets it explicitly).
drop trigger if exists automation_runs_touch on public.automation_runs;
create trigger automation_runs_touch before update on public.automation_runs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Production scheduler: call /api/cron/tick every minute with pg_cron + pg_net.
-- Vercel Hobby crons only run hourly (vercel.json), so this gives minute-level
-- precision for "Wait 5 minutes" steps. Replace <APP_URL> and <CRON_SECRET>.
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'crm-tick-every-minute',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<APP_URL>/api/cron/tick',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 55000
--   );
--   $$
-- );
--
-- To remove: select cron.unschedule('crm-tick-every-minute');
