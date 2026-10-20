CREATE TABLE public.receptionist_settings (
 account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
 configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
 enabled boolean NOT NULL DEFAULT false,
 assistant_id text, voice_application_id text, voice_number text UNIQUE,
 provision_status text NOT NULL DEFAULT 'not_configured',
 test_verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.receptionist_settings TO service_role;
ALTER TABLE public.receptionist_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.receptionist_platform_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.receptionist_platform_settings TO service_role;
ALTER TABLE public.receptionist_platform_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.app_user_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, connector_id text NOT NULL,
 connection_key_ciphertext text NOT NULL, reconnect_required boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,connector_id)
);
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.receptionist_calls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 call_control_id text NOT NULL UNIQUE, call_session_id text, from_number text NOT NULL, to_number text NOT NULL,
 status text NOT NULL DEFAULT 'ringing', started_at timestamptz NOT NULL DEFAULT now(), answered_at timestamptz, ended_at timestamptz,
 summary text, transcript jsonb, duration_seconds integer, cost_amount numeric(12,6), cost_status text NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.receptionist_calls TO service_role;
ALTER TABLE public.receptionist_calls ENABLE ROW LEVEL SECURITY;
CREATE INDEX receptionist_calls_workspace ON public.receptionist_calls(account_id,started_at DESC);
CREATE TABLE public.receptionist_events (
 event_id text PRIMARY KEY, call_control_id text, event_type text NOT NULL, payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, error text,
 created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
GRANT ALL ON public.receptionist_events TO service_role;
ALTER TABLE public.receptionist_events ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.receptionist_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id),
 call_id uuid NOT NULL REFERENCES public.receptionist_calls(id), phone_e164 text NOT NULL,
 name text, email text, request text NOT NULL, raw_payload jsonb NOT NULL,
 sms_consent boolean NOT NULL DEFAULT false, consent_evidence text,
 status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(call_id)
);
GRANT ALL ON public.receptionist_leads TO service_role;
ALTER TABLE public.receptionist_leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX receptionist_leads_workspace ON public.receptionist_leads(account_id,created_at DESC);
CREATE TABLE public.receptionist_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id),
 lead_id uuid NOT NULL REFERENCES public.receptionist_leads(id), kind text NOT NULL CHECK(kind IN ('sms','email')),
 status text NOT NULL DEFAULT 'pending', outcome jsonb, error text, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(lead_id,kind)
);
GRANT ALL ON public.receptionist_jobs TO service_role;
ALTER TABLE public.receptionist_jobs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.receptionist_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id),
 call_id uuid REFERENCES public.receptionist_calls(id), calendar_id text NOT NULL, event_id text,
 name text NOT NULL, phone_e164 text NOT NULL, email text,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','failed','uncertain')),
 idempotency_key text NOT NULL UNIQUE, error text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at > starts_at)
);
GRANT ALL ON public.receptionist_appointments TO service_role;
ALTER TABLE public.receptionist_appointments ENABLE ROW LEVEL SECURITY;
CREATE INDEX receptionist_appointments_workspace ON public.receptionist_appointments(account_id,starts_at);
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.receptionist_appointments ADD CONSTRAINT receptionist_appointments_no_overlap EXCLUDE USING gist (account_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status IN ('pending','confirmed','uncertain'));
