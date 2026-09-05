-- Growth intelligence: privacy-conscious event stream, sessions, config, experiments, alerts.

create table if not exists public.growth_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  session_id text,
  account_id uuid references public.accounts(id) on delete set null,
  path text,
  page_type text,
  entity_type text,
  entity_slug text,
  cta_name text,
  cta_placement text,
  source text,
  medium text,
  campaign text,
  referrer_host text,
  country text,
  experiment text,
  variant text,
  props jsonb not null default '{}'::jsonb
);
create index if not exists growth_events_created_idx on public.growth_events(created_at desc);
create index if not exists growth_events_event_idx on public.growth_events(event, created_at desc);
create index if not exists growth_events_session_idx on public.growth_events(session_id, created_at);
create index if not exists growth_events_entity_idx on public.growth_events(entity_type, entity_slug);
create index if not exists growth_events_account_idx on public.growth_events(account_id, created_at desc);

grant select on public.growth_events to authenticated;
grant all on public.growth_events to service_role;
alter table public.growth_events enable row level security;
create policy "Admins read growth events" on public.growth_events
  for select to authenticated using (public.has_role('admin'));

create table if not exists public.growth_sessions (
  session_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  first_path text,
  last_path text,
  source text,
  medium text,
  campaign text,
  referrer_host text,
  country text,
  page_views integer not null default 0,
  product_views integer not null default 0,
  cta_clicks integer not null default 0,
  engaged boolean not null default false,
  signup_started boolean not null default false,
  signup_completed boolean not null default false,
  account_id uuid references public.accounts(id) on delete set null
);
create index if not exists growth_sessions_first_seen_idx on public.growth_sessions(first_seen desc);
create index if not exists growth_sessions_source_idx on public.growth_sessions(source);

grant select on public.growth_sessions to authenticated;
grant all on public.growth_sessions to service_role;
alter table public.growth_sessions enable row level security;
create policy "Admins read growth sessions" on public.growth_sessions
  for select to authenticated using (public.has_role('admin'));

create table if not exists public.growth_config (
  id boolean primary key default true check (id),
  activation_events text[] not null default array['campaign_sent','automation_activated','landing_page_published','form_submission_received'],
  north_star_events text[] not null default array['campaign_sent','automation_activated','landing_page_published','form_submission_received'],
  min_sample integer not null default 50,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant select, insert, update on public.growth_config to authenticated;
grant all on public.growth_config to service_role;
alter table public.growth_config enable row level security;
create policy "Admins manage growth config" on public.growth_config
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
insert into public.growth_config (id) values (true) on conflict (id) do nothing;

create table if not exists public.growth_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hypothesis text,
  area text not null default 'messaging' check (area in ('messaging','layout','cta','content','onboarding')),
  variant_a text,
  variant_b text,
  target_page text,
  primary_metric text,
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  start_date date,
  end_date date,
  min_sample integer not null default 200,
  result_summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.growth_experiments to authenticated;
grant all on public.growth_experiments to service_role;
alter table public.growth_experiments enable row level security;
create policy "Admins manage experiments" on public.growth_experiments
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create trigger growth_experiments_touch before update on public.growth_experiments
  for each row execute function public.touch_updated_at();

create table if not exists public.growth_alerts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  metric text not null,
  direction text not null default 'drop' check (direction in ('drop','rise')),
  threshold_pct numeric not null default 30,
  window_days integer not null default 7,
  enabled boolean not null default true,
  note text,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.growth_alerts to authenticated;
grant all on public.growth_alerts to service_role;
alter table public.growth_alerts enable row level security;
create policy "Admins manage growth alerts" on public.growth_alerts
  for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create trigger growth_alerts_touch before update on public.growth_alerts
  for each row execute function public.touch_updated_at();

-- Onboarding intent + first-touch attribution on the workspace record.
alter table public.accounts add column if not exists growth_goal text;
alter table public.accounts add column if not exists signup_source text;
alter table public.accounts add column if not exists signup_medium text;
alter table public.accounts add column if not exists signup_campaign text;
alter table public.accounts add column if not exists signup_session_id text;