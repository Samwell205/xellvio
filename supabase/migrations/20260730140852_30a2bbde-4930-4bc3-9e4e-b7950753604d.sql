ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS charged_amount numeric(14,4),
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 0;

CREATE TABLE public.message_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  authorization_source text NOT NULL DEFAULT 'original_campaign',
  authorized_by uuid,
  reason text,
  tenant_charge numeric(14,4) NOT NULL DEFAULT 0,
  estimated_carrier_cost numeric(14,6) NOT NULL DEFAULT 0,
  provider_message_id text,
  provider_status text NOT NULL DEFAULT 'reserved',
  error_code text,
  failure_reason text,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, attempt_number)
);
GRANT SELECT ON public.message_send_attempts TO authenticated;
GRANT ALL ON public.message_send_attempts TO service_role;
ALTER TABLE public.message_send_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view message attempts"
ON public.message_send_attempts FOR SELECT TO authenticated
USING (public.has_account_access(account_id, 'viewer'));
CREATE TRIGGER message_send_attempts_touch_updated_at
BEFORE UPDATE ON public.message_send_attempts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX message_send_attempts_campaign_created_idx
ON public.message_send_attempts(campaign_id, created_at DESC);
CREATE INDEX message_send_attempts_account_created_idx
ON public.message_send_attempts(account_id, created_at DESC);

DROP FUNCTION public.claim_campaign_messages(uuid, integer);

CREATE FUNCTION public.claim_campaign_messages(_campaign_id uuid, _limit integer)
RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text, segments_count integer, cost numeric, attempt_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  campaign_account uuid;
  current_balance numeric;
  profitable_price numeric;
  carrier_cost numeric;
  next_attempt integer;
  claimed integer := 0;
BEGIN
  SELECT account_id INTO campaign_account
  FROM public.campaigns
  WHERE campaigns.id = _campaign_id;
  IF campaign_account IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  FOR rec IN
    SELECT m.id, m.phone_e164, m.rendered_body, m.country_code,
           COALESCE(m.segments_count, 1) AS segments_count,
           COALESCE(m.is_mms, false) AS is_mms,
           COALESCE(m.attempt_number, 0) AS previous_attempt,
           cr.sell_price, cr.cost_price, cr.passthrough_fee,
           cr.mms_multiplier, cr.mms_cost_multiplier
    FROM public.messages m
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code AND cr.active = true
    WHERE m.campaign_id = _campaign_id
      AND (
        m.status = 'queued'
        OR (
          m.status = 'sending'
          AND m.provider_message_id IS NULL
          AND (m.dispatch_started_at IS NULL OR m.dispatch_started_at < now() - interval '2 minutes')
        )
      )
      AND m.charged_at IS NULL
    ORDER BY m.cost ASC NULLS FIRST, m.created_at ASC
    FOR UPDATE OF m SKIP LOCKED
    LIMIT GREATEST(0, _limit)
  LOOP
    IF rec.sell_price IS NULL THEN
      UPDATE public.messages
      SET status='failed', error_code='rate_unavailable', failure_reason='No active price is available for this destination.'
      WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    profitable_price := ROUND(
      rec.sell_price * rec.segments_count *
      CASE WHEN rec.is_mms THEN COALESCE(rec.mms_multiplier, 1) ELSE 1 END,
      4
    );
    carrier_cost := ROUND(
      (COALESCE(rec.cost_price,0) + COALESCE(rec.passthrough_fee,0)) * rec.segments_count *
      CASE WHEN rec.is_mms THEN COALESCE(rec.mms_cost_multiplier, rec.mms_multiplier, 1) ELSE 1 END,
      6
    );
    next_attempt := rec.previous_attempt + 1;

    UPDATE public.accounts
    SET credit_balance = credit_balance - profitable_price
    WHERE accounts.id = campaign_account
      AND credit_balance >= profitable_price
    RETURNING credit_balance INTO current_balance;

    IF current_balance IS NULL THEN
      UPDATE public.messages
      SET status='failed', error_code='insufficient_balance', failure_reason='Insufficient account credit for this send attempt.'
      WHERE messages.id=rec.id;
      CONTINUE;
    END IF;

    INSERT INTO public.credit_transactions(account_id, type, amount, balance_after, campaign_id, description)
    VALUES (campaign_account, 'debit', profitable_price, current_balance, _campaign_id,
      'Reserved SMS attempt ' || next_attempt || ' → ' || rec.phone_e164 || ' (' || COALESCE(rec.country_code,'??') || ') × ' || rec.segments_count);

    UPDATE public.messages
    SET status='sending', dispatch_started_at=now(), cost=profitable_price,
        charged_at=now(), charged_amount=profitable_price, attempt_number=next_attempt
    WHERE messages.id=rec.id;

    INSERT INTO public.message_send_attempts(
      message_id, campaign_id, account_id, attempt_number, authorization_source,
      reason, tenant_charge, estimated_carrier_cost, provider_status
    ) VALUES (
      rec.id, _campaign_id, campaign_account, next_attempt,
      CASE WHEN next_attempt = 1 THEN 'original_campaign' ELSE 'manual_retry' END,
      CASE WHEN next_attempt = 1 THEN 'Original campaign send' ELSE 'Explicitly approved retry' END,
      profitable_price, carrier_cost, 'reserved'
    );

    id := rec.id;
    phone_e164 := rec.phone_e164;
    rendered_body := rec.rendered_body;
    country_code := rec.country_code;
    segments_count := rec.segments_count;
    cost := profitable_price;
    attempt_number := next_attempt;
    claimed := claimed + 1;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(uuid, integer) TO service_role;