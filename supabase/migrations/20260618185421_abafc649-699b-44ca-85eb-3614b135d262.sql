CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_phone_upsert_key
  ON public.contacts (user_id, phone);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_upsert_key
  ON public.contacts (user_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_external_id_upsert_key
  ON public.contacts (user_id, external_id);