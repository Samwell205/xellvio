CREATE TABLE public.api_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  api_key_id uuid NOT NULL REFERENCES public.workspace_api_keys(id) ON DELETE CASCADE,
  method text NOT NULL,
  path text NOT NULL,
  request_id text NOT NULL,
  response_status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_request_log TO authenticated;
GRANT ALL ON public.api_request_log TO service_role;
ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read workspace api requests" ON public.api_request_log
  FOR SELECT TO authenticated USING (public.has_account_access(account_id, 'admin'::public.account_member_role));
CREATE INDEX api_request_log_key_created_idx ON public.api_request_log(api_key_id, created_at DESC);
CREATE INDEX api_request_log_account_created_idx ON public.api_request_log(account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.authenticate_workspace_api_key(_key_hash text, _request_id text, _method text, _path text)
RETURNS TABLE(api_key_id uuid, account_id uuid, scopes text[], rate_limit_per_minute integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  SELECT count(*)::integer INTO _recent FROM public.api_request_log
  WHERE api_key_id = _key.id AND created_at >= now() - interval '1 minute';
  IF _recent >= _key.rate_limit_per_minute THEN RAISE EXCEPTION 'rate_limit_exceeded'; END IF;

  UPDATE public.workspace_api_keys SET last_used_at = now() WHERE id = _key.id;
  INSERT INTO public.api_request_log(account_id, api_key_id, method, path, request_id)
  VALUES (_key.account_id, _key.id, left(_method,10), left(_path,300), left(_request_id,100));

  RETURN QUERY SELECT _key.id, _key.account_id, _key.scopes, _key.rate_limit_per_minute;
END;
$$;
REVOKE ALL ON FUNCTION public.authenticate_workspace_api_key(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_workspace_api_key(text,text,text,text) TO service_role;