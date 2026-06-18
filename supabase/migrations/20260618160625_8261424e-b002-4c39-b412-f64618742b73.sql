
-- Phone numbers (toll-free purchased, plus verified personal numbers used as caller ID / reply-to)
CREATE TYPE public.phone_number_type AS ENUM ('toll_free', 'personal');
CREATE TYPE public.phone_number_status AS ENUM ('active', 'pending', 'released');

CREATE TABLE public.phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  e164 text NOT NULL,
  type public.phone_number_type NOT NULL,
  country text NOT NULL DEFAULT 'US',
  status public.phone_number_status NOT NULL DEFAULT 'active',
  twilio_sid text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, e164)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_numbers TO authenticated;
GRANT ALL ON public.phone_numbers TO service_role;
ALTER TABLE public.phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own phone_numbers" ON public.phone_numbers FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_phone_numbers_touch BEFORE UPDATE ON public.phone_numbers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Sender IDs (alphanumeric) requiring admin approval
CREATE TYPE public.sender_id_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.sender_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  countries text[] NOT NULL DEFAULT '{}',
  use_case text,
  status public.sender_id_status NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sender_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sender_ids TO authenticated;
GRANT ALL ON public.sender_ids TO service_role;
ALTER TABLE public.sender_ids ENABLE ROW LEVEL SECURITY;

-- Users manage their own
CREATE POLICY "own sender_ids select" ON public.sender_ids FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own sender_ids insert" ON public.sender_ids FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sender_ids delete" ON public.sender_ids FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
-- Users can only update their own pending requests (e.g. edit before review). Admins can update any.
CREATE POLICY "sender_ids update" ON public.sender_ids FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (auth.uid() = user_id AND status = 'pending'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR (auth.uid() = user_id AND status = 'pending'));

CREATE TRIGGER trg_sender_ids_touch BEFORE UPDATE ON public.sender_ids
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Phone OTP verifications (for adding a personal number)
CREATE TABLE public.phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  e164 text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_verifications TO authenticated;
GRANT ALL ON public.phone_verifications TO service_role;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own phone_verifications" ON public.phone_verifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_phone_verifications_user_phone ON public.phone_verifications(user_id, e164);
CREATE INDEX idx_phone_numbers_user ON public.phone_numbers(user_id);
CREATE INDEX idx_sender_ids_status ON public.sender_ids(status);
