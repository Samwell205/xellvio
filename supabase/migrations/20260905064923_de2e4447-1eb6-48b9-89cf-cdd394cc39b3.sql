WITH ins AS (
  INSERT INTO public.apps (
    developer_id, category_id, name, slug, tagline, short_description, long_description,
    accent_color, website_url, documentation_url, privacy_url, terms_url, setup_guide,
    auth_type, pricing_type, status, visibility, version, keywords, submitted_at
  )
  SELECT
    d.id, c.id,
    'Xellvio Website Leads',
    'xellvio-website-leads',
    'Turn landing page and sign-up form submissions into SMS-ready contacts',
    'Connects your Xellvio landing pages and sign-up forms to your contact lists, so every lead captured on a published page becomes an SMS-ready contact instantly.',
    'Xellvio Website Leads is the first-party bridge between the Xellvio website builder and your SMS audience. Every submission from a published landing page or sign-up form is normalised (phone numbers to E.164, emails lowercased), de-duplicated against your existing audience, tagged with its source page and UTM parameters, and added to the contact list you choose. Consent captured on the form is stored with the lead, so opt-in evidence travels with the contact. Because it is built into Xellvio, there are no API keys to manage and no data leaves your workspace.',
    '#4F46E5',
    'https://xellvio.com',
    'https://xellvio.com/marketplace/developers',
    'https://xellvio.com/privacy',
    'https://xellvio.com/terms',
    E'1. Install the app from your workspace apps page.\n2. Choose the contact list that new website leads should join.\n3. Publish a landing page or sign-up form from the website builder.\n4. New submissions appear in that list within seconds, with their source page and consent recorded.',
    'none', 'free', 'submitted', 'public', '1.0.0',
    ARRAY['landing page','sign-up form','leads','contacts','forms','website','opt-in'],
    now()
  FROM public.developers d, public.app_categories c
  WHERE d.is_first_party = true AND c.slug = 'forms'
  ON CONFLICT (slug) DO NOTHING
  RETURNING id
)
INSERT INTO public.app_features (app_id, title, description, icon, sort_order)
SELECT id, t.title, t.description, t.icon, t.ord FROM ins, (VALUES
  ('Instant lead sync', 'Submissions from published pages and forms become contacts immediately.', 'zap', 0),
  ('Clean, de-duplicated data', 'Phone numbers normalised to E.164 and matched against your existing audience.', 'users', 1),
  ('Consent stored with the lead', 'Opt-in wording and the timestamp travel with every contact.', 'shield', 2),
  ('Source and UTM attribution', 'See exactly which page and campaign produced each lead.', 'chart', 3)
) AS t(title, description, icon, ord);

INSERT INTO public.app_actions (app_id, name, slug, description, canonical_entity, input_schema)
SELECT a.id, t.name, t.slug, t.description, t.entity, t.schema::jsonb
FROM public.apps a, (VALUES
  ('Create or update contact', 'upsert-contact', 'Create a contact, or update the existing one matched by phone or email.', 'contact', '{"phone":"string","email":"string","first_name":"string","last_name":"string","consent":"boolean"}'),
  ('Add contact to list', 'add-to-list', 'Add a contact to one of your Xellvio contact lists.', 'contact', '{"contact_id":"uuid","list_id":"uuid"}'),
  ('Send SMS', 'send-sms', 'Send a transactional SMS to a captured lead, such as a welcome message.', 'message', '{"phone":"string","body":"string"}')
) AS t(name, slug, description, entity, schema)
WHERE a.slug = 'xellvio-website-leads'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_triggers (app_id, name, slug, description, canonical_entity, payload_schema)
SELECT a.id, t.name, t.slug, t.description, t.entity, t.schema::jsonb
FROM public.apps a, (VALUES
  ('Sign-up form submitted', 'form-submitted', 'Fires when a published sign-up form is submitted.', 'contact', '{"form_id":"uuid","payload":"object","utm":"object"}'),
  ('Landing page lead captured', 'landing-lead', 'Fires when a published landing page captures a lead.', 'contact', '{"page_id":"uuid","payload":"object","utm":"object"}'),
  ('Reply received from a lead', 'reply-received', 'Fires when a captured lead replies to an SMS.', 'message', '{"phone":"string","body":"string"}')
) AS t(name, slug, description, entity, schema)
WHERE a.slug = 'xellvio-website-leads'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_versions (app_id, version, changelog, status)
SELECT a.id, '1.0.0',
  E'First release.\n- Sync landing page and sign-up form submissions to contact lists\n- Phone normalisation and de-duplication\n- Consent, source page and UTM capture',
  'submitted'
FROM public.apps a WHERE a.slug = 'xellvio-website-leads'
ON CONFLICT DO NOTHING;