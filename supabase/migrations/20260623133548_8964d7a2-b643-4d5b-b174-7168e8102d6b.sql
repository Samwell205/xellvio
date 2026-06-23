
CREATE TABLE public.sms_thread_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL,
  phone_e164 TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  body TEXT NOT NULL,
  from_number TEXT,
  to_number TEXT,
  provider_sid TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX sms_thread_messages_account_phone_idx ON public.sms_thread_messages (account_id, phone_e164, created_at DESC);
GRANT SELECT ON public.sms_thread_messages TO authenticated;
GRANT ALL ON public.sms_thread_messages TO service_role;
ALTER TABLE public.sms_thread_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants read own thread messages" ON public.sms_thread_messages
  FOR SELECT TO authenticated USING (account_id = auth.uid());
