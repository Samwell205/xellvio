
-- Prevent non-admins from escalating sender_id status
DROP POLICY IF EXISTS "sender_ids update" ON public.sender_ids;

CREATE POLICY "sender_ids update" ON public.sender_ids
FOR UPDATE
USING (
  public.has_role('admin'::app_role)
  OR (auth.uid() = user_id AND status = 'pending'::sender_id_status)
)
WITH CHECK (
  public.has_role('admin'::app_role)
  OR (auth.uid() = user_id AND status = 'pending'::sender_id_status)
);

-- Lock down SECURITY DEFINER trigger/helper functions so they can't be called
-- directly via the Data API by anon/authenticated. Triggers run as table owner
-- regardless of EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- has_role() is referenced from RLS policies — authenticated must keep EXECUTE,
-- but anon does not need it.
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;
