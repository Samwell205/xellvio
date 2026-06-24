
-- 1. Member role enum
DO $$ BEGIN
  CREATE TYPE public.account_member_role AS ENUM ('viewer','editor','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role public.account_member_role NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','removed')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_members_email_uq
  ON public.account_members (account_id, lower(invited_email));
CREATE INDEX IF NOT EXISTS account_members_user_idx
  ON public.account_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS account_members_account_idx
  ON public.account_members (account_id);

-- 3. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_members TO authenticated;
GRANT ALL ON public.account_members TO service_role;

-- 4. RLS
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

-- Helper: does the current user have access to the given account at >= the requested role?
-- Owner of the account (account_id == auth.uid()) is implicit admin.
CREATE OR REPLACE FUNCTION public.has_account_access(_account_id UUID, _min_role public.account_member_role DEFAULT 'viewer')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN false
      WHEN _account_id = auth.uid() THEN true
      WHEN EXISTS (
        SELECT 1 FROM public.account_members m
        WHERE m.account_id = _account_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
          AND (
            _min_role = 'viewer'
            OR (_min_role = 'editor' AND m.role IN ('editor','admin'))
            OR (_min_role = 'admin'  AND m.role = 'admin')
          )
      ) THEN true
      ELSE false
    END
$$;

-- Claim helper: links any pending invitations matching the signed-in user's email.
CREATE OR REPLACE FUNCTION public.claim_account_invites()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RETURN 0; END IF;

  WITH upd AS (
    UPDATE public.account_members
       SET user_id = auth.uid(),
           status = 'active',
           accepted_at = COALESCE(accepted_at, now()),
           updated_at = now()
     WHERE lower(invited_email) = _email
       AND status = 'invited'
       AND (user_id IS NULL OR user_id = auth.uid())
     RETURNING 1
  )
  SELECT COUNT(*) INTO _count FROM upd;
  RETURN COALESCE(_count, 0);
END;
$$;

-- Policies on account_members
CREATE POLICY "Members and owners can view team"
  ON public.account_members FOR SELECT
  USING (
    public.has_account_access(account_id, 'viewer')
    OR public.has_role('admin')
  );

CREATE POLICY "Owners and admins can insert members"
  ON public.account_members FOR INSERT
  WITH CHECK (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  );

CREATE POLICY "Owners and admins can update members"
  ON public.account_members FOR UPDATE
  USING (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  )
  WITH CHECK (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  );

CREATE POLICY "Owners and admins can delete members"
  ON public.account_members FOR DELETE
  USING (
    public.has_account_access(account_id, 'admin')
    OR public.has_role('admin')
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS account_members_touch_updated_at ON public.account_members;
CREATE TRIGGER account_members_touch_updated_at
  BEFORE UPDATE ON public.account_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Extend READ access on tenant tables so team members can view the workspace.
-- Owner-only ALL/SELECT policies remain in place; these are additive permissive policies.

CREATE POLICY "Team members can view campaigns"
  ON public.campaigns FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view profiles"
  ON public.profiles FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view segments"
  ON public.segments FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view contact_lists"
  ON public.contact_lists FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view profile_list_members"
  ON public.profile_list_members FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view suppressions"
  ON public.suppressions FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view sender_assets"
  ON public.sender_assets FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view number_requests"
  ON public.number_requests FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view sms_thread_messages"
  ON public.sms_thread_messages FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view messages"
  ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = messages.campaign_id
      AND public.has_account_access(c.account_id, 'viewer')
  ));

CREATE POLICY "Team members can view consents"
  ON public.consents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = consents.profile_id
      AND public.has_account_access(p.account_id, 'viewer')
  ));

CREATE POLICY "Team members can view credit_transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.has_account_access(account_id, 'viewer'));

CREATE POLICY "Team members can view their account row"
  ON public.accounts FOR SELECT
  USING (public.has_account_access(id, 'viewer'));
