-- Deals / onboarding / tasks: performance indexes only (no structural changes required).
-- Unapplied; safe to run any time.
create index if not exists activities_deal_idx on public.activities(deal_id, created_at desc);
create index if not exists deals_stage_position_idx on public.deals(stage, position);
create index if not exists deals_company_idx on public.deals(company_id);
create index if not exists deals_owner_idx on public.deals(owner_id);
create index if not exists contracts_company_idx on public.contracts(company_id, created_at desc);
create index if not exists contracts_deal_idx on public.contracts(deal_id);
create index if not exists tasks_open_due_idx on public.tasks(done, due_at);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists onboarding_items_company_idx on public.onboarding_items(company_id, sort);
