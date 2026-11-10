CREATE INDEX IF NOT EXISTS credit_transactions_account_created_idx ON public.credit_transactions(account_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.account_spend_30d(_account_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _account_id = auth.uid() OR public.has_account_access(_account_id, 'viewer'::account_member_role) OR public.has_role('admin'::app_role)
    THEN GREATEST(0, COALESCE(SUM(CASE WHEN type = 'debit' THEN amount WHEN type = 'refund' THEN -amount ELSE 0 END), 0))
    ELSE NULL END
  FROM public.credit_transactions
  WHERE account_id = _account_id AND created_at > now() - interval '30 days'
$$;
REVOKE ALL ON FUNCTION public.account_spend_30d(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_spend_30d(uuid) TO authenticated, service_role;