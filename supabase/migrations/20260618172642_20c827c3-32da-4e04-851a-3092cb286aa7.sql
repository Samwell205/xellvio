
-- Extend contacts to support email/external_id + first/last name (Klaviyo-style identifiers)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS external_id text;

-- Allow phone to be null when only email/external_id is provided
ALTER TABLE public.contacts ALTER COLUMN phone DROP NOT NULL;

-- Require at least one identifier per row
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_identifier_required;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_identifier_required
  CHECK (phone IS NOT NULL OR email IS NOT NULL OR external_id IS NOT NULL);

-- Dedup indexes (per user) for upsert on import
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_phone_unique
  ON public.contacts (user_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_unique
  ON public.contacts (user_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_external_unique
  ON public.contacts (user_id, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts (user_id, lower(email));
