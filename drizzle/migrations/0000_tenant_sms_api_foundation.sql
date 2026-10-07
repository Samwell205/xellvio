ALTER TABLE public.workspace_api_keys
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT ARRAY['messages:send','messages:read','replies:read','webhooks:manage']::text[],
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.workspace_api_keys
  DROP CONSTRAINT IF EXISTS workspace_api_keys_rate_limit_check;
ALTER TABLE public.workspace_api_keys
  ADD CONSTRAINT workspace_api_keys_rate_limit_check CHECK (rate_limit_per_minute BETWEEN 1 AND 1000);

CREATE TABLE public.api_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  api_key_id uuid NOT NULL REFERENCES public.workspace_api_keys(id) ON DELETE RESTRICT,
  recipient_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id)
);
GRANT SELECT ON public.api_batches TO authenticated;
GRANT ALL ON public.api_batches TO service_role;
ALTER TABLE public.api_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read workspace api batches" ON public.api_batches
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'viewer'::public.account_member_role));
CREATE INDEX api_batches_account_created_idx ON public.api_batches(account_id, created_at DESC);

CREATE TABLE public.api_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  api_key_id uuid NOT NULL REFERENCES public.workspace_api_keys(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (api_key_id, idempotency_key)
);
GRANT SELECT ON public.api_idempotency_records TO authenticated;
GRANT ALL ON public.api_idempotency_records TO service_role;
ALTER TABLE public.api_idempotency_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read workspace idempotency records" ON public.api_idempotency_records
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'admin'::public.account_member_role));
CREATE INDEX api_idempotency_expiry_idx ON public.api_idempotency_records(expires_at);

CREATE TABLE public.api_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  secret_ciphertext text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['message.delivered','message.failed','reply.received','contact.opted_out']::text[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
);
GRANT SELECT ON public.api_webhook_endpoints TO authenticated;
GRANT ALL ON public.api_webhook_endpoints TO service_role;
ALTER TABLE public.api_webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read workspace webhook endpoints" ON public.api_webhook_endpoints
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'admin'::public.account_member_role));
CREATE INDEX api_webhook_endpoints_account_idx ON public.api_webhook_endpoints(account_id, active);

CREATE TABLE public.api_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.api_webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_type, resource_id)
);
GRANT SELECT ON public.api_webhook_events TO authenticated;
GRANT ALL ON public.api_webhook_events TO service_role;
ALTER TABLE public.api_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read workspace webhook events" ON public.api_webhook_events
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'admin'::public.account_member_role));
CREATE INDEX api_webhook_events_due_idx ON public.api_webhook_events(status, available_at) WHERE status IN ('pending','retrying');
CREATE INDEX api_webhook_events_account_created_idx ON public.api_webhook_events(account_id, created_at DESC);

CREATE TABLE public.api_webhook_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.api_webhook_events(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  response_status integer,
  response_body text,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_webhook_delivery_attempts TO authenticated;
GRANT ALL ON public.api_webhook_delivery_attempts TO service_role;
ALTER TABLE public.api_webhook_delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read workspace webhook attempts" ON public.api_webhook_delivery_attempts
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'admin'::public.account_member_role));
CREATE INDEX api_webhook_attempts_event_idx ON public.api_webhook_delivery_attempts(event_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_api_sms_batch(
  _account_id uuid,
  _api_key_id uuid,
  _name text,
  _body text,
  _recipients jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE(batch_id uuid, campaign_id uuid, accepted_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _campaign_id uuid;
  _batch_id uuid;
  _profile_ids uuid[];
  _accepted integer;
BEGIN
  IF jsonb_typeof(_recipients) <> 'array' OR jsonb_array_length(_recipients) < 1 OR jsonb_array_length(_recipients) > 1000 THEN
    RAISE EXCEPTION 'Recipient count must be between 1 and 1000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(_recipients) AS r(phone text, consent_confirmed boolean)
    WHERE r.phone IS NULL OR r.phone !~ '^\+[1-9][0-9]{6,14}$' OR r.consent_confirmed IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Every recipient must use E.164 format and have consent_confirmed=true';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(_recipients) AS r(phone text, consent_confirmed boolean)
    JOIN public.suppressions s ON s.account_id = _account_id AND s.phone_e164 = r.phone
  ) THEN
    RAISE EXCEPTION 'One or more recipients opted out';
  END IF;

  WITH src AS (
    SELECT DISTINCT r.phone
    FROM jsonb_to_recordset(_recipients) AS r(phone text, consent_confirmed boolean)
  ), ins AS (
    INSERT INTO public.profiles(account_id, phone_e164)
    SELECT _account_id, phone FROM src
    ON CONFLICT (account_id, phone_e164) DO UPDATE SET updated_at = now()
    RETURNING id
  )
  SELECT array_agg(id), count(*)::integer INTO _profile_ids, _accepted FROM ins;

  INSERT INTO public.consents(profile_id, channel, status, source, consented_at)
  SELECT id, 'sms', 'subscribed', 'api_confirmed', now()
  FROM public.profiles
  WHERE id = ANY(_profile_ids)
  ON CONFLICT (profile_id, channel) DO UPDATE
    SET status = CASE WHEN public.consents.status = 'unsubscribed' THEN public.consents.status ELSE 'subscribed' END,
        source = CASE WHEN public.consents.status = 'unsubscribed' THEN public.consents.source ELSE 'api_confirmed' END,
        consented_at = CASE WHEN public.consents.status = 'unsubscribed' THEN public.consents.consented_at ELSE now() END;

  INSERT INTO public.campaigns(account_id, name, status, audience, message_body, send_mode, schedule_at)
  VALUES (_account_id, left(_name, 120), 'queued', jsonb_build_object('include','[]'::jsonb,'exclude','[]'::jsonb,'profile_ids',to_jsonb(_profile_ids)), _body, 'immediate', NULL)
  RETURNING id INTO _campaign_id;

  INSERT INTO public.api_batches(account_id, campaign_id, api_key_id, recipient_count, accepted_count, metadata)
  VALUES (_account_id, _campaign_id, _api_key_id, jsonb_array_length(_recipients), _accepted, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _batch_id;

  RETURN QUERY SELECT _batch_id, _campaign_id, _accepted;
END;
$$;
REVOKE ALL ON FUNCTION public.create_api_sms_batch(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_api_sms_batch(uuid,uuid,text,text,jsonb,jsonb) TO service_role;