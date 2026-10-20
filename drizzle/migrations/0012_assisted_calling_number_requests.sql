CREATE TABLE public.assisted_number_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id), requested_by uuid NOT NULL,
 country text NOT NULL, number_type text NOT NULL, requested_number text NOT NULL, purpose text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_review','documents_needed','carrier_pending','completed','rejected')),
 fee_usd numeric NOT NULL DEFAULT 100, charged_at timestamptz NOT NULL DEFAULT now(), target_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
 ticket_id uuid NOT NULL REFERENCES public.support_tickets(id), admin_notes text, reviewed_by uuid, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assisted_number_requests TO authenticated;
GRANT ALL ON public.assisted_number_requests TO service_role;
ALTER TABLE public.assisted_number_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY assisted_number_owner_read ON public.assisted_number_requests FOR SELECT TO authenticated USING (account_id = auth.uid() OR public.has_role('admin'));
CREATE INDEX assisted_number_requests_queue ON public.assisted_number_requests(status, created_at DESC);
CREATE UNIQUE INDEX assisted_number_one_open ON public.assisted_number_requests(account_id) WHERE status NOT IN ('completed','rejected');
CREATE OR REPLACE FUNCTION public.submit_assisted_number_request(_account_id uuid, _requested_by uuid, _country text, _number_type text, _requested_number text, _purpose text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; existing_id uuid; ticket uuid; request_id uuid; body text;
BEGIN
 SELECT id, email, contact_email, full_name, suspended_at, onboarding_status INTO a FROM public.accounts WHERE id=_account_id FOR UPDATE;
 IF NOT FOUND OR a.suspended_at IS NOT NULL OR a.onboarding_status='suspended' THEN RAISE EXCEPTION 'This business cannot request a number right now'; END IF;
 IF _requested_by <> _account_id THEN RAISE EXCEPTION 'Only the business owner can submit this request'; END IF;
 IF _country !~ '^[A-Z]{2}$' OR _number_type NOT IN ('mobile','local','national','toll-free') OR _requested_number !~ '^\+[1-9][0-9]{6,14}$' OR length(trim(_purpose)) < 10 THEN RAISE EXCEPTION 'Invalid number request'; END IF;
 SELECT id INTO existing_id FROM public.assisted_number_requests WHERE account_id=_account_id AND status NOT IN ('completed','rejected');
 IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
 body := 'Assisted number verification: ' || _requested_number || ' (' || _country || ', ' || _number_type || '). Purpose: ' || _purpose || E'\nOne-time assistance fee: $100. Support handling target: 24 hours. Carrier approval and availability are not guaranteed; all required documents and checks still apply. Monthly number and usage charges are separate.';
 INSERT INTO public.support_tickets(account_id,requester_email,requester_name,subject,topic,source,last_customer_reply_at)
 VALUES(_account_id,COALESCE(NULLIF(a.contact_email,''),a.email),a.full_name,'Assisted number verification — ' || _requested_number,'assisted_number_verification','app',now()) RETURNING id INTO ticket;
 INSERT INTO public.support_ticket_messages(ticket_id,author,author_user_id,body,via) VALUES(ticket,'customer',_requested_by,body,'web');
 PERFORM public.debit_account(_account_id,100,NULL,'Assisted number verification — ' || _requested_number || ' — ticket ' || ticket);
 INSERT INTO public.assisted_number_requests(account_id,requested_by,country,number_type,requested_number,purpose,ticket_id) VALUES(_account_id,_requested_by,_country,_number_type,_requested_number,_purpose,ticket) RETURNING id INTO request_id;
 RETURN request_id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_assisted_number_request(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assisted_number_request(uuid,uuid,text,text,text,text) TO service_role;