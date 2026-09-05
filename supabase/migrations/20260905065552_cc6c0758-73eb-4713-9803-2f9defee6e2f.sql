-- Workspace-to-workspace API keys for the Xellvio Connect app
CREATE TABLE IF NOT EXISTS public.workspace_api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null default 'Workspace key',
  key_prefix text not null,
  key_hash text not null unique,
  created_by uuid,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS workspace_api_keys_account_idx ON public.workspace_api_keys(account_id);
GRANT SELECT ON public.workspace_api_keys TO authenticated;
GRANT ALL ON public.workspace_api_keys TO service_role;
ALTER TABLE public.workspace_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read own workspace keys" ON public.workspace_api_keys;
CREATE POLICY "members read own workspace keys" ON public.workspace_api_keys
  FOR SELECT TO authenticated USING (public.has_account_access(account_id));

-- First-party marketplace apps: Xellvio Connect + Xellvio SMS
WITH dev AS (
  SELECT id FROM public.developers WHERE is_first_party = true ORDER BY created_at LIMIT 1
), cat AS (
  SELECT id FROM public.app_categories ORDER BY sort_order LIMIT 1
)
INSERT INTO public.apps (
  slug, name, tagline, short_description, long_description, developer_id, category_id,
  auth_type, status, visibility, version, pricing_type, accent_color, is_featured,
  setup_guide, keywords, published_at
)
SELECT * FROM (
  SELECT 'xellvio-connect'::text, 'Xellvio Connect'::text,
    'Link another Xellvio workspace'::text,
    'Share contacts and lists between two Xellvio workspaces using a workspace key.'::text,
    'Xellvio Connect links this workspace to another Xellvio workspace. Generate a workspace key in the source workspace, paste it here, and Xellvio verifies the key server-side. Once connected you can pull contacts and lists from the linked workspace into this one — phone numbers are de-duplicated and suppression lists are always respected.'::text,
    (SELECT id FROM dev), (SELECT id FROM cat),
    'api_key'::text, 'published'::text, 'public'::text, '1.0.0'::text, 'free'::text, '#2563eb'::text, true,
    'Open Apps → Xellvio Connect in the workspace you want to link, create a workspace key, then paste it here.'::text,
    ARRAY['xellvio','workspace','sync','contacts']::text[], now()
  UNION ALL
  SELECT 'xellvio-sms'::text, 'Xellvio SMS'::text,
    'Send SMS from one of your verified numbers'::text,
    'Connect a verified Xellvio number so apps and automations can send real SMS.'::text,
    'Xellvio SMS turns one of your verified sending numbers into a connected app. Pick the number, and automations, website forms and other connected apps can send real text messages from it. Every send is priced with your normal country rates, screened for compliance and logged.'::text,
    (SELECT id FROM dev), (SELECT id FROM cat),
    'none'::text, 'published'::text, 'public'::text, '1.0.0'::text, 'free'::text, '#0f766e'::text, true,
    'Finish SMS setup so you have a verified number, then choose it here.'::text,
    ARRAY['sms','sender','number','messaging']::text[], now()
) s
WHERE NOT EXISTS (SELECT 1 FROM public.apps a WHERE a.slug = 'xellvio-connect')
  AND NOT EXISTS (SELECT 1 FROM public.apps a WHERE a.slug = 'xellvio-sms');

INSERT INTO public.app_actions (app_id, slug, name, description, canonical_entity)
SELECT a.id, v.slug, v.name, v.description, v.entity
FROM public.apps a
JOIN (VALUES
  ('xellvio-connect','pull-contacts','Pull contacts','Import contacts from the linked workspace','contact'),
  ('xellvio-connect','pull-lists','Pull lists','Copy list membership from the linked workspace','contact'),
  ('xellvio-sms','send-sms','Send SMS','Send a text message from the connected number','message')
) AS v(app_slug, slug, name, description, entity) ON v.app_slug = a.slug
WHERE NOT EXISTS (SELECT 1 FROM public.app_actions x WHERE x.app_id = a.id AND x.slug = v.slug);

INSERT INTO public.app_triggers (app_id, slug, name, description, canonical_entity)
SELECT a.id, v.slug, v.name, v.description, v.entity
FROM public.apps a
JOIN (VALUES
  ('xellvio-connect','contact-created','Contact created upstream','Fires when the linked workspace adds a contact','contact'),
  ('xellvio-sms','reply-received','Reply received','Fires when someone replies to the connected number','message')
) AS v(app_slug, slug, name, description, entity) ON v.app_slug = a.slug
WHERE NOT EXISTS (SELECT 1 FROM public.app_triggers x WHERE x.app_id = a.id AND x.slug = v.slug);

INSERT INTO public.app_features (app_id, title, description, sort_order)
SELECT a.id, v.title, v.description, v.sort_order
FROM public.apps a
JOIN (VALUES
  ('xellvio-connect','Verified workspace keys','Keys are hashed and checked server-side before any data moves',1),
  ('xellvio-connect','Safe contact import','Duplicate phone numbers are merged and suppressions respected',2),
  ('xellvio-sms','Real sending number','Only verified numbers on your account can be connected',1),
  ('xellvio-sms','Compliance screening','Every message is screened and priced before it goes out',2)
) AS v(app_slug, title, description, sort_order) ON v.app_slug = a.slug
WHERE NOT EXISTS (SELECT 1 FROM public.app_features x WHERE x.app_id = a.id AND x.title = v.title);