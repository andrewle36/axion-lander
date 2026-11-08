-- Newport Smog CRM: real catalog + partner accounts (from the shop price sheet) and wipeable demo data.

-- ---------- service catalog (real) ----------
insert into public.services (code, name, category, vehicle_category, price, cert_fee, cost, sort) values
  ('smog_passenger', 'Smog check: passenger car', 'smog', 'passenger', 73, 8.25, 0, 1),
  ('smog_van', 'Smog check: van', 'smog', 'van', 83, 8.25, 0, 2),
  ('smog_exotic', 'Smog check: exotic', 'smog', 'exotic', 93, 8.25, 0, 3),
  ('smog_sprinter', 'Smog check: Sprinter van', 'smog', 'sprinter', 93, 8.25, 0, 4),
  ('smog_old', 'Smog check: old car (pre-2000)', 'smog', 'old', 118, 8.25, 0, 5),
  ('smog_old_luxury', 'Smog check: old luxury', 'smog', 'old_luxury', 198, 8.25, 0, 6),
  ('retest', 'Retest', 'retest', null, 43, 8.25, 0, 7),
  ('retest_old', 'Retest: old car', 'retest', 'old', 63, 8.25, 0, 8),
  ('vin_verify', 'VIN verification', 'vin', null, 69, 0, 0, 9),
  ('dmv_renewal', 'Registration renewal (service fee)', 'dmv', null, 30, 0, 0, 10),
  ('dmv_title', 'Title transfer (service fee)', 'dmv', null, 40, 0, 0, 11),
  ('dmv_nonres', 'Non-resident transfer (service fee)', 'dmv', null, 45, 0, 0, 12),
  ('dmv_dup', 'Duplicate title / plates / sticker (service fee)', 'dmv', null, 30, 0, 0, 13)
on conflict (code) do nothing;

insert into public.settings (key, value) values
  ('booking_url', '"https://checkin.newportsmog.com/s/newport/book"'),
  ('ai_models', '{"primary":"x-ai/grok-4","fast":"x-ai/grok-4-fast"}')
on conflict (key) do nothing;

insert into public.calendars (name, color, kind, sort) values
  ('Appointments', '#039be5', 'appointments', 0), ('Team', '#33b679', 'team', 1)
on conflict do nothing;

-- ---------- real partner accounts ----------
insert into public.companies (name, kind, contact_name, smog_price, old_car_price, vin_price, billing_method, status, tags, notes) values
  ('EuroCar', 'dealer', null, 81.25, null, null, 'monthly_invoice', 'active', '{}', 'Bill end of month'),
  ('Fletcher Jones Mercedes + Audi', 'dealer', null, 81.25, null, null, 'monthly_invoice', 'active', '{}', 'Bill end of month'),
  ('Aston Martin Newport Beach', 'dealer', null, 91.25, null, null, 'monthly_invoice', 'active', '{}', 'Bill end of month'),
  ('Ferrari of Newport Beach', 'dealer', null, 81.25, null, 69, 'monthly_invoice', 'active', '{}', 'Bill end of month. VIN verification $69'),
  ('Silver Arrow Cars', 'dealer', null, 101.25, 206.25, 99, 'per_job', 'active', '{billing-unconfirmed}', 'Smog $101.25, old cars $206.25, VIN $99'),
  ('Eurowest', 'dealer', null, 81.25, null, null, 'monthly_invoice', 'active', '{}', 'Bill end of month'),
  ('Scudaria Motor Cars', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('DDK Motors', 'dealer', 'Don (sons Robert and Marc)', 71.25, 96.25, null, 'check', 'active', '{}', 'Pays by check'),
  ('OC Benz', 'dealer', null, 71.25, 96.25, null, 'card_on_file', 'active', '{}', 'Card on file'),
  ('Vroomhub LLC', 'dealer', null, 60, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('House of Cars Empire', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Carbeeco', 'dealer', null, 60, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Go Rental', 'rental', null, 81.25, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Ride N Shine Motors', 'dealer', null, 66.25, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('A1 Mechanic', 'repair', null, 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('5 Star / CA Car Pros', 'dealer', null, 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Karma Newport Beach', 'dealer', null, 81.25, null, 69, 'card_on_file', 'active', '{}', 'Credit card. VIN $69'),
  ('Hiro Mechanic', 'repair', null, 71.25, 86.25, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('SNB Auto Group', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Glidewell', 'fleet', null, 81.25, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Jamcorp', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Promotors', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Pro Motor Cars', 'dealer', 'Matt', 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('United Auto', 'dealer', 'Nelson, Jack', 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Ash Auto', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('PCH', 'dealer', 'Sean', 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Sunset Elite Auto', 'dealer', 'Mohsen Heydari', 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Motor Cars of OC', 'dealer', null, 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Airport Auto Center', 'repair', null, 60, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('AAG Exotics', 'exotic', null, 81.25, null, 69, 'per_job', 'active', '{billing-unconfirmed}', '81.25 all cars, VIN $69'),
  ('OC Auto Firm', 'dealer', null, 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('OC Auto Source', 'dealer', null, 71.25, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Coast Auto Motor', 'dealer', 'David', 45, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Iluuso', 'dealer', null, 81.25, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('OBZU', 'dealer', null, 70, null, null, 'card_on_file', 'active', '{}', 'Dealer, credit card'),
  ('Marathon / Performance Auto', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Enterprise Rentals', 'rental', null, 81.25, null, 30, 'monthly_invoice', 'active', '{}', 'Bill end of month. VIN $30'),
  ('Hopalong Storage', 'storage', 'Mike', null, null, null, 'per_job', 'active', '{billing-unconfirmed}', 'Regular pricing (depends on car)'),
  ('Carmo Auto Group', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Alex Auto', 'dealer', null, null, null, null, 'per_job', 'prospect', '{billing-unconfirmed}', 'Price not set on the sheet'),
  ('Newport Lexus', 'dealer', null, 81.25, null, null, 'card_on_file', 'active', '{}', 'Regular prices, credit card (zip 92660). Card details are NOT stored in the CRM.'),
  ('Empire Exotic Inc', 'exotic', null, 60, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Car DL', 'dealer', null, 60, null, null, 'zelle', 'active', '{}', 'Pays by Zelle'),
  ('Newport Fleet', 'fleet', null, 50, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('Automax', 'repair', null, 81.25, 96.25, null, 'check', 'active', '{}', 'Sends check later'),
  ('Khelanis Car Inc', 'dealer', null, 60, null, null, 'card_on_file', 'active', '{}', 'Credit card'),
  ('654 Limo', 'fleet', null, 65, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Angel Auto Center', 'repair', 'EMO', 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Auto Market', 'dealer', null, 60, 80, null, 'per_job', 'active', '{billing-unconfirmed}', 'Older cars $80'),
  ('Concept Motor Cars', 'dealer', 'Sad', 60, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Janpo', 'dealer', null, 50, null, null, 'per_job', 'active', '{billing-unconfirmed}', null),
  ('Rivian', 'dealer', null, null, null, 69, 'per_job', 'active', '{billing-unconfirmed}', 'VIN verifications $69');

-- migrate the 2 existing website leads
insert into public.contacts (first_name, last_name, email, phone, source, status, notes, next_follow_up, legacy_lead_id, kind, created_at)
select split_part(name, ' ', 1), nullif(substr(name, length(split_part(name, ' ', 1)) + 2), ''), email, phone, coalesce(source, 'website'),
  case status when 'won' then 'customer' else status end, concat_ws(E'\n', business, notes), next_follow_up, id, 'lead', created_at
from public.leads
where not exists (select 1 from public.contacts c where c.legacy_lead_id = leads.id);

-- ---------- DEMO DATA (is_demo = true; wipe from Settings → Data) ----------
do $$
declare
  firsts text[] := array['James','Maria','David','Sophia','Michael','Emily','Daniel','Olivia','Kevin','Ava','Brian','Mia','Jason','Isabella','Ryan','Chloe','Eric','Grace','Steven','Hannah','Tony','Lily','Mark','Natalie','Chris','Zoe','Alex','Ella','Sam','Victoria'];
  lasts text[] := array['Nguyen','Garcia','Smith','Kim','Johnson','Lee','Martinez','Brown','Tran','Davis','Lopez','Wilson','Pham','Anderson','Hernandez','Clark','Patel','Lewis','Chen','Walker'];
  makes text[] := array['Toyota','Honda','Tesla','BMW','Mercedes-Benz','Lexus','Ford','Chevrolet','Audi','Porsche','Nissan','Subaru','Jeep','Mazda','Hyundai'];
  models text[] := array['Camry','Civic','Model 3','X5','C300','RX 350','F-150','Silverado','Q5','911','Altima','Outback','Wrangler','CX-5','Elantra'];
  sources text[] := array['google','yelp','walk-in','referral','dealer','facebook','website','phone'];
  statuses text[] := array['customer','customer','customer','customer','lead','contacted','booked','lost'];
  cid uuid; vid uuid; co record; svc record; i int; d date; n int; k int; price numeric; cert numeric; res text; pm text;
  s_pass uuid; s_van uuid; s_exotic uuid; s_old uuid; s_retest uuid; s_vin uuid; s_dmv uuid;
  appt uuid; inv uuid; total numeric; mstart date; demo_lp uuid; v1 uuid; v2 uuid;
begin
  perform setseed(0.42);
  select id into s_pass from services where code='smog_passenger';
  select id into s_van from services where code='smog_van';
  select id into s_exotic from services where code='smog_exotic';
  select id into s_old from services where code='smog_old';
  select id into s_retest from services where code='retest';
  select id into s_vin from services where code='vin_verify';
  select id into s_dmv from services where code='dmv_renewal';
  select id into appt from calendars where kind='appointments' limit 1;

  -- demo landing page (draft, so nothing public)
  insert into landing_pages (slug, name, status, content, is_demo, thank_you_message)
  values ('star-smog-demo', 'STAR Smog Check (demo)', 'draft',
    '{"hero":{"eyebrow":"STAR certified · Test only","headline":"Fast, honest smog checks in Costa Mesa","subheadline":"In and out in about 15 minutes. No repairs, so no upsell.","cta_label":"Book my smog check"},"bullets":["STAR certified station, BAR # ARD 269691","Passenger cars $73 + $8.25 certificate","Open Mon–Fri 8–6, Sat 8–4"],"form":{"fields":["name","phone","email","vehicle"],"submit_label":"Get my spot"},"phone":"(714) 436-1700"}',
    true, 'Thanks! We''ll text you shortly to confirm your time.')
  returning id into demo_lp;
  insert into landing_variants (page_id, name, weight, is_control, content, is_demo) values (demo_lp, 'Control', 50, true, '{}', true) returning id into v1;
  insert into landing_variants (page_id, name, weight, content, is_demo) values (demo_lp, 'B: price-led headline', 50, '{"hero":{"headline":"$73 STAR smog checks. 15 minutes. No upsell."}}', true) returning id into v2;
  insert into page_events (page_id, variant_id, visitor_id, type, created_at, is_demo)
  select demo_lp, case when random() < 0.5 then v1 else v2 end, md5(random()::text), case when random() < 0.08 then 'submit' else 'view' end, now() - (random() * interval '30 days'), true
  from generate_series(1, 900);

  -- retail drivers with vehicles + history
  for i in 1..140 loop
    insert into contacts (first_name, last_name, phone, email, source, status, kind, is_demo, created_at, last_contacted_at, landing_page_id, variant_id)
    values (firsts[1 + floor(random()*30)::int], lasts[1 + floor(random()*20)::int],
      '+1714555' || lpad((1000 + i)::text, 4, '0'),
      case when random() < 0.7 then 'demo' || i || '@example.com' end,
      sources[1 + floor(random()*8)::int], statuses[1 + floor(random()*8)::int], 'driver', true,
      now() - (random() * interval '200 days'), now() - (random() * interval '30 days'),
      case when i % 9 = 0 then demo_lp end, case when i % 9 = 0 then (case when i % 2 = 0 then v1 else v2 end) end)
    returning id into cid;
    k := floor(random()*15)::int;
    insert into vehicles (contact_id, year, make, model, vin, plate, category, last_smog_at, next_due_at, is_demo)
    values (cid, 1995 + floor(random()*30)::int, makes[1+k], models[1+k], upper(substr(md5(random()::text), 1, 17)), upper(substr(md5(random()::text), 1, 7)),
      case when random() < 0.08 then 'old' when random() < 0.1 then 'exotic' when random() < 0.1 then 'van' else 'passenger' end,
      current_date - (floor(random()*700))::int, current_date + (floor(random()*400) - 30)::int, true)
    returning id into vid;
  end loop;

  -- 6 months of retail jobs (~12/day) + partner cars
  for d in select generate_series(current_date - 180, current_date, interval '1 day')::date loop
    if extract(dow from d) = 0 then continue; end if;
    n := case when extract(dow from d) = 6 then 8 else 12 end + floor(random()*6)::int;
    for i in 1..n loop
      select c.id as cid, v.id as vid, v.category into co from contacts c join vehicles v on v.contact_id = c.id where c.is_demo order by random() limit 1;
      res := case when random() < 0.9 then 'pass' else 'fail' end;
      if random() < 0.12 then
        price := 30; cert := 0; res := 'na';
        insert into jobs (performed_at, contact_id, vehicle_id, service_id, price, cert_fee, result, payment_method, paid, is_demo)
        values (d + time '08:00' + (random() * interval '9 hours'), co.cid, co.vid, s_dmv, price, cert, res, 'card', true, true);
      else
        price := case co.category when 'old' then 118 when 'exotic' then 93 when 'van' then 83 else 73 end;
        cert := case when res = 'pass' then 8.25 else 0 end;
        pm := (array['card','card','card','cash','zelle'])[1 + floor(random()*5)::int];
        insert into jobs (performed_at, contact_id, vehicle_id, service_id, price, cert_fee, result, payment_method, paid, is_demo)
        values (d + time '08:00' + (random() * interval '9 hours'), co.cid, co.vid,
          case co.category when 'old' then s_old when 'exotic' then s_exotic when 'van' then s_van else s_pass end, price, cert, res, pm, true, true);
      end if;
    end loop;
    -- partner cars
    for co in select id, smog_price, billing_method from companies where not is_demo and status = 'active' and smog_price is not null and random() < 0.18 loop
      k := 1 + floor(random()*3)::int;
      for i in 1..k loop
        insert into vehicles (company_id, year, make, model, vin, category, last_smog_at, is_demo)
        values (co.id, 2012 + floor(random()*12)::int, makes[1 + floor(random()*15)::int], models[1 + floor(random()*15)::int], upper(substr(md5(random()::text), 1, 17)), 'passenger', d, true)
        returning id into vid;
        insert into jobs (performed_at, company_id, vehicle_id, service_id, price, cert_fee, result, payment_method, paid, is_demo)
        values (d + time '08:30' + (random() * interval '8 hours'), co.id, vid, s_pass, greatest(co.smog_price - 8.25, 0), 8.25, 'pass',
          case co.billing_method when 'monthly_invoice' then 'invoice' when 'zelle' then 'zelle' when 'check' then 'check' else 'card' end,
          co.billing_method <> 'monthly_invoice', true);
      end loop;
    end loop;
  end loop;

  -- month-end invoices for monthly-billed partners (previous 5 months), most paid
  for mstart in select generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date) - interval '1 month', interval '1 month')::date loop
    for co in select id, payment_terms_days from companies where billing_method = 'monthly_invoice' and not is_demo loop
      select coalesce(sum(price + cert_fee), 0) into total from jobs where company_id = co.id and invoice_id is null and performed_at >= mstart and performed_at < mstart + interval '1 month';
      if total = 0 then continue; end if;
      insert into invoices (company_id, period_start, period_end, issue_date, due_date, subtotal, total, amount_paid, status, sent_at, paid_at, memo, is_demo)
      values (co.id, mstart, (mstart + interval '1 month' - interval '1 day')::date, (mstart + interval '1 month')::date, (mstart + interval '1 month')::date + co.payment_terms_days, total, total,
        case when mstart < date_trunc('month', current_date) - interval '1 month' then total else 0 end,
        case when mstart < date_trunc('month', current_date) - interval '1 month' then 'paid' else 'sent' end,
        (mstart + interval '1 month'), case when mstart < date_trunc('month', current_date) - interval '1 month' then mstart + interval '1 month' + interval '12 days' end,
        'Smog services ' || to_char(mstart, 'FMMonth YYYY'), true)
      returning id into inv;
      insert into invoice_items (invoice_id, job_id, description, qty, unit_price, amount)
      select inv, j.id, to_char(j.performed_at, 'MM/DD') || ' Smog check ' || coalesce(v.year::text || ' ', '') || coalesce(v.make, '') || ' ' || coalesce(v.model, '') || ' (J-' || j.number || ')', 1, j.price + j.cert_fee, j.price + j.cert_fee
      from jobs j left join vehicles v on v.id = j.vehicle_id where j.company_id = co.id and j.invoice_id is null and j.performed_at >= mstart and j.performed_at < mstart + interval '1 month';
      update jobs set invoice_id = inv, paid = (mstart < date_trunc('month', current_date) - interval '1 month') where company_id = co.id and invoice_id is null and performed_at >= mstart and performed_at < mstart + interval '1 month';
      if mstart < date_trunc('month', current_date) - interval '1 month' then
        insert into payments (invoice_id, company_id, amount, method, source, received_at, is_demo) values (inv, co.id, total, 'ach', 'mercury', mstart + interval '1 month' + interval '12 days', true);
      end if;
    end loop;
  end loop;

  -- bank transactions (Mercury-style) for the P&L
  for mstart in select generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month')::date loop
    insert into transactions (posted_at, amount, counterparty, description, category, is_demo) values
      (mstart + interval '1 day', -6500, 'Bristol Plaza LLC', 'Rent', 'rent', true),
      (mstart + interval '14 days', -7800, 'Gusto', 'Payroll', 'payroll', true),
      (mstart + interval '28 days', -7800, 'Gusto', 'Payroll', 'payroll', true),
      (mstart + interval '5 days', -420 - floor(random()*120), 'SoCal Edison', 'Electric', 'utilities', true),
      (mstart + interval '6 days', -149.99, 'Spectrum Business', 'Internet + phone', 'utilities', true),
      (mstart + interval '3 days', -1800 - floor(random()*600), 'Google Ads', 'Search ads', 'marketing', true),
      (mstart + interval '9 days', -350, 'Yelp', 'Yelp ads', 'marketing', true),
      (mstart + interval '2 days', -2475, 'Bureau of Automotive Repair', 'Smog certificates (300)', 'cogs', true),
      (mstart + interval '11 days', -60 - floor(random()*80), 'Costco', 'Shop supplies', 'supplies', true),
      (mstart + interval '12 days', -385, 'Next Insurance', 'Garage liability', 'insurance', true),
      (mstart + interval '10 days', -95, 'Vercel / Supabase / Telnyx', 'CRM software', 'software', true),
      (mstart + interval '20 days', -210, 'Square', 'Card processing fees', 'fees', true),
      (mstart + interval '25 days', -180, 'Mercury', 'Loan interest', 'interest', true),
      (mstart + interval '15 days', -250, 'Equipment depreciation', 'Dyno + analyzer', 'depreciation', true);
  end loop;
  insert into transactions (posted_at, amount, counterparty, description, category, is_demo)
  select date_trunc('day', performed_at) + interval '20 hours', sum(price + cert_fee), 'Square', 'Card batch deposit', 'revenue', true
  from jobs where is_demo and payment_method = 'card' and performed_at > current_date - 180 group by 1;

  -- demo prospect deals
  insert into companies (name, kind, phone, email, contact_name, smog_price, status, is_demo, notes) values
    ('Newport Coast Motors (demo)', 'dealer', '+17145550901', 'office@ncm.example.com', 'Rachel Kim', 65, 'prospect', true, 'Demo prospect'),
    ('OC Luxury Rentals (demo)', 'rental', '+17145550902', 'fleet@ocl.example.com', 'Tom Reyes', 60, 'prospect', true, 'Demo prospect'),
    ('Irvine Exotic Imports (demo)', 'exotic', '+17145550903', 'sales@iei.example.com', 'Jamal Wright', 81.25, 'prospect', true, 'Demo prospect'),
    ('Harbor Fleet Services (demo)', 'fleet', '+17145550904', 'ops@hfs.example.com', 'Dana Ortiz', 55, 'prospect', true, 'Demo prospect'),
    ('Costa Mesa Auto Group (demo)', 'dealer', '+17145550905', 'gm@cmag.example.com', 'Peter Vu', 60, 'onboarding', true, 'Demo: just signed');
  insert into contacts (first_name, last_name, phone, email, company_id, kind, title, status, source, is_demo)
  select split_part(contact_name, ' ', 1), split_part(contact_name, ' ', 2), phone, email, id, 'partner_contact', 'General manager', 'contacted', 'referral', true
  from companies where is_demo;
  insert into deals (name, company_id, contact_id, stage, est_cars_per_month, smog_price, value_monthly, expected_close, is_demo, position)
  select co.name || ' partner program', co.id, c.id,
    (array['lead','qualified','proposal','contract_sent','won'])[(row_number() over (order by co.name))::int],
    20 + (row_number() over (order by co.name)) * 8, co.smog_price, (20 + (row_number() over (order by co.name)) * 8) * co.smog_price,
    current_date + (row_number() over (order by co.name))::int * 7, true, row_number() over (order by co.name)
  from companies co join contacts c on c.company_id = co.id where co.is_demo;
  update deals set closed_at = now() - interval '3 days' where is_demo and stage = 'won';

  -- upcoming appointments
  for i in 0..13 loop
    for k in 1..(2 + floor(random()*4)::int) loop
      select id, first_name || ' ' || last_name as nm into co from contacts where is_demo and kind = 'driver' order by random() limit 1;
      d := current_date + i;
      if extract(dow from d) = 0 then continue; end if;
      insert into events (calendar_id, title, start_at, end_at, contact_id, source, status, location, is_demo)
      values (appt, 'Smog check: ' || co.nm, (d + time '08:00' + (floor(random()*16) * interval '30 minutes')) at time zone 'America/Los_Angeles',
        (d + time '08:00' + (floor(random()*16) * interval '30 minutes') + interval '30 minutes') at time zone 'America/Los_Angeles', co.id,
        case when random() < 0.6 then 'calendly' else 'manual' end, 'confirmed', '375 Bristol St Unit 80, Costa Mesa', true);
    end loop;
  end loop;

  -- conversations
  for co in select id, first_name, phone from contacts where is_demo and kind = 'driver' order by random() limit 25 loop
    insert into messages (channel, direction, contact_id, from_addr, to_addr, body, status, created_at, is_demo, read_at) values
      ('sms', 'in', co.id, co.phone, '+17144361700', 'Hi, do you guys do STAR smog? How much for a 2016 Camry?', 'received', now() - interval '2 days', true, now()),
      ('sms', 'out', co.id, '+17144361700', co.phone, 'Hi ' || co.first_name || '! Yes, we''re a STAR certified station. Passenger cars are $73 + $8.25 certificate, about 15 minutes. Open Mon-Fri 8-6, Sat 8-4.', 'delivered', now() - interval '2 days' + interval '3 minutes', true, null),
      ('sms', 'in', co.id, co.phone, '+17144361700', 'Great, can I come in tomorrow around 10?', 'received', now() - (random() * interval '20 hours'), true, case when random() < 0.5 then now() end);
  end loop;

  -- timeline activity
  insert into activities (type, direction, contact_id, subject, body, created_at, is_demo)
  select 'job', null, j.contact_id, 'Smog check ' || j.result, 'J-' || j.number || ' · $' || (j.price + j.cert_fee), j.performed_at, true
  from jobs j where j.is_demo and j.contact_id is not null and j.performed_at > now() - interval '30 days';

  -- tasks
  insert into tasks (title, due_at, contact_id, is_demo)
  select 'Follow up: ' || first_name || ' ' || last_name, now() + (floor(random()*6) - 2) * interval '1 day', id, true
  from contacts where is_demo and status in ('lead','contacted') limit 12;
end $$;

-- When the owner signs up: give them ownership of unowned records and back-fill demo commissions.
create or replace function public.claim_owner_records(p_owner uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update companies set owner_id = p_owner where owner_id is null;
  update contacts set owner_id = p_owner where owner_id is null;
  update deals set owner_id = p_owner where owner_id is null;
  insert into calendars (name, color, owner_id, kind, sort)
  select 'Personal', '#8e24aa', p_owner, 'personal', 2 where not exists (select 1 from calendars where owner_id = p_owner and kind = 'personal');
  insert into commissions (rep_id, payment_id, company_id, base_amount, rate, amount, status, earned_at, paid_at, is_demo)
  select p_owner, p.id, p.company_id, p.amount, 0.10, round(p.amount * 0.10, 2),
    case when p.received_at < date_trunc('month', now()) - interval '1 month' then 'paid' when p.received_at < date_trunc('month', now()) then 'approved' else 'earned' end,
    p.received_at, case when p.received_at < date_trunc('month', now()) - interval '1 month' then p.received_at + interval '20 days' end, true
  from payments p where p.is_demo and p.company_id is not null and not exists (select 1 from commissions c where c.payment_id = p.id);
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.team_invites;
begin
  select * into inv from public.team_invites where lower(email) = lower(new.email);
  if lower(new.email) = 'andrewle36@gmail.com' then
    insert into public.profiles(id,email,full_name,role,active) values (new.id,new.email,'Andrew Le','owner',true) on conflict (id) do nothing;
    perform public.claim_owner_records(new.id);
  elsif inv.email is not null then
    insert into public.profiles(id,email,full_name,role,active,commission_rate)
    values (new.id,new.email,coalesce(inv.full_name,split_part(new.email,'@',1)),inv.role,true,inv.commission_rate) on conflict (id) do nothing;
    delete from public.team_invites where email = inv.email;
  else
    insert into public.profiles(id,email,full_name,active) values (new.id,new.email,split_part(new.email,'@',1),false) on conflict (id) do nothing;
  end if;
  return new;
end $$;
