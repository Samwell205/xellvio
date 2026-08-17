-- Per-campaign dispatch leases so multiple dispatcher ticks can send for
-- different campaigns in parallel (message claiming is already atomic via
-- SKIP LOCKED, so parallel ticks cannot double-send).
CREATE OR REPLACE FUNCTION public.try_acquire_dispatch_lock(_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok boolean := false;
BEGIN
  DELETE FROM public.dispatch_locks
   WHERE name = _name AND acquired_at < now() - interval '2 minutes';
  INSERT INTO public.dispatch_locks(name, acquired_at)
  VALUES (_name, now())
  ON CONFLICT (name) DO NOTHING;
  SELECT EXISTS (
    SELECT 1 FROM public.dispatch_locks
     WHERE name = _name AND acquired_at >= now() - interval '5 seconds'
  ) INTO ok;
  RETURN ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_dispatch_lock(_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.dispatch_locks WHERE name = _name;
$$;

GRANT EXECUTE ON FUNCTION public.try_acquire_dispatch_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_dispatch_lock(text) TO service_role;