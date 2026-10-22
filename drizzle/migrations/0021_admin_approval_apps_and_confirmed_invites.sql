CREATE OR REPLACE FUNCTION public.apps_block_self_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' OR NEW.visibility = 'public' THEN
      RAISE EXCEPTION 'Only admins can publish apps or make them public';
    END IF;
  ELSE
    IF (NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published')
       OR (NEW.visibility = 'public' AND OLD.visibility IS DISTINCT FROM 'public') THEN
      RAISE EXCEPTION 'Only admins can publish apps or make them public';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS apps_block_self_publish ON public.apps;
CREATE TRIGGER apps_block_self_publish BEFORE INSERT OR UPDATE ON public.apps
FOR EACH ROW EXECUTE FUNCTION public.apps_block_self_publish();

CREATE OR REPLACE FUNCTION public.claim_account_invites()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _email TEXT;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT lower(email) INTO _email FROM auth.users
   WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;
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
$function$;