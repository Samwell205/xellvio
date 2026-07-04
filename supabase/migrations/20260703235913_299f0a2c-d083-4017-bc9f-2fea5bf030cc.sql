-- ============================================================
-- Content screening + ToS compliance infrastructure
-- ============================================================

-- 1) content_screening_log ------------------------------------
CREATE TABLE public.content_screening_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  blocked_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('passed','held_for_review','blocked')),
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.content_screening_log TO authenticated;
GRANT ALL ON public.content_screening_log TO service_role;
ALTER TABLE public.content_screening_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own screening log" ON public.content_screening_log
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "Admins read all screening" ON public.content_screening_log
  FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX content_screening_log_account_created_idx
  ON public.content_screening_log(account_id, created_at DESC);
CREATE INDEX content_screening_log_campaign_idx
  ON public.content_screening_log(campaign_id);

-- 2) review_queue ---------------------------------------------
CREATE TABLE public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  blocked_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','auto_approved','expired')),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  auto_approve_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 hours'),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.review_queue TO authenticated;
GRANT ALL ON public.review_queue TO service_role;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own review queue" ON public.review_queue
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "Admins manage review queue" ON public.review_queue
  FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE INDEX review_queue_status_idx ON public.review_queue(status, created_at DESC);
CREATE INDEX review_queue_account_idx ON public.review_queue(account_id, created_at DESC);
CREATE INDEX review_queue_campaign_idx ON public.review_queue(campaign_id);
CREATE TRIGGER review_queue_updated_at BEFORE UPDATE ON public.review_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) blocked_domains ------------------------------------------
CREATE TABLE public.blocked_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  is_shortener BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  allowed_by_accounts UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_domains TO authenticated, anon;
GRANT ALL ON public.blocked_domains TO service_role;
ALTER TABLE public.blocked_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read blocklist" ON public.blocked_domains
  FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Admins manage blocklist" ON public.blocked_domains
  FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Seed known cloaking shorteners
INSERT INTO public.blocked_domains(domain, is_shortener, reason) VALUES
  ('bit.ly', true, 'URL shortener commonly used for cloaking'),
  ('tinyurl.com', true, 'URL shortener commonly used for cloaking'),
  ('goo.gl', true, 'URL shortener (deprecated by Google)'),
  ('ow.ly', true, 'URL shortener'),
  ('t.co', true, 'URL shortener'),
  ('is.gd', true, 'URL shortener'),
  ('buff.ly', true, 'URL shortener'),
  ('cutt.ly', true, 'URL shortener'),
  ('rebrand.ly', true, 'URL shortener'),
  ('shorturl.at', true, 'URL shortener'),
  ('rb.gy', true, 'URL shortener'),
  ('tiny.cc', true, 'URL shortener'),
  ('lnkd.in', true, 'URL shortener')
ON CONFLICT (domain) DO NOTHING;

-- 4) tos_acceptances (account-level) --------------------------
CREATE TABLE public.tos_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tos_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(tenant_account_id, tos_version)
);
GRANT SELECT, INSERT ON public.tos_acceptances TO authenticated;
GRANT ALL ON public.tos_acceptances TO service_role;
ALTER TABLE public.tos_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own tos acceptances" ON public.tos_acceptances
  FOR SELECT TO authenticated USING (tenant_account_id = auth.uid());
CREATE POLICY "Tenant records own tos acceptance" ON public.tos_acceptances
  FOR INSERT TO authenticated WITH CHECK (tenant_account_id = auth.uid());
CREATE POLICY "Admins read all tos acceptances" ON public.tos_acceptances
  FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX tos_acceptances_tenant_idx ON public.tos_acceptances(tenant_account_id, accepted_at DESC);

-- 5) campaign_tos_acceptances (per-campaign) ------------------
CREATE TABLE public.campaign_tos_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  tenant_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tos_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  UNIQUE(campaign_id)
);
GRANT SELECT, INSERT ON public.campaign_tos_acceptances TO authenticated;
GRANT ALL ON public.campaign_tos_acceptances TO service_role;
ALTER TABLE public.campaign_tos_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own campaign tos" ON public.campaign_tos_acceptances
  FOR SELECT TO authenticated USING (tenant_account_id = auth.uid());
CREATE POLICY "Tenant records own campaign tos" ON public.campaign_tos_acceptances
  FOR INSERT TO authenticated WITH CHECK (tenant_account_id = auth.uid());
CREATE POLICY "Admins read all campaign tos" ON public.campaign_tos_acceptances
  FOR SELECT TO authenticated USING (public.has_role('admin'));
CREATE INDEX campaign_tos_tenant_idx ON public.campaign_tos_acceptances(tenant_account_id, accepted_at DESC);

-- 6) tenant_sending_suspensions -------------------------------
CREATE TABLE public.tenant_sending_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  telnyx_profile_id TEXT,
  telnyx_error TEXT
);
GRANT SELECT ON public.tenant_sending_suspensions TO authenticated;
GRANT ALL ON public.tenant_sending_suspensions TO service_role;
ALTER TABLE public.tenant_sending_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant reads own suspensions" ON public.tenant_sending_suspensions
  FOR SELECT TO authenticated USING (account_id = auth.uid());
CREATE POLICY "Admins manage suspensions" ON public.tenant_sending_suspensions
  FOR ALL TO authenticated USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE INDEX tenant_suspensions_account_idx ON public.tenant_sending_suspensions(account_id, suspended_at DESC);

-- 7) accounts extension: sending pause + current tos version --
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS sending_suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sending_suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS tos_current_version_accepted TEXT;

-- 8) profiles extension: mark high-frequency two-way contacts -
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS two_way_opt_in BOOLEAN NOT NULL DEFAULT false;

-- 9) Allow system fields on accounts to be updated by admin/service ONLY.
-- The existing guard trigger already blocks tenants from touching suspended_at;
-- extend the same protection to the new sending_suspended_* columns.
CREATE OR REPLACE FUNCTION public.accounts_block_sensitive_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS NULL
     OR COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') = 'service_role'
     OR public.has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.sending_suspended_at IS DISTINCT FROM OLD.sending_suspended_at
     OR NEW.sending_suspended_reason IS DISTINCT FROM OLD.sending_suspended_reason
     OR NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status
     OR NEW.twilio_subaccount_sid IS DISTINCT FROM OLD.twilio_subaccount_sid
     OR NEW.twilio_subaccount_auth_token_enc IS DISTINCT FROM OLD.twilio_subaccount_auth_token_enc
     OR NEW.subaccount_phone_number IS DISTINCT FROM OLD.subaccount_phone_number
     OR NEW.subaccount_phone_sid IS DISTINCT FROM OLD.subaccount_phone_sid
     OR NEW.subaccount_messaging_service_sid IS DISTINCT FROM OLD.subaccount_messaging_service_sid
  THEN
    RAISE EXCEPTION 'Not allowed to modify system-managed account fields';
  END IF;

  RETURN NEW;
END;
$function$;