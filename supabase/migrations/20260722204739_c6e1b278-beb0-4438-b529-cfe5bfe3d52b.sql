
ALTER TABLE public.country_rates
  ADD COLUMN IF NOT EXISTS mms_cost_multiplier numeric(6,2) NOT NULL DEFAULT 3.0;

UPDATE public.country_rates SET mms_cost_multiplier = mms_multiplier
  WHERE mms_cost_multiplier = 3.0 AND mms_multiplier IS NOT NULL AND mms_multiplier <> 3.0;

UPDATE public.country_rates
  SET mms_cost_multiplier = 6.0, mms_multiplier = 6.0, updated_at = now()
  WHERE country_code = 'US';

UPDATE public.country_rates
  SET mms_cost_multiplier = 4.0, mms_multiplier = 5.0, updated_at = now()
  WHERE country_code = 'CA';

DROP FUNCTION IF EXISTS public.admin_campaign_stats();

CREATE OR REPLACE FUNCTION public.admin_campaign_stats()
RETURNS TABLE (
  campaign_id uuid,
  total bigint,
  delivered bigint,
  failed bigint,
  sent bigint,
  delivery_unconfirmed bigint,
  queued bigint,
  tenant_cost numeric,
  telnyx_cost numeric,
  segments bigint,
  mms_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.campaign_id,
    count(*)::bigint,
    count(*) FILTER (WHERE m.status = 'delivered')::bigint,
    count(*) FILTER (WHERE m.status IN ('failed','undelivered'))::bigint,
    count(*) FILTER (WHERE m.status = 'sent')::bigint,
    count(*) FILTER (WHERE m.status = 'delivery_unconfirmed')::bigint,
    count(*) FILTER (WHERE m.status IN ('queued','sending','pending'))::bigint,
    coalesce(sum(m.cost),0)::numeric,
    coalesce(sum(
      COALESCE(cr.cost_price,0)
      * COALESCE(m.segments_count,1)
      * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END
    ),0)::numeric,
    coalesce(sum(COALESCE(m.segments_count,1)),0)::bigint,
    count(*) FILTER (WHERE m.is_mms)::bigint
  FROM public.messages m
  LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
  WHERE m.campaign_id IS NOT NULL
  GROUP BY m.campaign_id;
$$;

DO $$
DECLARE
  v_account uuid := '73d366b2-d9e0-4fb3-8635-a3707505ced0';
  v_delta numeric := 0;
  v_msgs int := 0;
  v_new_balance numeric;
  v_already_charged boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE account_id = v_account
      AND type = 'debit'
      AND description LIKE 'MMS pricing correction%'
  ) INTO v_already_charged;

  IF v_already_charged THEN
    RAISE NOTICE 'MMS correction already applied to %', v_account;
    RETURN;
  END IF;

  SELECT count(*), coalesce(count(*) * 0.024, 0)
  INTO v_msgs, v_delta
  FROM public.messages m
  JOIN public.campaigns c ON c.id = m.campaign_id
  WHERE c.account_id = v_account
    AND m.is_mms = true
    AND m.status IN ('delivered','sent','delivery_unconfirmed');

  IF v_msgs = 0 THEN
    RAISE NOTICE 'No MMS to correct for %', v_account;
    RETURN;
  END IF;

  UPDATE public.accounts
    SET credit_balance = credit_balance - v_delta,
        updated_at = now()
    WHERE id = v_account
    RETURNING credit_balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (account_id, type, amount, balance_after, description)
  VALUES (
    v_account,
    'debit',
    v_delta,
    v_new_balance,
    format('MMS pricing correction: %s successful MMS × $0.024 additional carrier cost (previous rate was below Telnyx cost). New MMS price is $0.048/message going forward.', v_msgs)
  );

  UPDATE public.messages m
    SET cost = COALESCE(m.cost,0) + 0.024
    FROM public.campaigns c
    WHERE c.id = m.campaign_id
      AND c.account_id = v_account
      AND m.is_mms = true
      AND m.status IN ('delivered','sent','delivery_unconfirmed');
END $$;
