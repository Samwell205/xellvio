CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM anon;