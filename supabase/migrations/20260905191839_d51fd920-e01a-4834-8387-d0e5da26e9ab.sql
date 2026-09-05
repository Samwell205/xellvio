-- Enums
CREATE TYPE public.authority_opp_type AS ENUM ('resource_mention','guest_article','product_listing','integration_listing','partnership','template_resource','tool_recommendation','expert_contribution','podcast','interview','digital_pr','community','competitor_mention','link_reclamation');
CREATE TYPE public.authority_quality AS ENUM ('high_value','relevant','low_priority','avoid','unrated');
CREATE TYPE public.authority_stage AS ENUM ('identified','researched','qualified','pitch_ready','contacted','follow_up','responded','link_earned','not_a_fit','archived');
CREATE TYPE public.authority_asset_status AS ENUM ('idea','research','creation','review','published','distribution','promotion','performance_review');
CREATE TYPE public.authority_mention_link AS ENUM ('linked','unlinked','unknown');
CREATE TYPE public.authority_sentiment AS ENUM ('positive','neutral','negative','unknown');

CREATE TABLE public.authority_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  website_name text NOT NULL,
  website_url text NOT NULL,
  website_type text,
  topic text,
  domain_relevance text,
  opportunity_type public.authority_opp_type NOT NULL DEFAULT 'resource_mention',
  contact_person text,
  contact_method text,
  quality public.authority_quality NOT NULL DEFAULT 'unrated',
  quality_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority_score int NOT NULL DEFAULT 0,
  stage public.authority_stage NOT NULL DEFAULT 'identified',
  target_page text,
  proposed_value text,
  pitch_draft text,
  notes text,
  last_contact_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.authority_opportunities(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'outbound',
  channel text,
  summary text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_url text NOT NULL,
  term text NOT NULL DEFAULT 'Xellvio',
  link_state public.authority_mention_link NOT NULL DEFAULT 'unknown',
  sentiment public.authority_sentiment NOT NULL DEFAULT 'unknown',
  verified boolean NOT NULL DEFAULT false,
  relevant boolean,
  suggested_target_page text,
  review_status text NOT NULL DEFAULT 'needs_review',
  opportunity_id uuid REFERENCES public.authority_opportunities(id) ON DELETE SET NULL,
  notes text,
  found_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_directories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  platform_url text,
  listing_url text,
  category text,
  status text NOT NULL DEFAULT 'not_submitted',
  account_owner text,
  description_used text,
  logo_uploaded boolean NOT NULL DEFAULT false,
  screenshots_uploaded boolean NOT NULL DEFAULT false,
  quality public.authority_quality NOT NULL DEFAULT 'unrated',
  notes text,
  last_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'guide',
  target_audience text,
  problem_solved text,
  topic text,
  related_product text,
  page_path text,
  distribution_plan text,
  potential_audience text,
  outreach_angle text,
  status public.authority_asset_status NOT NULL DEFAULT 'idea',
  is_research boolean NOT NULL DEFAULT false,
  data_source text,
  methodology text,
  sample_size text,
  date_range text,
  limitations text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.authority_assets(id) ON DELETE CASCADE,
  content_piece text NOT NULL,
  channel text NOT NULL,
  post_format text,
  adapted_copy text,
  status text NOT NULL DEFAULT 'planned',
  scheduled_for date,
  performance_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  short_description text,
  description text,
  relationship text,
  integration_summary text,
  integration_app_slug text,
  use_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  website_url text,
  logo_url text,
  verified boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.authority_brand_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  brand_name text NOT NULL DEFAULT 'Xellvio',
  tagline text,
  short_description text,
  medium_description text,
  long_description text,
  website_url text,
  logo_url text,
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  company_info text,
  social_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_outreach_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_mentions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_directories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_distribution TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_partners TO authenticated;
GRANT SELECT ON public.authority_partners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authority_brand_profile TO authenticated;
GRANT ALL ON public.authority_opportunities, public.authority_outreach_log, public.authority_mentions, public.authority_directories, public.authority_assets, public.authority_distribution, public.authority_partners, public.authority_brand_profile TO service_role;

ALTER TABLE public.authority_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_outreach_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_directories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_brand_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage authority opportunities" ON public.authority_opportunities FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage authority outreach log" ON public.authority_outreach_log FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage authority mentions" ON public.authority_mentions FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage authority directories" ON public.authority_directories FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage authority assets" ON public.authority_assets FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage authority distribution" ON public.authority_distribution FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage authority partners" ON public.authority_partners FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Anyone can view published partners" ON public.authority_partners FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "Admins manage brand profile" ON public.authority_brand_profile FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE TRIGGER trg_authority_opportunities_updated BEFORE UPDATE ON public.authority_opportunities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_authority_mentions_updated BEFORE UPDATE ON public.authority_mentions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_authority_directories_updated BEFORE UPDATE ON public.authority_directories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_authority_assets_updated BEFORE UPDATE ON public.authority_assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_authority_distribution_updated BEFORE UPDATE ON public.authority_distribution FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_authority_partners_updated BEFORE UPDATE ON public.authority_partners FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_authority_brand_profile_updated BEFORE UPDATE ON public.authority_brand_profile FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_authority_opps_stage ON public.authority_opportunities(stage);
CREATE INDEX idx_authority_mentions_state ON public.authority_mentions(link_state);
CREATE INDEX idx_authority_partners_published ON public.authority_partners(published);