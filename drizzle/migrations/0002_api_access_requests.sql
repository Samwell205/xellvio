CREATE TABLE public.api_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  company_name text NOT NULL,
  website text,
  use_case text NOT NULL,
  reason text NOT NULL,
  expected_monthly_volume integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_access_requests_account_idx ON public.api_access_requests(account_id, created_at DESC);
GRANT ALL ON public.api_access_requests TO service_role;
ALTER TABLE public.api_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.api_access_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.authenticate_workspace_api_key(_key_hash text, _request_id text, _method text, _path text)
 RETURNS TABLE(api_key_id uuid, account_id uuid, scopes text[], rate_limit_per_minute integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _key public.workspace_api_keys%ROWTYPE;
  _recent integer;
  _account public.accounts%ROWTYPE;
BEGIN
  SELECT * INTO _key FROM public.workspace_api_keys
  WHERE key_hash = _key_hash AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;
  IF _key.id IS NULL THEN RAISE EXCEPTION 'invalid_api_key'; END IF;

  SELECT * INTO _account FROM public.accounts WHERE id = _key.account_id;
  IF _account.id IS NULL OR _account.sending_suspended_at IS NOT NULL OR _account.onboarding_status = 'suspended' THEN
    RAISE EXCEPTION 'account_suspended';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.api_access_requests r WHERE r.account_id = _key.account_id AND r.status = 'approved') THEN
    RAISE EXCEPTION 'api_access_not_approved';
  END IF;

  SELECT count(*)::integer INTO _recent FROM public.api_request_log
  WHERE api_key_id = _key.id AND created_at >= now() - interval '1 minute';
  IF _recent >= _key.rate_limit_per_minute THEN RAISE EXCEPTION 'rate_limit_exceeded'; END IF;

  UPDATE public.workspace_api_keys SET last_used_at = now() WHERE id = _key.id;
  INSERT INTO public.api_request_log(account_id, api_key_id, method, path, request_id)
  VALUES (_key.account_id, _key.id, left(_method,10), left(_path,300), left(_request_id,100));

  RETURN QUERY SELECT _key.id, _key.account_id, _key.scopes, _key.rate_limit_per_minute;
END;
$function$;