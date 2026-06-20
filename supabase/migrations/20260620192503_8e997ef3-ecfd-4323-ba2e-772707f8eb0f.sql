CREATE TABLE public.campaign_test_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  to_phone TEXT NOT NULL,
  twilio_sid TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX campaign_test_sends_user_day_idx ON public.campaign_test_sends (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.campaign_test_sends TO authenticated;
GRANT ALL ON public.campaign_test_sends TO service_role;
ALTER TABLE public.campaign_test_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own test sends" ON public.campaign_test_sends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own test sends" ON public.campaign_test_sends FOR INSERT WITH CHECK (auth.uid() = user_id);