REVOKE EXECUTE ON FUNCTION public.delete_contact_lists(uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contact_lists(uuid, uuid[], boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_verifier_wallet(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_verifier_wallet(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_acting_account_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid()
         AND NOT public.has_role('admin'::public.app_role) THEN NULL
    ELSE COALESCE(
      (SELECT m.account_id FROM public.account_members m
        WHERE m.user_id = _user_id AND m.status = 'active'
        ORDER BY m.accepted_at ASC NULLS LAST, m.created_at ASC LIMIT 1),
      _user_id)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.apps_block_self_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' OR NEW.visibility = 'public' THEN
      RAISE EXCEPTION 'Only admins can publish apps or make them public';
    END IF;
    IF COALESCE(NEW.is_featured, false) THEN
      RAISE EXCEPTION 'Only admins can feature apps';
    END IF;
  ELSE
    IF (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')
       OR (NEW.visibility = 'public' AND OLD.visibility IS DISTINCT FROM 'public') THEN
      RAISE EXCEPTION 'Only admins can publish apps or make them public';
    END IF;
    IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
      RAISE EXCEPTION 'Only admins can feature apps';
    END IF;
  END IF;
  RETURN NEW;
END $function$;