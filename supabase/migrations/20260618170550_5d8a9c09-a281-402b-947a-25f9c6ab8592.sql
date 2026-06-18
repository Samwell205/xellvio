
-- Fix 1: Remove SELECT access to verification code hashes from client policies
DROP POLICY IF EXISTS "own phone_verifications" ON public.phone_verifications;
CREATE POLICY "phone_verifications_insert_own" ON public.phone_verifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "phone_verifications_update_own" ON public.phone_verifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "phone_verifications_delete_own" ON public.phone_verifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own verification codes" ON public.verification_codes;
CREATE POLICY "verification_codes_insert_own" ON public.verification_codes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "verification_codes_update_own" ON public.verification_codes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "verification_codes_delete_own" ON public.verification_codes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix 2: Replace has_role with a single-arg variant that resolves the user from auth.uid()
-- Drop policies that depend on the 2-arg form first
DROP POLICY IF EXISTS "own sender_ids select" ON public.sender_ids;
DROP POLICY IF EXISTS "sender_ids update" ON public.sender_ids;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  )
$$;

-- Recreate sender_ids policies using the new function signature
CREATE POLICY "own sender_ids select" ON public.sender_ids
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role('admin'::public.app_role));

CREATE POLICY "sender_ids update" ON public.sender_ids
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'::public.app_role) OR (auth.uid() = user_id AND status = 'pending'::sender_id_status))
  WITH CHECK (public.has_role('admin'::public.app_role) OR (auth.uid() = user_id AND status = 'pending'::sender_id_status));

-- Also update handle_new_user to use the new signature (it referenced direct table, keep as-is)
