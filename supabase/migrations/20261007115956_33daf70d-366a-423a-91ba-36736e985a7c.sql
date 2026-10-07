CREATE TABLE public.verifier_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id uuid NOT NULL UNIQUE REFERENCES public.verifiers(id) ON DELETE CASCADE,
  nin_hash text NOT NULL UNIQUE,
  nin_last4 text NOT NULL,
  id_photo_path text NOT NULL,
  selfie_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.verifier_identity TO authenticated;
GRANT ALL ON public.verifier_identity TO service_role;
ALTER TABLE public.verifier_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verifier identity own or admin read" ON public.verifier_identity FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.verifiers v WHERE v.id = verifier_id AND v.user_id = auth.uid()) OR public.has_role('admin'));
CREATE TRIGGER verifier_identity_touch BEFORE UPDATE ON public.verifier_identity FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.verifier_device_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verifier_id uuid NOT NULL REFERENCES public.verifiers(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  fingerprint text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verifier_id, device_id, ip)
);
CREATE INDEX verifier_device_signals_device_idx ON public.verifier_device_signals(device_id);
CREATE INDEX verifier_device_signals_fp_idx ON public.verifier_device_signals(fingerprint);
CREATE INDEX verifier_device_signals_ip_idx ON public.verifier_device_signals(ip);
GRANT SELECT ON public.verifier_device_signals TO authenticated;
GRANT ALL ON public.verifier_device_signals TO service_role;
ALTER TABLE public.verifier_device_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device signals admin read" ON public.verifier_device_signals FOR SELECT TO authenticated USING (public.has_role('admin'));