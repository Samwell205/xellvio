CREATE OR REPLACE FUNCTION public.apps_block_self_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role('admin'::public.app_role) THEN
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