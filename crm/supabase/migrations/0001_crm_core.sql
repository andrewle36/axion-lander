-- Newport Smog CRM: core schema
create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- team ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'rep' check (role in ('owner','admin','rep')),
  active boolean not null default false,
  commission_rate numeric(6,4) not null default 0.10,
  commission_months int not null default 12,
  color text not null default '#4f46e5',
  rr_paused boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.team_invites (
  email text primary key,
  role text not null default 'rep' check (role in ('owner','admin','rep')),
  full_name text,
  commission_rate numeric(6,4) not null default 0.10,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.team_invites;
begin
  select * into inv from public.team_invites where lower(email) = lower(new.email);
  if lower(new.email) = 'andrewle36@gmail.com' then
    insert into public.profiles(id,email,full_name,role,active) values (new.id,new.email,'Andrew Le','owner',true)
    on conflict (id) do nothing;
  elsif inv.email is not null then
    insert into public.profiles(id,email,full_name,role,active,commission_rate)
    values (new.id,new.email,coalesce(inv.full_name,split_part(new.email,'@',1)),inv.role,true,inv.commission_rate)
    on conflict (id) do nothing;
    delete from public.team_invites where email = inv.email;
  else
    insert into public.profiles(id,email,full_name,active) values (new.id,new.email,split_part(new.email,'@',1),false)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- settings ----------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- catalog ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  category text not null check (category in ('smog','retest','dmv','vin','other')),
  vehicle_category text,
  price numeric(10,2) not null default 0,
  cert_fee numeric(10,2) not null default 0,
  cost numeric(10,2) not null default 0,
  active boolean not null default true,
  sort int not null default 0
);

-- ---------- accounts / people ----------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'dealer' check (kind in ('dealer','rental','repair','exotic','fleet','storage','other')),
  phone text, email text, website text, address text,
  contact_name text,
  smog_price numeric(10,2),
  old_car_price numeric(10,2),
  vin_price numeric(10,2),
  billing_method text not null default 'monthly_invoice' check (billing_method in ('monthly_invoice','per_job','card_on_file','zelle','check','cash')),
  payment_terms_days int not null default 15,
  status text not null default 'prospect' check (status in ('prospect','onboarding','active','paused','churned')),
  owner_id uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  notes text,
  mercury_customer_id text,
  ai_summary text, ai_summary_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  email text, phone text,
  company_id uuid references public.companies(id) on delete set null,
  title text,
  kind text not null default 'driver' check (kind in ('driver','partner_contact','lead')),
  source text,
  status text not null default 'lead' check (status in ('lead','contacted','booked','customer','lost')),
  owner_id uuid references public.profiles(id) on delete set null,
  tags text[] not null default '{}',
  dnd_sms boolean not null default false,
  dnd_email boolean not null default false,
  landing_page_id uuid, variant_id uuid,
  utm jsonb not null default '{}',
  last_contacted_at timestamptz,
  next_follow_up date,
  notes text,
  ai_summary text, ai_summary_at timestamptz,
  legacy_lead_id bigint,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
create index contacts_phone_idx on public.contacts(phone);
create index contacts_email_idx on public.contacts(lower(email));
create index contacts_company_idx on public.contacts(company_id);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  year int, make text, model text, vin text, plate text,
  category text not null default 'passenger' check (category in ('passenger','van','exotic','sprinter','old','old_luxury')),
  last_smog_at date,
  next_due_at date,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- jobs (smog / DMV tickets) ----------
create sequence public.job_number_seq start 10001;
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.job_number_seq') unique,
  performed_at timestamptz not null default now(),
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  description text,
  price numeric(10,2) not null default 0,
  cert_fee numeric(10,2) not null default 0,
  result text not null default 'na' check (result in ('pass','fail','na')),
  payment_method text not null default 'card' check (payment_method in ('cash','card','check','zelle','invoice')),
  paid boolean not null default true,
  invoice_id uuid,
  technician_id uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index jobs_performed_idx on public.jobs(performed_at);
create index jobs_company_idx on public.jobs(company_id);

-- ---------- deals & onboarding ----------
create sequence public.deal_number_seq start 1001;
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.deal_number_seq') unique,
  name text not null,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  stage text not null default 'lead' check (stage in ('lead','qualified','proposal','contract_sent','won','lost')),
  est_cars_per_month int not null default 0,
  smog_price numeric(10,2),
  value_monthly numeric(12,2) not null default 0,
  owner_id uuid references public.profiles(id) on delete set null,
  expected_close date,
  closed_at timestamptz,
  lost_reason text,
  position double precision not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

create table public.onboarding_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  key text not null,
  label text not null,
  done boolean not null default false,
  done_at timestamptz,
  sort int not null default 0,
  unique (company_id, key)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  pandadoc_id text unique,
  status text not null default 'draft' check (status in ('draft','sent','viewed','completed','declined','voided','error')),
  recipient_email text, recipient_name text,
  sent_at timestamptz, viewed_at timestamptz, completed_at timestamptz,
  error text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- billing ----------
create sequence public.invoice_number_seq start 5001;
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number int not null default nextval('public.invoice_number_seq') unique,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  period_start date, period_end date,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','sent','paid','partial','overdue','void')),
  mercury_invoice_id text, pay_url text,
  sent_at timestamptz, paid_at timestamptz,
  memo text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.jobs add constraint jobs_invoice_fk foreign key (invoice_id) references public.invoices(id) on delete set null;

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  description text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0,
  amount numeric(12,2) not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  amount numeric(12,2) not null,
  method text not null default 'ach',
  source text not null default 'manual' check (source in ('manual','mercury','job')),
  received_at timestamptz not null default now(),
  mercury_txn_id text,
  note text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- bank transactions (Mercury + manual expenses)
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  mercury_id text unique,
  account_name text,
  posted_at timestamptz not null default now(),
  amount numeric(12,2) not null, -- positive = money in, negative = money out
  counterparty text,
  description text,
  category text not null default 'uncategorized' check (category in ('revenue','cogs','payroll','rent','utilities','marketing','software','commission','supplies','insurance','fees','other_opex','interest','taxes','depreciation','owner_draw','transfer','uncategorized')),
  status text not null default 'posted',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index transactions_posted_idx on public.transactions(posted_at);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  base_amount numeric(12,2) not null,
  rate numeric(6,4) not null,
  amount numeric(12,2) not null,
  status text not null default 'earned' check (status in ('earned','approved','paid','void')),
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  note text,
  is_demo boolean not null default false
);

-- ---------- communications ----------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('note','call','sms','email','meeting','stage_change','job','payment','contract','task','system','ai')),
  direction text check (direction in ('in','out')),
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  subject text,
  body text,
  meta jsonb not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index activities_contact_idx on public.activities(contact_id, created_at desc);
create index activities_company_idx on public.activities(company_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms','email')),
  direction text not null check (direction in ('in','out')),
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  from_addr text, to_addr text,
  subject text, body text, html text,
  status text not null default 'queued',
  provider_id text,
  error text,
  user_id uuid references public.profiles(id) on delete set null,
  automation_run_id uuid,
  read_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_contact_idx on public.messages(contact_id, created_at desc);
create index messages_provider_idx on public.messages(provider_id);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  direction text not null check (direction in ('in','out')),
  from_number text, to_number text,
  status text not null default 'initiated',
  duration_sec int not null default 0,
  recording_url text,
  transcript text,
  ai_summary text,
  notes text,
  telnyx_call_id text,
  user_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_demo boolean not null default false
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  assignee_id uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- calendar ----------
create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#039be5',
  owner_id uuid references public.profiles(id) on delete cascade,
  kind text not null default 'custom' check (kind in ('appointments','team','personal','custom')),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid references public.calendars(id) on delete cascade,
  title text not null default '(No title)',
  description text, location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  color text,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed','tentative','cancelled','no_show','completed')),
  source text not null default 'manual' check (source in ('manual','calendly','landing','automation')),
  calendly_uri text unique,
  meeting_url text,
  attendees jsonb not null default '[]',
  recurrence text,
  created_by uuid references public.profiles(id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_range_idx on public.events(start_at, end_at);

-- ---------- landing pages ----------
create table public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content jsonb not null default '{}',
  routing_mode text not null default 'round_robin' check (routing_mode in ('round_robin','weighted','least_loaded','specific','none')),
  routing_reps uuid[] not null default '{}',
  routing_weights jsonb not null default '{}',
  rr_pointer int not null default 0,
  thank_you_message text,
  redirect_url text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger landing_pages_touch before update on public.landing_pages for each row execute function public.touch_updated_at();

create table public.landing_variants (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.landing_pages(id) on delete cascade,
  name text not null,
  weight int not null default 50,
  content jsonb not null default '{}',
  active boolean not null default true,
  is_control boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.page_events (
  id bigint generated always as identity primary key,
  page_id uuid references public.landing_pages(id) on delete cascade,
  variant_id uuid references public.landing_variants(id) on delete cascade,
  visitor_id text,
  type text not null check (type in ('view','submit','cta_click','call_click')),
  meta jsonb not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index page_events_page_idx on public.page_events(page_id, created_at);

alter table public.contacts add constraint contacts_lp_fk foreign key (landing_page_id) references public.landing_pages(id) on delete set null;
alter table public.contacts add constraint contacts_variant_fk foreign key (variant_id) references public.landing_variants(id) on delete set null;

-- ---------- automations ----------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  trigger_type text not null default 'lead_created',
  trigger_config jsonb not null default '{}',
  graph jsonb not null default '{"nodes":[],"edges":[]}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger automations_touch before update on public.automations for each row execute function public.touch_updated_at();

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  status text not null default 'running' check (status in ('running','waiting','completed','failed','stopped')),
  current_node text,
  next_run_at timestamptz not null default now(),
  context jsonb not null default '{}',
  log jsonb not null default '[]',
  error text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automation_runs_due_idx on public.automation_runs(status, next_run_at);
alter table public.messages add constraint messages_run_fk foreign key (automation_run_id) references public.automation_runs(id) on delete set null;

-- ---------- webhook log ----------
create table public.webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_type text,
  payload jsonb not null,
  processed boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);

-- ---------- RLS: lock everything; the app server uses the service role ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public' and tablename <> 'leads' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- signed-in active staff may read their own profile (used by middleware)
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
