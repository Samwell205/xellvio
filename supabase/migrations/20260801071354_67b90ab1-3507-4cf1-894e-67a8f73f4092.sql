CREATE TABLE IF NOT EXISTS public.dispatch_locks (
  name text PRIMARY KEY,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.dispatch_locks TO service_role;
ALTER TABLE public.dispatch_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.try_acquire_dispatch_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  INSERT INTO public.dispatch_locks (name, acquired_at)
  VALUES ('dispatch', now())
  ON CONFLICT (name) DO UPDATE
    SET acquired_at = now()
    WHERE public.dispatch_locks.acquired_at < now() - interval '90 seconds'
  RETURNING true INTO ok;

  RETURN COALESCE(ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_dispatch_lock()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.dispatch_locks WHERE name = 'dispatch';
$$;

REVOKE ALL ON FUNCTION public.try_acquire_dispatch_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_dispatch_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_dispatch_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_dispatch_lock() TO service_role;