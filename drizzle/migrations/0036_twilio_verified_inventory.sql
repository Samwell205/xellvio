CREATE TABLE public.twilio_verified_inventory (
 phone_sid text PRIMARY KEY, phone_number text NOT NULL UNIQUE, owner_account_sid text NOT NULL,
 verification_sid text, verification_status text NOT NULL DEFAULT 'pending',
 assigned_account_id uuid REFERENCES public.accounts(id), assignment_state text NOT NULL DEFAULT 'available',
 available boolean NOT NULL DEFAULT true, lease_until timestamptz, last_error text,
 synced_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.twilio_verified_inventory TO service_role;
ALTER TABLE public.twilio_verified_inventory ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.reserve_twilio_inventory(_account_id uuid, _phone_number text DEFAULT NULL, _price numeric DEFAULT 0)
RETURNS public.twilio_verified_inventory LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE chosen public.twilio_verified_inventory; existing public.tenant_twilio_lines; fee numeric;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_account_id::text, 0));
 SELECT * INTO existing FROM public.tenant_twilio_lines WHERE account_id = _account_id FOR UPDATE;
 SELECT * INTO chosen FROM public.twilio_verified_inventory WHERE assigned_account_id = _account_id LIMIT 1 FOR UPDATE;
 IF chosen.phone_sid IS NOT NULL THEN
  IF _phone_number IS NOT NULL AND chosen.phone_number <> _phone_number THEN RAISE EXCEPTION 'This business already has a different toll-free number.'; END IF;
  RETURN chosen;
 END IF;
 IF existing.phone_number IS NOT NULL AND existing.status <> 'released' THEN RAISE EXCEPTION 'This business already has a dedicated number.'; END IF;
 SELECT * INTO chosen FROM public.twilio_verified_inventory WHERE verification_status = 'verified' AND available AND assigned_account_id IS NULL AND (_phone_number IS NULL OR phone_number = _phone_number) ORDER BY created_at, phone_sid LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF chosen.phone_sid IS NULL THEN RAISE EXCEPTION 'No unassigned verified number is available.'; END IF;
 IF EXISTS (SELECT 1 FROM public.sender_assets WHERE phone_number = chosen.phone_number AND account_id <> _account_id) THEN RAISE EXCEPTION 'This number is attached to another business and needs an ownership review.'; END IF;
 IF _price < 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
 IF _price > 0 THEN PERFORM public.debit_account(_account_id, _price, NULL, 'Purchased verified toll-free number ' || chosen.phone_number); END IF;
 SELECT COALESCE(NULLIF(trim(both '"' from value::text), '')::numeric, 5) INTO fee FROM public.platform_settings WHERE key = 'twilio_line_monthly_usd';
 INSERT INTO public.tenant_twilio_lines(account_id, monthly_fee_usd, status, charged_at) VALUES (_account_id, COALESCE(fee,5), 'requested', now()) ON CONFLICT (account_id) DO UPDATE SET status = 'requested', phone_number = NULL, phone_sid = NULL, verification_sid = NULL, monthly_fee_usd = COALESCE(fee,5), charged_at = now(), renews_at = NULL;
 UPDATE public.twilio_verified_inventory SET assigned_account_id = _account_id, assignment_state = 'reserved', last_error = NULL WHERE phone_sid = chosen.phone_sid RETURNING * INTO chosen;
 RETURN chosen;
END $$;
REVOKE ALL ON FUNCTION public.reserve_twilio_inventory(uuid,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_twilio_inventory(uuid,text,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.lease_twilio_inventory(_phone_sid text, _account_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.twilio_verified_inventory SET lease_until = now() + interval '2 minutes' WHERE phone_sid = _phone_sid AND assigned_account_id = _account_id AND (lease_until IS NULL OR lease_until < now());
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.lease_twilio_inventory(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_twilio_inventory(text,uuid) TO service_role;