CREATE OR REPLACE FUNCTION public.try_acquire_dispatch_lock(_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted integer := 0;
BEGIN
  -- Self-heal leases left behind by a cancelled worker.
  DELETE FROM public.dispatch_locks
   WHERE name = _name AND acquired_at < now() - interval '2 minutes';

  INSERT INTO public.dispatch_locks(name, acquired_at)
  VALUES (_name, now())
  ON CONFLICT (name) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  -- Only the caller whose INSERT actually created the row holds the lease.
  RETURN inserted = 1;
END;
$$;