-- Calendar hardening (optional, not required by the app code).
-- Prevents duplicate default calendars when two requests auto-create them at the same time.
create unique index if not exists calendars_one_appointments on public.calendars(kind) where kind = 'appointments';
create unique index if not exists calendars_one_team on public.calendars(kind) where kind = 'team' and owner_id is null;
create unique index if not exists calendars_one_personal on public.calendars(owner_id) where kind = 'personal';
create index if not exists events_calendar_idx on public.events(calendar_id, start_at);
create index if not exists events_contact_idx on public.events(contact_id, start_at desc);
create index if not exists events_company_idx on public.events(company_id, start_at desc);
