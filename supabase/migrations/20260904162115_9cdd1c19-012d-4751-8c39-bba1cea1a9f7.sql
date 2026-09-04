CREATE TABLE public.media_assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  name text not null,
  kind text not null default 'image',
  content_type text not null default 'application/octet-stream',
  size bigint not null default 0,
  storage_path text not null,
  url text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
CREATE INDEX media_assets_account_idx ON public.media_assets (account_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view media" ON public.media_assets FOR SELECT TO authenticated USING (has_account_access(account_id, 'viewer'::account_member_role));
CREATE POLICY "Team editors manage media" ON public.media_assets FOR ALL TO authenticated USING (has_account_access(account_id, 'editor'::account_member_role)) WITH CHECK (has_account_access(account_id, 'editor'::account_member_role));

CREATE TABLE public.website_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  kind text not null,
  resource_id uuid not null,
  version integer not null default 1,
  label text,
  blocks jsonb,
  builder_theme jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
CREATE INDEX website_versions_resource_idx ON public.website_versions (resource_id, version DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_versions TO authenticated;
GRANT ALL ON public.website_versions TO service_role;
ALTER TABLE public.website_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members view website versions" ON public.website_versions FOR SELECT TO authenticated USING (has_account_access(account_id, 'viewer'::account_member_role));
CREATE POLICY "Team editors manage website versions" ON public.website_versions FOR ALL TO authenticated USING (has_account_access(account_id, 'editor'::account_member_role)) WITH CHECK (has_account_access(account_id, 'editor'::account_member_role));

ALTER TABLE public.landing_pages
  ADD COLUMN IF NOT EXISTS published_blocks jsonb,
  ADD COLUMN IF NOT EXISTS published_theme jsonb,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz;

ALTER TABLE public.signup_forms
  ADD COLUMN IF NOT EXISTS published_blocks jsonb,
  ADD COLUMN IF NOT EXISTS published_theme jsonb,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz;