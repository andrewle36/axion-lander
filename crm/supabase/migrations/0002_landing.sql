-- Landing pages: performance indexes for split-test stats and view dedupe. (Unapplied; optional, no shape changes.)
create index if not exists page_events_dedupe_idx on public.page_events(page_id, visitor_id, type, created_at);
create index if not exists page_events_variant_idx on public.page_events(variant_id, type);
create index if not exists contacts_landing_idx on public.contacts(landing_page_id, created_at);
