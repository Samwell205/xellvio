-- ============ Xellvio App Marketplace ============

CREATE TABLE public.app_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.app_categories TO anon, authenticated;
GRANT ALL ON public.app_categories TO service_role;
ALTER TABLE public.app_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories are public" ON public.app_categories FOR SELECT USING (true);
CREATE POLICY "admins manage categories" ON public.app_categories FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE TABLE public.developers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  company_name text not null,
  website text,
  support_email text,
  description text,
  logo_url text,
  verification_status text not null default 'unverified',
  developer_status text not null default 'active',
  is_first_party boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE ON public.developers TO authenticated;
GRANT SELECT ON public.developers TO anon;
GRANT ALL ON public.developers TO service_role;
ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "developer profiles are public" ON public.developers FOR SELECT USING (true);
CREATE POLICY "users create own developer profile" ON public.developers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own developer profile" ON public.developers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins manage developers" ON public.developers FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE TABLE public.apps (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  category_id uuid references public.app_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  tagline text,
  short_description text,
  long_description text,
  logo_url text,
  banner_url text,
  accent_color text,
  website_url text,
  documentation_url text,
  privacy_url text,
  terms_url text,
  setup_guide text,
  auth_type text not null default 'oauth2',
  pricing_type text not null default 'free',
  status text not null default 'draft',
  visibility text not null default 'public',
  version text not null default '1.0.0',
  install_count int not null default 0,
  rating numeric(2,1) not null default 0,
  is_featured boolean not null default false,
  keywords text[] not null default '{}',
  auth_config jsonb not null default '{}'::jsonb,
  review_notes text,
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX apps_category_idx ON public.apps(category_id);
CREATE INDEX apps_status_idx ON public.apps(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apps TO authenticated;
GRANT SELECT ON public.apps TO anon;
GRANT ALL ON public.apps TO service_role;
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published apps are public" ON public.apps FOR SELECT
  USING (status = 'published' AND visibility = 'public');
CREATE POLICY "developers read own apps" ON public.apps FOR SELECT TO authenticated
  USING (exists (select 1 from public.developers d where d.id = apps.developer_id and d.user_id = auth.uid()));
CREATE POLICY "developers write own apps" ON public.apps FOR ALL TO authenticated
  USING (exists (select 1 from public.developers d where d.id = apps.developer_id and d.user_id = auth.uid()))
  WITH CHECK (exists (select 1 from public.developers d where d.id = apps.developer_id and d.user_id = auth.uid()));
CREATE POLICY "admins manage apps" ON public.apps FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE TABLE public.app_features (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  title text not null,
  description text,
  icon text,
  sort_order int not null default 0
);
CREATE TABLE public.app_actions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  canonical_entity text,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  unique (app_id, slug)
);
CREATE TABLE public.app_triggers (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  canonical_entity text,
  payload_schema jsonb not null default '{}'::jsonb,
  unique (app_id, slug)
);
CREATE TABLE public.app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  version text not null,
  changelog text,
  status text not null default 'published',
  created_at timestamptz not null default now()
);

CREATE OR REPLACE FUNCTION public.can_read_app(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.apps a
    LEFT JOIN public.developers d ON d.id = a.developer_id
    WHERE a.id = _app_id
      AND ((a.status = 'published' AND a.visibility = 'public')
        OR d.user_id = auth.uid()
        OR public.has_role('admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_app(_app_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.apps a
    LEFT JOIN public.developers d ON d.id = a.developer_id
    WHERE a.id = _app_id AND (d.user_id = auth.uid() OR public.has_role('admin'))
  )
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_features','app_actions','app_triggers','app_versions'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read visible app rows" ON public.%I FOR SELECT USING (public.can_read_app(app_id))', t);
    EXECUTE format('CREATE POLICY "write own app rows" ON public.%I FOR ALL TO authenticated USING (public.can_write_app(app_id)) WITH CHECK (public.can_write_app(app_id))', t);
  END LOOP;
END $$;

-- ============ installs & connections (tenant data) ============
CREATE TABLE public.app_installations (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  user_id uuid not null,
  workspace_id uuid not null,
  status text not null default 'installed',
  settings jsonb not null default '{}'::jsonb,
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, workspace_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_installations TO authenticated;
GRANT ALL ON public.app_installations TO service_role;
ALTER TABLE public.app_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace reads installs" ON public.app_installations FOR SELECT TO authenticated
  USING (public.has_account_access(workspace_id, 'viewer'));
CREATE POLICY "workspace writes installs" ON public.app_installations FOR ALL TO authenticated
  USING (public.has_account_access(workspace_id, 'admin'))
  WITH CHECK (public.has_account_access(workspace_id, 'admin'));
CREATE POLICY "admins read installs" ON public.app_installations FOR SELECT TO authenticated
  USING (public.has_role('admin'));

CREATE TABLE public.app_connections (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.app_installations(id) on delete cascade,
  connection_name text,
  credentials_encrypted text,
  token_expires_at timestamptz,
  external_account_id text,
  external_account_label text,
  scopes text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  status text not null default 'connected',
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, DELETE ON public.app_connections TO authenticated;
GRANT ALL ON public.app_connections TO service_role;
ALTER TABLE public.app_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace reads own connections" ON public.app_connections FOR SELECT TO authenticated
  USING (exists (select 1 from public.app_installations i
    where i.id = app_connections.installation_id and public.has_account_access(i.workspace_id, 'viewer')));
CREATE POLICY "workspace deletes own connections" ON public.app_connections FOR DELETE TO authenticated
  USING (exists (select 1 from public.app_installations i
    where i.id = app_connections.installation_id and public.has_account_access(i.workspace_id, 'admin')));

CREATE TABLE public.app_oauth_states (
  state text primary key,
  app_id uuid not null references public.apps(id) on delete cascade,
  workspace_id uuid not null,
  user_id uuid not null,
  code_verifier text,
  redirect_to text,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.app_oauth_states TO service_role;
ALTER TABLE public.app_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references public.apps(id) on delete cascade,
  connection_id uuid references public.app_connections(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  attempt_count int not null default 0,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read webhook events" ON public.webhook_events FOR SELECT TO authenticated
  USING (public.has_role('admin'));

CREATE TABLE public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references public.apps(id) on delete cascade,
  connection_id uuid references public.app_connections(id) on delete set null,
  workspace_id uuid,
  event_type text,
  action text,
  request_data jsonb,
  response_data jsonb,
  status text not null default 'ok',
  error_message text,
  created_at timestamptz not null default now()
);
CREATE INDEX integration_logs_ws_idx ON public.integration_logs(workspace_id, created_at desc);
GRANT SELECT ON public.integration_logs TO authenticated;
GRANT ALL ON public.integration_logs TO service_role;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace reads own logs" ON public.integration_logs FOR SELECT TO authenticated
  USING (workspace_id is not null and public.has_account_access(workspace_id, 'viewer'));
CREATE POLICY "admins read all logs" ON public.integration_logs FOR SELECT TO authenticated
  USING (public.has_role('admin'));

CREATE TABLE public.app_reviews (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  user_id uuid not null,
  author_name text,
  rating int not null check (rating between 1 and 5),
  review text,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  unique (app_id, user_id)
);
GRANT SELECT ON public.app_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_reviews TO authenticated;
GRANT ALL ON public.app_reviews TO service_role;
ALTER TABLE public.app_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published reviews are public" ON public.app_reviews FOR SELECT USING (status = 'published');
CREATE POLICY "users manage own reviews" ON public.app_reviews FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "admins manage reviews" ON public.app_reviews FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

CREATE TABLE public.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.developers(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
GRANT SELECT, DELETE ON public.developer_api_keys TO authenticated;
GRANT ALL ON public.developer_api_keys TO service_role;
ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "developers read own keys" ON public.developer_api_keys FOR SELECT TO authenticated
  USING (exists (select 1 from public.developers d where d.id = developer_id and d.user_id = auth.uid()));
CREATE POLICY "developers delete own keys" ON public.developer_api_keys FOR DELETE TO authenticated
  USING (exists (select 1 from public.developers d where d.id = developer_id and d.user_id = auth.uid()));

CREATE TRIGGER developers_touch BEFORE UPDATE ON public.developers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER apps_touch BEFORE UPDATE ON public.apps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER app_installations_touch BEFORE UPDATE ON public.app_installations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER app_connections_touch BEFORE UPDATE ON public.app_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ seed data ============
INSERT INTO public.app_categories (name, slug, description, icon, sort_order) VALUES
 ('CRM','crm','Connect Xellvio with your favourite customer relationship management tools.','Users',1),
 ('Ecommerce','ecommerce','Sync stores, products, orders and customers with Xellvio.','ShoppingCart',2),
 ('Marketing','marketing','Bring email, SMS and lifecycle marketing platforms together.','Megaphone',3),
 ('Payments','payments','Track payments, invoices and subscriptions inside Xellvio.','CreditCard',4),
 ('Automation','automation','Push Xellvio events into thousands of downstream workflows.','Workflow',5),
 ('Communication','communication','Messaging, chat and team notification channels.','MessageSquare',6),
 ('Analytics','analytics','Measure campaign and website performance end to end.','BarChart3',7),
 ('AI','ai','Add generative intelligence to your content and workflows.','Sparkles',8),
 ('Productivity','productivity','Spreadsheets, docs and everyday work tools.','LayoutGrid',9),
 ('Booking','booking','Appointments, calendars and scheduling.','CalendarClock',10),
 ('Customer Support','support','Helpdesks and ticketing systems.','Headphones',11),
 ('Forms','forms','Capture leads from any form builder.','ClipboardList',12),
 ('Social Media','social','Publish and listen across social channels.','Share2',13),
 ('Advertising','advertising','Sync audiences with ad platforms.','Target',14),
 ('Developer Tools','developer-tools','Webhooks, APIs and custom build blocks.','Code2',15);

INSERT INTO public.developers (company_name, website, description, verification_status, developer_status, is_first_party)
VALUES ('Xellvio','https://xellvio.com','First-party integrations built and maintained by the Xellvio team.','verified','active',true);

INSERT INTO public.apps (developer_id, category_id, name, slug, tagline, short_description, long_description, logo_url, accent_color, website_url, documentation_url, auth_type, pricing_type, status, visibility, version, install_count, rating, is_featured, keywords, setup_guide, published_at)
SELECT d.id, c.id, v.name, v.slug, v.tagline, v.short_desc, v.long_desc,
       'https://cdn.simpleicons.org/' || v.icon_slug, v.accent, v.website, v.website || '/docs',
       v.auth_type, 'free', 'published', 'public', '1.0.0', v.installs, v.rating, v.featured, v.keywords,
       'Click Connect, authorise Xellvio in ' || v.name || ', then choose which data should sync. You can change or revoke access at any time from My Apps.',
       now()
FROM (VALUES
 ('Shopify','shopify','Ecommerce platform','Sync products, customers and orders between your Shopify store and Xellvio.','Connect your Shopify store with Xellvio to synchronise products, customers, orders and business data. Trigger SMS flows on new orders, abandoned checkouts and fulfilment updates.','ecommerce','shopify','#95BF47','https://shopify.com','oauth2',4820,4.9,true,ARRAY['ecommerce','store','orders','products']),
 ('GoHighLevel','gohighlevel','All-in-one agency CRM','Push leads, contacts and opportunities into GoHighLevel sub-accounts.','Two-way sync between Xellvio and GoHighLevel: create contacts, opportunities and pipeline stages from website forms and SMS replies.','crm','ghost','#2F6FED','https://gohighlevel.com','oauth2',3110,4.7,true,ARRAY['crm','agency','pipeline','leads']),
 ('HubSpot','hubspot','CRM and marketing suite','Create and update HubSpot contacts, companies and deals from Xellvio.','Keep HubSpot as your source of truth while Xellvio handles SMS. Contacts, lists and deal stages stay in sync in both directions.','crm','hubspot','#FF7A59','https://hubspot.com','oauth2',2760,4.8,true,ARRAY['crm','contacts','deals','marketing']),
 ('Salesforce','salesforce','Enterprise CRM','Sync leads, contacts and opportunities with Salesforce.','Enterprise-grade connector for Salesforce Sales Cloud with field mapping to the Xellvio canonical contact and deal model.','crm','salesforce','#00A1E0','https://salesforce.com','oauth2',940,4.5,false,ARRAY['crm','enterprise','leads']),
 ('Zoho CRM','zoho-crm','Business CRM','Send Xellvio contacts and form submissions into Zoho CRM.','Create or update Zoho CRM leads and contacts whenever a website form is submitted or an SMS reply arrives.','crm','zoho','#E42527','https://zoho.com','oauth2',610,4.4,false,ARRAY['crm','zoho','leads']),
 ('Pipedrive','pipedrive','Sales pipeline CRM','Create Pipedrive persons and deals from Xellvio activity.','Turn SMS conversations and landing page conversions into Pipedrive deals with automatic stage updates.','crm','pipedrive','#1A1A1A','https://pipedrive.com','api_key',520,4.3,false,ARRAY['crm','sales','deals']),
 ('WooCommerce','woocommerce','WordPress ecommerce','Sync WooCommerce orders and customers with Xellvio.','Connect your WordPress store: order, customer and product events flow into Xellvio automations.','ecommerce','woocommerce','#7F54B3','https://woocommerce.com','api_key',1980,4.6,true,ARRAY['ecommerce','wordpress','orders']),
 ('BigCommerce','bigcommerce','Ecommerce platform','Import BigCommerce customers and order events.','Sync catalogue, customers and orders from BigCommerce to drive lifecycle SMS.','ecommerce','bigcommerce','#121118','https://bigcommerce.com','oauth2',430,4.2,false,ARRAY['ecommerce','store']),
 ('Wix','wix','Website and store builder','Capture Wix store and form data inside Xellvio.','Bring Wix Stores orders and Wix Forms submissions into the Xellvio canonical data model.','ecommerce','wix','#0C6EFC','https://wix.com','oauth2',390,4.1,false,ARRAY['ecommerce','website','forms']),
 ('Stripe','stripe','Payments and billing','Track Stripe payments, subscriptions and invoices in Xellvio.','Listen to Stripe payment, subscription and invoice events and trigger receipts, dunning reminders and win-back SMS.','payments','stripe','#635BFF','https://stripe.com','oauth2',3540,4.9,true,ARRAY['payments','billing','subscriptions']),
 ('PayPal','paypal','Online payments','Sync PayPal transactions with Xellvio.','Record PayPal payments against Xellvio customers and trigger post-purchase messaging.','payments','paypal','#003087','https://paypal.com','oauth2',1120,4.3,false,ARRAY['payments','checkout']),
 ('Paystack','paystack','African payments','Sync Paystack charges and customers.','Connect Paystack to reconcile payments and trigger SMS confirmations for African markets.','payments','paystack','#00C3F7','https://paystack.com','api_key',870,4.6,false,ARRAY['payments','africa','nigeria']),
 ('Flutterwave','flutterwave','Global payments','Track Flutterwave transactions inside Xellvio.','Flutterwave payment and payout events mapped to the Xellvio payment entity.','payments','flutterwave','#F5A623','https://flutterwave.com','api_key',740,4.5,false,ARRAY['payments','africa']),
 ('Klaviyo','klaviyo','Email and SMS marketing','Share profiles, lists and events with Klaviyo.','Keep Klaviyo profiles and Xellvio audiences aligned, and mirror engagement events across both platforms.','marketing','klaviyo','#232323','https://klaviyo.com','api_key',1650,4.4,true,ARRAY['email','marketing','profiles']),
 ('Mailchimp','mailchimp','Email marketing','Sync Mailchimp audiences with Xellvio lists.','Add, update and tag Mailchimp subscribers from Xellvio forms, segments and SMS replies.','marketing','mailchimp','#FFE01B','https://mailchimp.com','oauth2',2210,4.5,true,ARRAY['email','audience','newsletter']),
 ('Brevo','brevo','Email and CRM platform','Push contacts and events into Brevo.','Brevo contact, list and transactional email sync for Xellvio workspaces.','marketing','brevo','#0B996E','https://brevo.com','api_key',680,4.3,false,ARRAY['email','crm','transactional']),
 ('ActiveCampaign','activecampaign','Marketing automation','Sync ActiveCampaign contacts, tags and automations.','Trigger ActiveCampaign automations from Xellvio events and keep tags aligned.','marketing','activecampaign','#356AE6','https://activecampaign.com','api_key',590,4.2,false,ARRAY['automation','email','tags']),
 ('Zapier','zapier','Connect 6,000+ apps','Send Xellvio triggers to any Zapier workflow.','Use Xellvio as a Zapier trigger and action source to reach thousands of downstream apps without code.','automation','zapier','#FF4F00','https://zapier.com','api_key',2890,4.7,true,ARRAY['automation','no-code','workflow']),
 ('Make','make','Visual automation','Build advanced Make scenarios on Xellvio data.','Make (formerly Integromat) modules for Xellvio contacts, campaigns and inbound replies.','automation','make','#6D00CC','https://make.com','api_key',1240,4.6,true,ARRAY['automation','scenario','no-code']),
 ('n8n','n8n','Open-source automation','Self-hosted workflows powered by Xellvio events.','Trigger n8n workflows from Xellvio webhooks and call Xellvio actions from any n8n node.','automation','n8n','#EA4B71','https://n8n.io','bearer_token',960,4.8,true,ARRAY['automation','open-source','self-hosted']),
 ('Twilio','twilio','Programmable messaging','Bring your own Twilio account for SMS and MMS.','Use your own Twilio numbers and messaging services as an additional Xellvio sending channel.','communication','twilio','#F22F46','https://twilio.com','api_key',2050,4.6,true,ARRAY['sms','mms','voice','carrier']),
 ('WhatsApp','whatsapp','WhatsApp Business','Reach customers on WhatsApp from Xellvio.','Connect a WhatsApp Business number to send template messages and receive replies in the Xellvio inbox.','communication','whatsapp','#25D366','https://business.whatsapp.com','oauth2',1780,4.5,true,ARRAY['whatsapp','chat','messaging']),
 ('Slack','slack','Team messaging','Get Xellvio alerts and replies in Slack.','Post campaign results, inbound replies and balance alerts into any Slack channel.','communication','slack','#611F69','https://slack.com','oauth2',1430,4.7,false,ARRAY['alerts','team','notifications']),
 ('Discord','discord','Community chat','Send Xellvio notifications to Discord.','Route Xellvio events to Discord channels through incoming webhooks.','communication','discord','#5865F2','https://discord.com','bearer_token',510,4.4,false,ARRAY['community','notifications']),
 ('Google Analytics','google-analytics','Web analytics','Attribute Xellvio traffic and conversions in GA4.','Automatically tag Xellvio short links and stream conversion events into GA4.','analytics','googleanalytics','#E37400','https://analytics.google.com','oauth2',1990,4.5,true,ARRAY['analytics','ga4','attribution']),
 ('Meta Pixel','meta-pixel','Conversion tracking','Send Xellvio conversions to Meta.','Fire Meta Pixel and Conversions API events from landing pages and SMS clicks.','analytics','meta','#0866FF','https://business.facebook.com','oauth2',1310,4.2,false,ARRAY['pixel','ads','conversions']),
 ('Hotjar','hotjar','Behaviour analytics','Add heatmaps and recordings to Xellvio pages.','Drop Hotjar tracking into published landing pages and sign-up forms.','analytics','hotjar','#FF3C00','https://hotjar.com','api_key',420,4.1,false,ARRAY['heatmap','recordings','ux']),
 ('Calendly','calendly','Scheduling','Book meetings from Xellvio conversations.','Share Calendly links in SMS and log booked appointments as Xellvio appointments.','booking','calendly','#006BFF','https://calendly.com','oauth2',980,4.6,true,ARRAY['booking','meetings','appointments']),
 ('Google Calendar','google-calendar','Calendar sync','Sync appointments with Google Calendar.','Create and update Google Calendar events from Xellvio bookings and reminders.','booking','googlecalendar','#4285F4','https://calendar.google.com','oauth2',1150,4.5,false,ARRAY['calendar','appointments','reminders']),
 ('OpenAI','openai','GPT models','Generate copy and insights with OpenAI.','Use your own OpenAI key for message drafting, summarisation and landing page copy.','ai','openai','#412991','https://openai.com','api_key',2340,4.8,true,ARRAY['ai','gpt','copywriting']),
 ('Claude','claude','Anthropic Claude','Long-form reasoning and content with Claude.','Bring Anthropic Claude into Xellvio for content generation and reply drafting.','ai','anthropic','#D97757','https://anthropic.com','api_key',1620,4.8,true,ARRAY['ai','anthropic','assistant']),
 ('Gemini','gemini','Google Gemini','Multimodal AI for content and images.','Connect Google Gemini for multimodal generation inside the Xellvio builders.','ai','googlegemini','#8E75B2','https://ai.google.dev','api_key',1180,4.6,false,ARRAY['ai','google','multimodal']),
 ('Google Sheets','google-sheets','Spreadsheets','Export and import Xellvio data with Sheets.','Append campaign results and import contact lists straight from Google Sheets.','productivity','googlesheets','#34A853','https://sheets.google.com','oauth2',1420,4.6,false,ARRAY['spreadsheet','export','contacts']),
 ('Notion','notion','Docs and databases','Log Xellvio activity into Notion databases.','Create Notion database rows for campaigns, leads and support conversations.','productivity','notion','#191919','https://notion.so','oauth2',760,4.3,false,ARRAY['docs','database','notes']),
 ('Zendesk','zendesk','Customer support','Create Zendesk tickets from SMS replies.','Turn inbound Xellvio replies into Zendesk tickets and sync agent responses back.','support','zendesk','#03363D','https://zendesk.com','oauth2',690,4.4,false,ARRAY['support','tickets','helpdesk']),
 ('Intercom','intercom','Conversational support','Sync Intercom contacts and conversations.','Keep Intercom users aligned with Xellvio profiles and escalate SMS threads to chat.','support','intercom','#1F8DED','https://intercom.com','oauth2',580,4.3,false,ARRAY['support','chat','contacts']),
 ('Typeform','typeform','Form builder','Capture Typeform responses as Xellvio contacts.','Every Typeform submission becomes a canonical Xellvio form submission and contact.','forms','typeform','#262627','https://typeform.com','oauth2',640,4.5,false,ARRAY['forms','leads','survey']),
 ('Jotform','jotform','Form builder','Send Jotform submissions to Xellvio.','Map Jotform fields to the Xellvio contact model with no code.','forms','jotform','#0A1551','https://jotform.com','api_key',380,4.2,false,ARRAY['forms','leads']),
 ('Instagram','instagram','Social messaging','Capture Instagram leads and DMs.','Bring Instagram lead forms and direct messages into Xellvio.','social','instagram','#E4405F','https://instagram.com','oauth2',870,4.1,false,ARRAY['social','dm','leads']),
 ('Google Ads','google-ads','Search advertising','Sync Xellvio audiences with Google Ads.','Upload customer match audiences and import conversion data from Google Ads.','advertising','googleads','#4285F4','https://ads.google.com','oauth2',720,4.2,false,ARRAY['ads','audiences','conversions']),
 ('Webhooks','webhooks','Custom endpoints','Send Xellvio events to any HTTPS endpoint.','A first-party developer connector: subscribe to Xellvio triggers and receive signed JSON payloads anywhere.','developer-tools','webhooks','#0F172A','https://xellvio.com','custom',1560,4.7,true,ARRAY['webhook','api','custom','developer'])
) AS v(name, slug, tagline, short_desc, long_desc, cat_slug, icon_slug, accent, website, auth_type, installs, rating, featured, keywords)
JOIN public.app_categories c ON c.slug = v.cat_slug
CROSS JOIN public.developers d
WHERE d.is_first_party = true;

INSERT INTO public.app_features (app_id, title, description, icon, sort_order)
SELECT a.id, f.title, f.description, f.icon, f.ord
FROM public.apps a
CROSS JOIN (VALUES
 ('Two-way data sync','Records stay aligned in both directions with conflict-safe updates.','RefreshCw',1),
 ('Canonical field mapping','Fields map to the Xellvio universal contact, order and payment model.','GitCompare',2),
 ('Automation ready','Use this app as a trigger or action step inside Xellvio Automations.','Workflow',3),
 ('Secure credentials','Tokens are encrypted and stored server-side only.','ShieldCheck',4)
) AS f(title, description, icon, ord);

INSERT INTO public.app_actions (app_id, name, slug, description, canonical_entity)
SELECT a.id, x.name, x.slug, x.description, x.entity
FROM public.apps a
CROSS JOIN (VALUES
 ('Create contact','create-contact','Create a contact or customer record in the connected app.','contact'),
 ('Update contact','update-contact','Update an existing contact by email, phone or external id.','contact'),
 ('Create order','create-order','Create an order or transaction record.','order'),
 ('Send message','send-message','Send a message or notification through the connected app.','message')
) AS x(name, slug, description, entity);

INSERT INTO public.app_triggers (app_id, name, slug, description, canonical_entity)
SELECT a.id, x.name, x.slug, x.description, x.entity
FROM public.apps a
CROSS JOIN (VALUES
 ('New contact','new-contact','Fires when a new contact or customer is created.','contact'),
 ('New order','new-order','Fires when a new order is placed.','order'),
 ('Payment completed','payment-completed','Fires when a payment succeeds.','payment'),
 ('Form submitted','form-submitted','Fires when a form submission is received.','form_submission')
) AS x(name, slug, description, entity);

INSERT INTO public.app_versions (app_id, version, changelog, status)
SELECT id, '1.0.0', 'Initial marketplace release.', 'published' FROM public.apps;