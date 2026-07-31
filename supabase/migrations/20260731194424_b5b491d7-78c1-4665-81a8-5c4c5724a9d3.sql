DROP FUNCTION IF EXISTS public.admin_finance_tenants();
CREATE FUNCTION public.admin_finance_tenants()
 RETURNS TABLE(account_id uuid, label text, email text, balance numeric, funded numeric, funded_payments bigint, last_funded_at timestamp with time zone, pending_funding numeric, granted numeric, topups numeric, spent numeric, refunded numeric, ledger_balance numeric, drift numeric, messages bigint, carrier_cost numeric, profit numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT CASE WHEN public.is_admin_or_service() THEN true
                             ELSE (SELECT true WHERE false) END AS ok),
  pay AS (
    SELECT account_id,
           SUM(credits) FILTER (WHERE status='paid') AS funded,
           COUNT(*) FILTER (WHERE status='paid') AS funded_payments,
           MAX(paid_at) FILTER (WHERE status='paid') AS last_funded_at,
           SUM(credits) FILTER (WHERE status='pending') AS pending_funding
    FROM public.payments GROUP BY account_id
  ),
  led AS (
    SELECT account_id,
           SUM(amount) FILTER (WHERE type='topup') AS topups,
           SUM(amount) FILTER (WHERE type='debit') AS spent,
           SUM(amount) FILTER (WHERE type='refund') AS refunded
    FROM public.credit_transactions GROUP BY account_id
  ),
  msg AS (
    SELECT c.account_id,
           COUNT(*) AS messages,
           SUM((COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
               * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost,
           SUM(m.cost) AS tenant_spend
    FROM public.messages m
    JOIN public.campaigns c ON c.id = m.campaign_id
    LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
    WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    GROUP BY c.account_id
  )
  SELECT a.id,
         COALESCE(NULLIF(a.legal_business_name,''), NULLIF(a.company,''), NULLIF(a.full_name,''), a.email, a.id::text),
         COALESCE(a.contact_email, a.email, ''),
         COALESCE(a.credit_balance,0),
         COALESCE(pay.funded,0), COALESCE(pay.funded_payments,0), pay.last_funded_at,
         COALESCE(pay.pending_funding,0),
         -- credit added to the wallet that no confirmed payment backs
         ROUND(COALESCE(led.topups,0) - COALESCE(pay.funded,0), 4),
         COALESCE(led.topups,0),
         COALESCE(led.spent,0), COALESCE(led.refunded,0),
         -- what the wallet should be, straight from the transaction ledger
         ROUND(COALESCE(led.topups,0) - COALESCE(led.spent,0) + COALESCE(led.refunded,0), 4),
         ROUND(COALESCE(a.credit_balance,0) - (COALESCE(led.topups,0) - COALESCE(led.spent,0) + COALESCE(led.refunded,0)), 4),
         COALESCE(msg.messages,0), ROUND(COALESCE(msg.carrier_cost,0),4),
         ROUND(COALESCE(msg.tenant_spend,0) - COALESCE(msg.carrier_cost,0), 4)
  FROM public.accounts a
  CROSS JOIN guard
  LEFT JOIN pay ON pay.account_id = a.id
  LEFT JOIN led ON led.account_id = a.id
  LEFT JOIN msg ON msg.account_id = a.id
  ORDER BY COALESCE(a.credit_balance,0) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_finance_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  res jsonb;
BEGIN
  IF NOT public.is_admin_or_service() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT jsonb_build_object(
    'money_in', (
      SELECT jsonb_build_object(
        'confirmed_credits', COALESCE(SUM(credits) FILTER (WHERE status = 'paid'), 0),
        'confirmed_count',   COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0),
        'pending_credits',   COALESCE(SUM(credits) FILTER (WHERE status = 'pending'), 0),
        'pending_count',     COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0),
        'failed_count',      COALESCE(COUNT(*) FILTER (WHERE status IN ('failed','cancelled')), 0),
        'last_30d',          COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '30 days'), 0),
        'last_7d',           COALESCE(SUM(credits) FILTER (WHERE status='paid' AND created_at >= now() - interval '7 days'), 0)
      ) FROM public.payments
    ),
    'by_provider', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT provider, COUNT(*) AS payments, SUM(credits) AS credits
        FROM public.payments WHERE status='paid'
        GROUP BY provider ORDER BY SUM(credits) DESC
      ) x
    ),
    'ledger', (
      SELECT jsonb_build_object(
        'topups',   COALESCE(SUM(amount) FILTER (WHERE type='topup'), 0),
        'debits',   COALESCE(SUM(amount) FILTER (WHERE type='debit'), 0),
        'refunds',  COALESCE(SUM(amount) FILTER (WHERE type='refund'), 0),
        'debits_30d', COALESCE(SUM(amount) FILTER (WHERE type='debit' AND created_at >= now() - interval '30 days'), 0)
      ) FROM public.credit_transactions
    ),
    'wallets', (
      SELECT jsonb_build_object(
        'unused_credits', COALESCE(SUM(credit_balance), 0),
        'negative_balances', COALESCE(SUM(credit_balance) FILTER (WHERE credit_balance < 0), 0),
        'tenants', COUNT(*)
      ) FROM public.accounts
    ),
    'reconciliation', (
      SELECT jsonb_build_object(
        'wallet_total',   COALESCE((SELECT SUM(credit_balance) FROM public.accounts), 0),
        'ledger_total',   COALESCE((SELECT SUM(CASE WHEN type='debit' THEN -amount ELSE amount END) FROM public.credit_transactions WHERE type IN ('topup','debit','refund')), 0),
        'granted_credit', COALESCE((SELECT SUM(amount) FROM public.credit_transactions WHERE type='topup'), 0)
                          - COALESCE((SELECT SUM(credits) FROM public.payments WHERE status='paid'), 0),
        'drift',          COALESCE((SELECT SUM(credit_balance) FROM public.accounts), 0)
                          - COALESCE((SELECT SUM(CASE WHEN type='debit' THEN -amount ELSE amount END) FROM public.credit_transactions WHERE type IN ('topup','debit','refund')), 0)
      )
    ),
    'usage', (
      SELECT jsonb_build_object(
        'messages',     COALESCE(COUNT(*), 0),
        'segments',     COALESCE(SUM(COALESCE(m.segments_count,1)), 0),
        'mms',          COALESCE(COUNT(*) FILTER (WHERE m.is_mms), 0),
        'tenant_spend', COALESCE(SUM(m.cost), 0),
        'carrier_cost', COALESCE(SUM(
            (COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END), 0),
        'tenant_spend_30d', COALESCE(SUM(m.cost) FILTER (WHERE m.created_at >= now() - interval '30 days'), 0),
        'carrier_cost_30d', COALESCE(SUM(
            (COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
            * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END)
            FILTER (WHERE m.created_at >= now() - interval '30 days'), 0)
      )
      FROM public.messages m
      LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
      WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
    ),
    'inbound', (
      SELECT jsonb_build_object(
        'messages', COALESCE(COUNT(*),0),
        'carrier_cost', COALESCE(COUNT(*),0) * COALESCE((SELECT inbound_cost FROM public.country_rates WHERE country_code='US'),0)
      )
      FROM public.sms_thread_messages t
      WHERE t.direction = 'inbound'
    ),
    'by_country', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT COALESCE(m.country_code,'??') AS country,
               COUNT(*) AS messages,
               SUM(COALESCE(m.segments_count,1)) AS segments,
               COUNT(*) FILTER (WHERE m.is_mms) AS mms,
               SUM(m.cost) AS tenant_spend,
               SUM((COALESCE(cr.cost_price,0) + COALESCE(cr.passthrough_fee,0)) * COALESCE(m.segments_count,1)
                   * CASE WHEN m.is_mms THEN COALESCE(cr.mms_cost_multiplier, cr.mms_multiplier, 3) ELSE 1 END) AS carrier_cost
        FROM public.messages m
        LEFT JOIN public.country_rates cr ON cr.country_code = m.country_code
        WHERE m.status IN ('sent','delivered','delivery_unconfirmed','undelivered')
        GROUP BY 1 ORDER BY SUM(m.cost) DESC NULLS LAST LIMIT 30
      ) x
    )
  ) INTO res;

  RETURN res;
END $function$;