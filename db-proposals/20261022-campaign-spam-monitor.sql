-- Carrier spam-gate: persistent monitor enrollment, immutable finalized
-- receipts, unique incidents and a durable email outbox.
-- Replaces the misuse of expiring dispatch_locks rows as permanent state.
-- All access goes through the SECURITY DEFINER functions below; the tables
-- are service-role only (RLS enabled, no policies for anon/authenticated).

CREATE TABLE public.campaign_spam_monitors (
  campaign_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'monitoring'
    CHECK (state IN ('monitoring','released','paused_spam','paused_timeout','concluded')),
  submitted_count integer NOT NULL DEFAULT 0,
  finalized_count integer NOT NULL DEFAULT 0,
  spam_count integer NOT NULL DEFAULT 0,
  expected_total integer,
  waiting_since timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Immutable final carrier facts, written ONLY by the signature-verified
-- message.finalized webhook path. One row per (campaign, current provider id).
CREATE TABLE public.campaign_spam_receipts (
  campaign_id uuid NOT NULL,
  provider_message_id text NOT NULL,
  message_id uuid,
  error_code text,
  provider_status text,
  finalized_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, provider_message_id)
);

CREATE TABLE public.campaign_spam_incidents (
  campaign_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('spam','feedback_timeout')),
  paused boolean NOT NULL,
  finalized integer NOT NULL,
  spam integer NOT NULL,
  recipient_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_spam_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.campaign_spam_incidents(campaign_id),
  account_id uuid NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','sent','failed','suppressed','missing')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_spam_email_outbox_due_idx
  ON public.campaign_spam_email_outbox (status, next_retry_at)
  WHERE status IN ('pending','queued');

GRANT ALL ON public.campaign_spam_monitors TO service_role;
GRANT ALL ON public.campaign_spam_receipts TO service_role;
GRANT ALL ON public.campaign_spam_incidents TO service_role;
GRANT ALL ON public.campaign_spam_email_outbox TO service_role;

ALTER TABLE public.campaign_spam_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_email_outbox ENABLE ROW LEVEL SECURITY;

-- Enroll a campaign for monitoring. Only newly launched campaigns qualify:
-- zero submitted/reserved/attempted work (no send attempts, no provider ids,
-- no messages past queued/failed). Already-running/completed/resumed
-- campaigns can never match, so they are never enrolled or retro-notified.
CREATE OR REPLACE FUNCTION public.spam_gate_enroll(_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE inserted integer := 0;
BEGIN
  INSERT INTO public.campaign_spam_monitors (campaign_id, account_id)
  SELECT c.id, c.account_id
    FROM public.campaigns c
   WHERE c.id = _campaign_id
     AND c.status IN ('queued','sending','processing','scheduled')
     AND NOT EXISTS (SELECT 1 FROM public.message_send_attempts a WHERE a.campaign_id = c.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.messages m
        WHERE m.campaign_id = c.id
          AND (m.provider_message_id IS NOT NULL OR m.status NOT IN ('queued','failed'))
     )
  ON CONFLICT (campaign_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 1 THEN RETURN true; END IF;
  -- Already enrolled is fine; anything else is a refusal to enroll.
  RETURN EXISTS (SELECT 1 FROM public.campaign_spam_monitors WHERE campaign_id = _campaign_id);
END;
$function$;

-- Atomic pause + incident + outbox shell in ONE transaction: a crash after
-- the pause can never lose the notice. Internal only (no grants).
CREATE OR REPLACE FUNCTION public.spam_gate_do_pause(_campaign_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE stopped_id uuid;
BEGIN
  UPDATE public.campaigns
     SET status = 'paused',
         paused_reason = CASE _kind
           WHEN 'spam' THEN 'Paused: mobile carriers rejected a high share of these texts as spam. Remaining sends are stopped.'
           ELSE 'Paused: carrier feedback unavailable. Remaining sends stayed stopped.' END,
         paused_at = now()
   WHERE id = _campaign_id
     AND status IN ('queued','sending','processing','scheduled')
  RETURNING id INTO stopped_id;

  UPDATE public.campaign_spam_monitors
     SET state = CASE _kind WHEN 'spam' THEN 'paused_spam' ELSE 'paused_timeout' END,
         updated_at = now()
   WHERE campaign_id = _campaign_id;

  -- Exactly one incident per campaign, ever. When the campaign was already
  -- stopped/fully submitted the incident records paused=false so the notice
  -- truthfully says nothing remained to stop.
  INSERT INTO public.campaign_spam_incidents (campaign_id, account_id, kind, paused, finalized, spam, recipient_email)
  SELECT m.campaign_id, m.account_id, _kind, (stopped_id IS NOT NULL),
         m.finalized_count, m.spam_count,
         COALESCE(NULLIF(BTRIM(a.contact_email), ''), NULLIF(BTRIM(a.email), ''))
    FROM public.campaign_spam_monitors m
    LEFT JOIN public.accounts a ON a.id = m.account_id
   WHERE m.campaign_id = _campaign_id
  ON CONFLICT (campaign_id) DO NOTHING;

  INSERT INTO public.campaign_spam_email_outbox (campaign_id, account_id, status, next_retry_at)
  SELECT i.campaign_id, i.account_id,
         CASE
           WHEN i.recipient_email IS NULL THEN 'missing'
           WHEN EXISTS (SELECT 1 FROM public.suppressed_emails s WHERE s.email = i.recipient_email) THEN 'suppressed'
           ELSE 'pending' END,
         now()
    FROM public.campaign_spam_incidents i
   WHERE i.campaign_id = _campaign_id
  ON CONFLICT (campaign_id) DO NOTHING;
END;
$function$;

-- The ONLY claim path for campaign messages. Locks the campaign row (so
-- pause/cancel writes contend) then the monitor row, re-checks live status
-- and account hold, evaluates the gate, and invokes the EXISTING
-- claim_campaign_messages inside the same transaction so its paid-claim and
-- charging internals are untouched. The claim is atomically bounded by the
-- gate allowance; 12 concurrent workers can never exceed it in total.
CREATE OR REPLACE FUNCTION public.spam_gate_claim(_campaign_id uuid, _limit integer)
RETURNS TABLE(id uuid, phone_e164 text, rendered_body text, country_code text,
              segments_count integer, cost numeric, attempt_number integer, force_sms boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c_status text;
  c_account uuid;
  on_hold boolean;
  m public.campaign_spam_monitors%ROWTYPE;
  allowed integer;
  claimed_count integer;
  capped boolean;
BEGIN
  IF _limit IS NULL OR _limit <= 0 THEN RETURN; END IF;

  SELECT status, account_id INTO c_status, c_account
    FROM public.campaigns WHERE campaigns.id = _campaign_id FOR UPDATE;
  IF NOT FOUND OR c_status NOT IN ('queued','sending','processing','scheduled') THEN RETURN; END IF;

  SELECT COALESCE(a.sending_suspended_at IS NOT NULL OR a.onboarding_status <> 'active', true)
    INTO on_hold FROM public.accounts a WHERE a.id = c_account;
  IF on_hold IS NULL OR on_hold THEN RETURN; END IF;

  SELECT * INTO m FROM public.campaign_spam_monitors
   WHERE campaign_id = _campaign_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Pre-rollout campaign: never enrolled, gate inert, behavior unchanged.
    RETURN QUERY SELECT * FROM public.claim_campaign_messages(_campaign_id, _limit);
    RETURN;
  END IF;

  IF m.state IN ('paused_spam','paused_timeout','concluded') THEN RETURN; END IF;

  -- Threshold re-checked on EVERY claim: a late spam wave pauses even after
  -- a healthy initial burst released the campaign.
  IF m.finalized_count >= 20 AND m.spam_count >= CEIL(m.finalized_count * 0.2) THEN
    PERFORM public.spam_gate_do_pause(_campaign_id, 'spam');
    RETURN;
  END IF;

  IF m.state = 'monitoring' AND m.finalized_count >= 20 THEN
    -- Enough healthy feedback: release to parallel delivery.
    m.state := 'released';
    UPDATE public.campaign_spam_monitors
       SET state = 'released', waiting_since = NULL, updated_at = now()
     WHERE campaign_id = _campaign_id;
  END IF;

  capped := m.expected_total IS NULL OR m.expected_total > 25;
  IF m.state = 'monitoring' AND capped THEN
    allowed := LEAST(_limit, GREATEST(0, 25 - m.submitted_count));
  ELSE
    -- Released (or a small <=25 campaign): bounded outstanding allowance
    -- keeps parallelism without blasting the whole audience.
    allowed := LEAST(_limit, GREATEST(0, 250 - (m.submitted_count - m.finalized_count)));
  END IF;

  IF allowed <= 0 THEN
    -- Allowance exhausted: wait for feedback. Unknown feedback NEVER
    -- silently releases; a bounded 10-minute wait stops the remainder
    -- truthfully instead.
    IF m.waiting_since IS NULL THEN
      UPDATE public.campaign_spam_monitors
         SET waiting_since = now(), updated_at = now()
       WHERE campaign_id = _campaign_id;
    ELSIF m.waiting_since < now() - interval '10 minutes' THEN
      PERFORM public.spam_gate_do_pause(_campaign_id, 'feedback_timeout');
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.claim_campaign_messages(_campaign_id, allowed);
  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  IF claimed_count > 0 THEN
    UPDATE public.campaign_spam_monitors
       SET submitted_count = submitted_count + claimed_count, updated_at = now()
     WHERE campaign_id = _campaign_id;
  END IF;
END;
$function$;

-- Record one signature-verified message.finalized fact for an ENROLLED
-- campaign and evaluate the threshold. Exact current provider id match only:
-- old retry ids and replayed/out-of-order events change nothing.
CREATE OR REPLACE FUNCTION public.spam_gate_record_receipt(
  _campaign_id uuid,
  _message_id uuid,
  _provider_message_id text,
  _error_code text,
  _provider_status text,
  _finalized_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  current_pid text;
  inserted integer := 0;
  m public.campaign_spam_monitors%ROWTYPE;
  fully_submitted boolean;
BEGIN
  -- Lock in the same order as spam_gate_claim (campaigns -> monitor).
  PERFORM 1 FROM public.campaigns WHERE id = _campaign_id FOR UPDATE;

  SELECT provider_message_id INTO current_pid
    FROM public.messages WHERE messages.id = _message_id;
  IF current_pid IS NULL OR current_pid <> _provider_message_id THEN
    RETURN 'stale';
  END IF;

  SELECT * INTO m FROM public.campaign_spam_monitors
   WHERE campaign_id = _campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unenrolled'; END IF;

  INSERT INTO public.campaign_spam_receipts
    (campaign_id, provider_message_id, message_id, error_code, provider_status, finalized_at)
  VALUES (_campaign_id, _provider_message_id, _message_id, _error_code, _provider_status, _finalized_at)
  ON CONFLICT (campaign_id, provider_message_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted = 0 THEN RETURN 'duplicate'; END IF;

  UPDATE public.campaign_spam_monitors
     SET finalized_count = finalized_count + 1,
         spam_count = spam_count + CASE WHEN _error_code = '40002' THEN 1 ELSE 0 END,
         waiting_since = NULL,
         updated_at = now()
   WHERE campaign_id = _campaign_id
  RETURNING * INTO m;

  IF m.finalized_count >= 20 AND m.spam_count >= CEIL(m.finalized_count * 0.2) THEN
    PERFORM public.spam_gate_do_pause(_campaign_id, 'spam');
    RETURN 'paused';
  END IF;

  -- Monitoring is NOT concluded merely because all sends were submitted;
  -- it concludes only once enough final feedback has actually arrived.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.messages
     WHERE campaign_id = _campaign_id AND status IN ('queued','sending')
  ) INTO fully_submitted;
  IF fully_submitted AND m.finalized_count >= 20 THEN
    UPDATE public.campaign_spam_monitors
       SET state = 'concluded', updated_at = now()
     WHERE campaign_id = _campaign_id;
    RETURN 'concluded';
  END IF;
  RETURN 'recorded';
END;
$function$;

-- Lightweight state read for prechecks, per-send rechecks, resume
-- reevaluation and reports.
CREATE OR REPLACE FUNCTION public.spam_gate_state(_campaign_id uuid)
RETURNS TABLE(enrolled boolean, state text, submitted_count integer,
              finalized_count integer, spam_count integer,
              expected_total integer, waiting_since timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT true, m.state, m.submitted_count, m.finalized_count, m.spam_count,
         m.expected_total, m.waiting_since
    FROM public.campaign_spam_monitors m
   WHERE m.campaign_id = _campaign_id;
$function$;

-- Planning finished: record the true recipient total so the initial-25 cap
-- applies only to campaigns with more than 25 recipients.
CREATE OR REPLACE FUNCTION public.spam_gate_set_expected_total(_campaign_id uuid, _total integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.campaign_spam_monitors
     SET expected_total = _total, updated_at = now()
   WHERE campaign_id = _campaign_id AND expected_total IS NULL;
END;
$function$;

-- Due outbox rows for the retry worker. Row locks (SKIP LOCKED) make
-- simultaneous retry workers process disjoint rows.
CREATE OR REPLACE FUNCTION public.spam_gate_outbox_due(_limit integer)
RETURNS SETOF public.campaign_spam_email_outbox
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.* FROM public.campaign_spam_email_outbox o
   WHERE o.status IN ('pending','queued')
     AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
   ORDER BY o.created_at
   LIMIT GREATEST(0, LEAST(100, _limit))
   FOR UPDATE SKIP LOCKED;
$function$;

-- Atomic enqueue + outbox mark in ONE transaction (pgmq.send is a plain
-- INSERT, so a crash rolls both back). The row lock plus the status check
-- make simultaneous retries enqueue exactly once; the unique campaign_id
-- makes a repeat enqueue for the same incident impossible.
CREATE OR REPLACE FUNCTION public.spam_gate_outbox_enqueue(_outbox_id uuid, _payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE msg_id bigint;
BEGIN
  PERFORM 1 FROM public.campaign_spam_email_outbox
   WHERE id = _outbox_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  msg_id := public.enqueue_email('transactional_emails', _payload);

  UPDATE public.campaign_spam_email_outbox
     SET status = 'queued', payload = _payload,
         attempts = attempts + 1, last_error = NULL,
         next_retry_at = now() + interval '5 minutes',
         updated_at = now()
   WHERE id = _outbox_id;
  RETURN msg_id;
END;
$function$;

-- Record a retryable failure (status stays 'pending' with backoff) or a
-- terminal visibility state ('sent','failed','suppressed','missing').
CREATE OR REPLACE FUNCTION public.spam_gate_outbox_mark(
  _outbox_id uuid, _status text, _error text, _retry_delay_seconds integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.campaign_spam_email_outbox
     SET status = _status,
         last_error = LEFT(COALESCE(_error, ''), 1000),
         attempts = attempts + CASE WHEN _status = 'pending' THEN 1 ELSE 0 END,
         next_retry_at = CASE WHEN _status = 'pending'
           THEN now() + make_interval(secs => GREATEST(30, COALESCE(_retry_delay_seconds, 300)))
           ELSE NULL END,
         updated_at = now()
   WHERE id = _outbox_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.spam_gate_enroll(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_do_pause(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_claim(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_record_receipt(uuid, uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_set_expected_total(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_outbox_due(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_outbox_enqueue(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_outbox_mark(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.spam_gate_enroll(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_claim(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_record_receipt(uuid, uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_set_expected_total(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_outbox_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_outbox_enqueue(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_outbox_mark(uuid, text, text, integer) TO service_role;
