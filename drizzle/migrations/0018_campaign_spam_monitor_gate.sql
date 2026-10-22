-- PROPOSAL ONLY. Apply once, before deploying the matching dispatcher/webhook.
-- No historical campaign enrollment, incident backfill, financial-function edit,
-- receipt-status repair, or external send is performed by this migration.
-- Gate mutations lock campaign -> monitor. Financial claims retain the
-- original message -> account order used by existing debit/refund routines.
-- Original raw claim execution is revoked; SECURITY DEFINER wrapper still calls
-- its unchanged financial body. Old deployed RPC calls briefly defer until the
-- matching dispatcher publishes. A two-minute future cutoff permits in-flight
-- pre-migration work to drain before any newly created campaign is enrolled.

CREATE TABLE public.campaign_spam_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  activated_at timestamptz NOT NULL DEFAULT (statement_timestamp()+interval '2 minutes')
);
INSERT INTO public.campaign_spam_rollout(singleton) VALUES (true);

CREATE TABLE public.campaign_spam_monitors (
  campaign_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'monitoring'
    CHECK (state IN ('monitoring','released','paused_spam','paused_timeout','concluded')),
  -- Unique paid reservations, not the number of times a worker reclaimed one.
  submitted_count integer NOT NULL DEFAULT 0,
  finalized_count integer NOT NULL DEFAULT 0,
  spam_count integer NOT NULL DEFAULT 0,
  expected_total integer CHECK (expected_total >= 0),
  waiting_since timestamptz,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_spam_reservations (
  message_id uuid NOT NULL,
  attempt_number integer NOT NULL,
  campaign_id uuid NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id, attempt_number)
);
CREATE INDEX campaign_spam_reservations_campaign_idx
  ON public.campaign_spam_reservations(campaign_id, message_id, attempt_number);

-- Append-only signed final facts. Counts join the exact CURRENT provider id;
-- changing an old mutable status cannot erase or manufacture final evidence.
CREATE TABLE public.campaign_spam_receipts (
  campaign_id uuid NOT NULL,
  provider_message_id text NOT NULL,
  message_id uuid NOT NULL,
  error_code text,
  provider_status text,
  finalized_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id, provider_message_id)
);
CREATE INDEX campaign_spam_receipts_message_idx
  ON public.campaign_spam_receipts(message_id, provider_message_id);

-- Retry/reset invalidation is append-only and takes no campaign/monitor lock:
-- an existing message update must never introduce a message -> campaign cycle.
CREATE TABLE public.campaign_spam_receipt_invalidations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  message_id uuid NOT NULL
);
CREATE INDEX campaign_spam_receipt_invalidations_campaign_idx
  ON public.campaign_spam_receipt_invalidations(campaign_id);

CREATE TABLE public.campaign_spam_incidents (
  campaign_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('spam','feedback_timeout')),
  paused boolean NOT NULL,
  finalized integer NOT NULL,
  spam integer NOT NULL,
  submission_state text NOT NULL CHECK (submission_state IN
    ('remaining_stopped','all_submitted','no_remaining_work')),
  submitted_count integer NOT NULL,
  remaining_count integer,
  recipient_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.campaign_spam_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.campaign_spam_incidents(campaign_id),
  account_id uuid NOT NULL,
  payload jsonb,
  queue_message_id bigint,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','queued','sent','failed','suppressed','missing')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_spam_email_outbox_due_idx
  ON public.campaign_spam_email_outbox(status,next_retry_at,created_at)
  WHERE status IN ('pending','queued');

-- Explicit revokes are required even when project default privileges grant
-- newly created public tables/functions to browser roles.
REVOKE ALL ON TABLE public.campaign_spam_rollout,
  public.campaign_spam_monitors, public.campaign_spam_reservations,
  public.campaign_spam_receipts, public.campaign_spam_receipt_invalidations,
  public.campaign_spam_incidents, public.campaign_spam_email_outbox
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campaign_spam_rollout,
  public.campaign_spam_monitors, public.campaign_spam_reservations,
  public.campaign_spam_receipts, public.campaign_spam_receipt_invalidations,
  public.campaign_spam_incidents, public.campaign_spam_email_outbox TO service_role;
ALTER TABLE public.campaign_spam_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_receipt_invalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_spam_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.spam_gate_invalidate_provider() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.provider_message_id IS NOT NULL
     AND OLD.provider_message_id IS DISTINCT FROM NEW.provider_message_id THEN
    INSERT INTO public.campaign_spam_receipt_invalidations(campaign_id,message_id)
    SELECT OLD.campaign_id, OLD.id
     WHERE EXISTS (SELECT 1 FROM public.campaign_spam_monitors
                    WHERE campaign_id=OLD.campaign_id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER campaign_spam_provider_changed
AFTER UPDATE OF provider_message_id ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.spam_gate_invalidate_provider();

-- Caller holds campaign and monitor locks. Exact refresh happens at claims,
-- reports/resume, or a rare retry invalidation; ordinary receipts are O(1).
CREATE FUNCTION public.spam_gate_refresh(_campaign_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE finals integer; spam integer;
BEGIN
  -- Delete BEFORE the refresh: concurrently committed invalidations after this
  -- statement survive for the next refresh, rather than being lost afterwards.
  DELETE FROM public.campaign_spam_receipt_invalidations WHERE campaign_id=_campaign_id;
  SELECT count(*)::integer,
         count(*) FILTER (WHERE r.error_code='40002')::integer
    INTO finals,spam
    FROM public.campaign_spam_receipts r
    JOIN public.messages ms ON ms.id=r.message_id
      AND ms.campaign_id=r.campaign_id
      AND ms.provider_message_id=r.provider_message_id
   WHERE r.campaign_id=_campaign_id;
  UPDATE public.campaign_spam_monitors
     SET finalized_count=finals,spam_count=spam,updated_at=now()
   WHERE campaign_id=_campaign_id;
END;
$function$;

CREATE FUNCTION public.spam_gate_enroll(_campaign_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.campaigns%ROWTYPE; cutoff timestamptz;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id)
    THEN RETURN true; END IF;
  SELECT activated_at INTO cutoff FROM public.campaign_spam_rollout WHERE singleton;
  IF cutoff IS NULL OR c.created_at<cutoff
     OR c.status NOT IN ('queued','sending','processing','scheduled') THEN RETURN false; END IF;
  -- Coordinate enrollment with any existing claim already holding message rows.
  PERFORM 1 FROM public.messages WHERE campaign_id=_campaign_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.message_send_attempts WHERE campaign_id=_campaign_id)
     OR EXISTS(SELECT 1 FROM public.messages WHERE campaign_id=_campaign_id
       AND (provider_message_id IS NOT NULL OR charged_at IS NOT NULL
            OR attempt_number>0 OR status NOT IN ('queued','failed'))) THEN RETURN false; END IF;
  INSERT INTO public.campaign_spam_monitors(campaign_id,account_id)
  VALUES(_campaign_id,c.account_id);
  RETURN true;
END;
$function$;

-- Internal: campaign + monitor locks are already held by every caller.
CREATE FUNCTION public.spam_gate_do_pause(_campaign_id uuid,_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c public.campaigns%ROWTYPE; m public.campaign_spam_monitors%ROWTYPE;
  won boolean:=false; stopped uuid; total integer; submitted integer;
  remaining integer; all_submitted boolean; copy_state text;
BEGIN
  IF _kind NOT IN ('spam','feedback_timeout') THEN RAISE EXCEPTION 'Unknown pause kind'; END IF;
  SELECT * INTO c FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*)::integer,
         count(*) FILTER(WHERE provider_message_id IS NOT NULL)::integer,
         count(*) FILTER(WHERE provider_message_id IS NULL AND status IN ('queued','sending','pending'))::integer
    INTO total,submitted,remaining FROM public.messages WHERE campaign_id=_campaign_id;
  all_submitted:=m.expected_total IS NOT NULL AND total=m.expected_total
                 AND submitted=m.expected_total;
  -- A cancellation, manual pause, or content/account hold wins. A late final
  -- notice is allowed for a completed campaign only with proof all submitted.
  IF c.status NOT IN ('queued','sending','processing','scheduled') THEN
    IF c.status NOT IN ('sent','completed') OR NOT all_submitted OR _kind<>'spam'
     THEN RETURN; END IF;
  ELSE
    UPDATE public.campaigns SET status='paused',paused_at=now(),
      paused_reason=CASE _kind WHEN 'spam'
        THEN 'Paused: mobile carriers rejected a high share of these texts as spam. Remaining sends are stopped.'
        ELSE 'Paused: carrier feedback unavailable. Remaining sends stayed stopped.' END
    WHERE id=_campaign_id AND status IN ('queued','sending','processing','scheduled')
    RETURNING id INTO stopped;
    won:=stopped IS NOT NULL;
    IF NOT won THEN RETURN; END IF;
  END IF;
  copy_state:=CASE WHEN all_submitted THEN 'all_submitted'
    WHEN remaining>0 OR m.expected_total IS NULL THEN 'remaining_stopped'
    ELSE 'no_remaining_work' END;
  UPDATE public.campaign_spam_monitors
    SET state=CASE _kind WHEN 'spam' THEN 'paused_spam' ELSE 'paused_timeout' END,updated_at=now()
    WHERE campaign_id=_campaign_id;
  INSERT INTO public.campaign_spam_incidents
    (campaign_id,account_id,kind,paused,finalized,spam,submission_state,
     submitted_count,remaining_count,recipient_email)
  SELECT _campaign_id,m.account_id,_kind,won AND copy_state='remaining_stopped',
         m.finalized_count,m.spam_count,copy_state,submitted,
         CASE WHEN m.expected_total IS NULL THEN NULL ELSE remaining END,
         COALESCE(NULLIF(BTRIM(a.contact_email),''),NULLIF(BTRIM(a.email),''))
    FROM public.accounts a WHERE a.id=m.account_id
  ON CONFLICT(campaign_id) DO NOTHING;
  INSERT INTO public.campaign_spam_email_outbox(campaign_id,account_id,status,next_retry_at)
  SELECT i.campaign_id,i.account_id,CASE
    WHEN i.recipient_email IS NULL THEN 'missing'
    WHEN EXISTS(SELECT 1 FROM public.suppressed_emails s WHERE lower(s.email)=lower(i.recipient_email)) THEN 'suppressed'
    ELSE 'pending' END,now()
  FROM public.campaign_spam_incidents i WHERE i.campaign_id=_campaign_id
  ON CONFLICT(campaign_id) DO NOTHING;
END;
$function$;

CREATE FUNCTION public.spam_gate_claim(_campaign_id uuid,_limit integer)
RETURNS TABLE(id uuid,phone_e164 text,rendered_body text,country_code text,
              segments_count integer,cost numeric,attempt_number integer,force_sms boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c public.campaigns%ROWTYPE; m public.campaign_spam_monitors%ROWTYPE;
  on_hold boolean; allowed integer; prepaid integer; outstanding integer; new_capacity integer;
  fresh integer:=0; added integer; rec record; has_work boolean; claimed jsonb;
BEGIN
  IF _limit IS NULL OR _limit<=0 THEN RETURN; END IF;
  SELECT * INTO c FROM public.campaigns WHERE campaigns.id=_campaign_id FOR UPDATE;
  IF NOT FOUND OR c.status NOT IN ('queued','sending','processing','scheduled') THEN RETURN; END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  SELECT a.sending_suspended_at IS NOT NULL OR a.onboarding_status<>'active'
    INTO on_hold FROM public.accounts a WHERE a.id=c.account_id;
  IF on_hold IS NULL OR on_hold THEN RETURN; END IF;
  IF m.campaign_id IS NULL THEN
    -- Still coordinate live cancellation and hold for pre-rollout campaigns.
    -- Buffer output until after the original message->account lock ordering.
    BEGIN
      SELECT jsonb_agg(to_jsonb(x)) INTO claimed
        FROM public.claim_campaign_messages(_campaign_id,_limit) x;
      SELECT a.sending_suspended_at IS NOT NULL OR a.onboarding_status<>'active'
        INTO on_hold FROM public.accounts a WHERE a.id=c.account_id FOR UPDATE;
      IF on_hold IS NULL OR on_hold THEN RAISE SQLSTATE 'PT001' USING MESSAGE='Account hold won claim'; END IF;
    EXCEPTION WHEN SQLSTATE 'PT001' THEN RETURN;
    END;
    RETURN QUERY SELECT * FROM jsonb_to_recordset(COALESCE(claimed,'[]'::jsonb))
      AS x(id uuid,phone_e164 text,rendered_body text,country_code text,
           segments_count integer,cost numeric,attempt_number integer,force_sms boolean);
    RETURN;
  END IF;
  IF m.state IN ('paused_spam','paused_timeout') THEN RETURN; END IF;
  PERFORM public.spam_gate_refresh(_campaign_id);
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id;
  IF m.finalized_count>=20 AND m.spam_count>=CEIL(m.finalized_count*0.2) THEN
    PERFORM public.spam_gate_do_pause(_campaign_id,'spam'); RETURN;
  END IF;
  -- Mirror only the original RPC's recovery step so known paid reservations
  -- can be reclaimed even when the gate has no NEW capacity. No financial edits.
  UPDATE public.messages SET status='queued',dispatch_started_at=NULL,error_code=NULL,failure_reason=NULL
   WHERE campaign_id=_campaign_id AND status='sending' AND provider_message_id IS NULL
     AND dispatch_started_at<now()-interval '5 minutes';
  SELECT EXISTS(SELECT 1 FROM public.messages ms WHERE ms.campaign_id=_campaign_id
                 AND ms.status='queued') INTO has_work;
  IF NOT has_work THEN RETURN; END IF;
  -- A benign completed monitor may participate in an explicitly authorized
  -- retry; the original claim still enforces that retry's authorization.
  IF m.state='concluded' OR (m.state='monitoring' AND m.finalized_count>=20) THEN
    m.state:='released';
    UPDATE public.campaign_spam_monitors SET state='released',waiting_since=NULL,updated_at=now()
     WHERE campaign_id=_campaign_id;
    m.waiting_since:=NULL;
  END IF;
  -- Outstanding reservations are CURRENT attempts lacking an exact current
  -- final fact, not historical reservation_count - current final_count.
  SELECT count(*)::integer INTO outstanding
    FROM public.campaign_spam_reservations r JOIN public.messages ms
      ON ms.id=r.message_id AND ms.campaign_id=r.campaign_id AND ms.attempt_number=r.attempt_number
    WHERE r.campaign_id=_campaign_id
      AND (ms.provider_message_id IS NOT NULL OR ms.status IN ('queued','sending','pending'))
      AND NOT EXISTS(SELECT 1 FROM public.campaign_spam_receipts f
       WHERE f.campaign_id=_campaign_id AND f.message_id=ms.id
        AND f.provider_message_id=ms.provider_message_id);
  new_capacity:=CASE WHEN m.state='monitoring' AND (m.expected_total IS NULL OR m.expected_total>25)
    THEN GREATEST(0,25-m.submitted_count) ELSE GREATEST(0,250-outstanding) END;
  IF new_capacity>0 THEN
    -- Fresh receipt capacity starts a fresh waiting period only if it is
    -- exhausted again; an old wait must not time out healthy later batches.
    UPDATE public.campaign_spam_monitors SET waiting_since=NULL WHERE campaign_id=_campaign_id;
    m.waiting_since:=NULL;
  ELSIF m.waiting_since IS NULL THEN
    UPDATE public.campaign_spam_monitors SET waiting_since=now(),updated_at=now() WHERE campaign_id=_campaign_id;
    m.waiting_since:=now();
  ELSIF m.waiting_since<=now()-interval '10 minutes' THEN
    PERFORM public.spam_gate_do_pause(_campaign_id,'feedback_timeout'); RETURN;
  END IF;
  SELECT count(*)::integer INTO prepaid FROM public.messages ms
   WHERE ms.campaign_id=_campaign_id AND ms.status='queued' AND ms.charged_at IS NOT NULL
     AND EXISTS(SELECT 1 FROM public.campaign_spam_reservations r
       WHERE r.message_id=ms.id AND r.attempt_number=GREATEST(ms.attempt_number,1)
         AND r.campaign_id=_campaign_id);
  -- Unknown paid work must not enter a new monitor by bypassing its ledger.
  IF EXISTS(SELECT 1 FROM public.messages ms WHERE ms.campaign_id=_campaign_id
     AND ms.status='queued' AND ms.charged_at IS NOT NULL
     AND (ms.provider_message_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.campaign_spam_reservations r
       WHERE r.message_id=ms.id AND r.attempt_number=GREATEST(ms.attempt_number,1)
         AND r.campaign_id=_campaign_id))) THEN RETURN; END IF;
  IF prepaid>0 THEN
    -- Own the prepaid selection before calling the original SKIP LOCKED RPC.
    -- If another operation holds every prepaid row, do not let its empty
    -- prepaid branch fall through and charge fresh work beyond the allowance.
    SELECT count(*)::integer INTO prepaid FROM (
      SELECT ms.id FROM public.messages ms WHERE ms.campaign_id=_campaign_id
        AND ms.status='queued' AND ms.charged_at IS NOT NULL AND ms.provider_message_id IS NULL
      ORDER BY ms.created_at LIMIT LEAST(_limit,prepaid,1000) FOR UPDATE SKIP LOCKED
    ) selected_prepaid;
    IF prepaid=0 THEN RETURN; END IF;
    allowed:=prepaid;
  ELSE
    allowed:=LEAST(_limit,new_capacity,1000);
  END IF;
  IF allowed<=0 THEN
    RETURN;
  END IF;
  -- Existing refunds lock message->account. Do not lock account before the
  -- original claim's messages: a subtransaction buffers claims then rechecks
  -- account under lock; a hold winner rolls back ALL debit/attempt work.
  BEGIN
    SELECT jsonb_agg(to_jsonb(x)) INTO claimed
      FROM public.claim_campaign_messages(_campaign_id,allowed) x;
    SELECT a.sending_suspended_at IS NOT NULL OR a.onboarding_status<>'active'
      INTO on_hold FROM public.accounts a WHERE a.id=c.account_id FOR UPDATE;
    IF on_hold IS NULL OR on_hold THEN RAISE SQLSTATE 'PT001' USING MESSAGE='Account hold won claim'; END IF;
    FOR rec IN SELECT * FROM jsonb_to_recordset(COALESCE(claimed,'[]'::jsonb))
      AS x(id uuid,phone_e164 text,rendered_body text,country_code text,
           segments_count integer,cost numeric,attempt_number integer,force_sms boolean) LOOP
      INSERT INTO public.campaign_spam_reservations(message_id,attempt_number,campaign_id)
      VALUES(rec.id,rec.attempt_number,_campaign_id) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS added=ROW_COUNT; fresh:=fresh+added;
    END LOOP;
    UPDATE public.campaign_spam_monitors SET submitted_count=submitted_count+fresh,
      waiting_since=CASE
        WHEN (m.state='monitoring' AND (m.expected_total IS NULL OR m.expected_total>25)
              AND submitted_count+fresh>=25)
          OR (m.state<>'monitoring' AND outstanding+fresh>=250)
        THEN COALESCE(waiting_since,now()) ELSE NULL END,updated_at=now()
      WHERE campaign_id=_campaign_id;
  EXCEPTION WHEN SQLSTATE 'PT001' THEN RETURN;
  END;
  RETURN QUERY SELECT * FROM jsonb_to_recordset(COALESCE(claimed,'[]'::jsonb))
    AS x(id uuid,phone_e164 text,rendered_body text,country_code text,
         segments_count integer,cost numeric,attempt_number integer,force_sms boolean);
END;
$function$;

CREATE FUNCTION public.spam_gate_record_receipt(
  _campaign_id uuid,_message_id uuid,_provider_message_id text,_error_code text,
  _provider_status text,_finalized_at timestamptz) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE current_pid text; m public.campaign_spam_monitors%ROWTYPE; inserted integer;
BEGIN
  PERFORM 1 FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'stale'; END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unenrolled'; END IF;
  SELECT provider_message_id INTO current_pid FROM public.messages
    WHERE id=_message_id AND campaign_id=_campaign_id FOR UPDATE;
  IF current_pid IS NULL OR current_pid IS DISTINCT FROM _provider_message_id THEN RETURN 'stale'; END IF;
  INSERT INTO public.campaign_spam_receipts
    (campaign_id,provider_message_id,message_id,error_code,provider_status,finalized_at)
   VALUES(_campaign_id,_provider_message_id,_message_id,_error_code,_provider_status,_finalized_at)
  ON CONFLICT(campaign_id,provider_message_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF EXISTS(SELECT 1 FROM public.campaign_spam_receipt_invalidations WHERE campaign_id=_campaign_id) THEN
    PERFORM public.spam_gate_refresh(_campaign_id);
  ELSIF inserted=1 THEN
    UPDATE public.campaign_spam_monitors SET finalized_count=finalized_count+1,
      spam_count=spam_count+CASE WHEN _error_code='40002' THEN 1 ELSE 0 END,updated_at=now()
      WHERE campaign_id=_campaign_id;
  END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id;
  IF m.finalized_count>=20 AND m.spam_count>=CEIL(m.finalized_count*0.2) THEN
    PERFORM public.spam_gate_do_pause(_campaign_id,'spam'); RETURN 'paused';
  END IF;
  IF m.state='monitoring' AND m.finalized_count>=20 THEN
    UPDATE public.campaign_spam_monitors SET state='released',waiting_since=NULL,updated_at=now()
     WHERE campaign_id=_campaign_id;
  END IF;
  -- Do not conclude at merely 20 finals: later finals may form a bad wave.
  -- Released monitoring remains active until a future explicit retry or archive.
  RETURN CASE WHEN inserted=0 THEN 'duplicate' ELSE 'recorded' END;
END;
$function$;

CREATE FUNCTION public.spam_gate_state(_campaign_id uuid)
RETURNS TABLE(enrolled boolean,state text,submitted_count integer,finalized_count integer,
  spam_count integer,expected_total integer,waiting_since timestamptz,outstanding_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1 FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  PERFORM 1 FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.spam_gate_refresh(_campaign_id);
  RETURN QUERY SELECT true,m.state,m.submitted_count,m.finalized_count,m.spam_count,
    m.expected_total,m.waiting_since,
    (SELECT count(*)::integer FROM public.campaign_spam_reservations r JOIN public.messages ms
      ON ms.id=r.message_id AND ms.campaign_id=r.campaign_id AND ms.attempt_number=r.attempt_number
     WHERE r.campaign_id=_campaign_id
       AND (ms.provider_message_id IS NOT NULL OR ms.status IN ('queued','sending','pending'))
       AND NOT EXISTS(SELECT 1 FROM public.campaign_spam_receipts f WHERE f.campaign_id=_campaign_id
       AND f.message_id=ms.id AND f.provider_message_id=ms.provider_message_id))
    FROM public.campaign_spam_monitors m WHERE m.campaign_id=_campaign_id;
END;
$function$;

-- Cheap per-provider recheck: indexed flags only, no per-message campaign scan.
CREATE FUNCTION public.spam_gate_can_send(_campaign_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.campaigns c JOIN public.accounts a ON a.id=c.account_id
    LEFT JOIN public.campaign_spam_monitors m ON m.campaign_id=c.id
   WHERE c.id=_campaign_id AND c.status IN ('queued','sending','processing','scheduled')
     AND a.onboarding_status='active' AND a.sending_suspended_at IS NULL
     AND (m.campaign_id IS NULL OR m.state NOT IN ('paused_spam','paused_timeout')));
$function$;

CREATE FUNCTION public.spam_gate_set_expected_total(_campaign_id uuid,_total integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _total IS NULL OR _total<0 THEN RAISE EXCEPTION 'Invalid expected total'; END IF;
  PERFORM 1 FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  UPDATE public.campaign_spam_monitors SET expected_total=_total,updated_at=now()
   WHERE campaign_id=_campaign_id AND expected_total IS NULL;
END;
$function$;

-- Called only AFTER fresh server screening, with the exact previously read
-- account/body/status. Campaign and monitor resume atomically or neither does.
CREATE FUNCTION public.spam_gate_resume_timeout(
  _campaign_id uuid,_account_id uuid,_body text,_status text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.campaigns%ROWTYPE;m public.campaign_spam_monitors%ROWTYPE;on_hold boolean;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=_campaign_id FOR UPDATE;
  IF NOT FOUND OR _status<>'paused' OR c.status IS DISTINCT FROM _status
    OR c.account_id IS DISTINCT FROM _account_id OR c.message_body IS DISTINCT FROM _body
    OR c.paused_reason IS NULL
    OR c.paused_reason NOT LIKE 'Paused: carrier feedback unavailable.%' THEN RETURN false; END IF;
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id FOR UPDATE;
  IF NOT FOUND OR m.state<>'paused_timeout' THEN RETURN false; END IF;
  SELECT sending_suspended_at IS NOT NULL OR onboarding_status<>'active'
    INTO on_hold FROM public.accounts WHERE accounts.id=_account_id FOR UPDATE;
  IF on_hold IS NULL OR on_hold THEN RETURN false; END IF;
  PERFORM public.spam_gate_refresh(_campaign_id);
  SELECT * INTO m FROM public.campaign_spam_monitors WHERE campaign_id=_campaign_id;
  IF m.finalized_count<20 OR m.spam_count>=CEIL(m.finalized_count*0.2) THEN RETURN false; END IF;
  UPDATE public.campaign_spam_monitors SET state='released',waiting_since=NULL,updated_at=now()
    WHERE campaign_id=_campaign_id;
  UPDATE public.campaigns SET status='sending',paused_reason=NULL,paused_at=NULL,updated_at=now()
   WHERE id=_campaign_id;
  RETURN true;
END;
$function$;

-- Advisory scan only: returned locks end with this RPC. Enqueue/CAS is the
-- authoritative serialization for overlapping retry workers.
CREATE FUNCTION public.spam_gate_outbox_due(_limit integer)
RETURNS SETOF public.campaign_spam_email_outbox
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.* FROM public.campaign_spam_email_outbox o
   WHERE o.status IN ('pending','queued') AND (o.next_retry_at IS NULL OR o.next_retry_at<=now())
   ORDER BY o.created_at LIMIT GREATEST(0,LEAST(100,_limit)) FOR UPDATE SKIP LOCKED;
$function$;

CREATE FUNCTION public.spam_gate_outbox_enqueue(_outbox_id uuid,_payload jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE msg_id bigint;
BEGIN
  PERFORM 1 FROM public.campaign_spam_email_outbox WHERE id=_outbox_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  msg_id:=public.enqueue_email('transactional_emails',_payload);
  UPDATE public.campaign_spam_email_outbox SET status='queued',payload=_payload,queue_message_id=msg_id,
    attempts=attempts+1,last_error=NULL,next_retry_at=now()+interval '5 minutes',updated_at=now()
    WHERE id=_outbox_id;
  RETURN msg_id;
END;
$function$;

CREATE FUNCTION public.spam_gate_outbox_mark(_outbox_id uuid,_expected_status text,
  _status text,_error text,_retry_delay_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE current_state text; campaign uuid;
BEGIN
  SELECT status,campaign_id INTO current_state,campaign FROM public.campaign_spam_email_outbox WHERE id=_outbox_id FOR UPDATE;
  IF NOT FOUND OR current_state IS DISTINCT FROM _expected_status THEN RETURN false; END IF;
  -- A confirmed external success wins an in-flight suppression/failure race.
  -- No stale worker can move a queued/sent row back to pending or re-enqueue.
  IF current_state='sent' THEN RETURN _status='sent'; END IF;
  IF NOT (_status='sent'
     OR (current_state='pending' AND _status IN ('pending','suppressed','missing'))
     OR (current_state='queued' AND _status IN ('queued','failed','suppressed'))) THEN RETURN false; END IF;
  -- A poller's earlier log read may race an actual successful delivery. Durable
  -- sent proof wins before making an otherwise terminal failure/suppression.
  IF _status IN ('failed','suppressed') AND EXISTS(SELECT 1 FROM public.email_send_log
     WHERE message_id='spamgate-incident-'||campaign::text AND status='sent') THEN
    _status:='sent';
  END IF;
  UPDATE public.campaign_spam_email_outbox SET status=_status,
    last_error=LEFT(COALESCE(_error,''),1000),
    attempts=attempts+CASE WHEN _status='pending' THEN 1 ELSE 0 END,
    next_retry_at=CASE WHEN _status IN ('pending','queued')
      THEN now()+make_interval(secs=>GREATEST(30,COALESCE(_retry_delay_seconds,300))) ELSE NULL END,
    updated_at=now() WHERE id=_outbox_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.spam_gate_invalidate_provider() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.spam_gate_refresh(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.spam_gate_do_pause(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.spam_gate_enroll(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_claim(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_record_receipt(uuid,uuid,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_can_send(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_set_expected_total(uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_resume_timeout(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_outbox_due(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_outbox_enqueue(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spam_gate_outbox_mark(uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spam_gate_enroll(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_claim(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_record_receipt(uuid,uuid,text,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_can_send(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_set_expected_total(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_resume_timeout(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_outbox_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_outbox_enqueue(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.spam_gate_outbox_mark(uuid,text,text,text,integer) TO service_role;

-- Prevent old code and direct service RPC calls from bypassing the gate. This
-- changes only execution privileges; the original function body remains intact.
REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;
