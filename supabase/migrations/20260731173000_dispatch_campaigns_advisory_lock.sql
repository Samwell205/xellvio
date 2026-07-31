-- Guard against overlapping dispatch-campaign invocations. Nothing
-- previously prevented pg_cron from firing a new tick while a prior one was
-- still mid-flight — two concurrent invocations both calling
-- claim_campaign_messages for the same campaign around the same moment is a
-- plausible explanation for messages that get claimed/charged but never
-- reach a terminal status. Make concurrent execution structurally
-- impossible.
--
-- A session-scoped pg_advisory_lock is NOT viable here: Supabase's
-- PostgREST/RPC calls run over pooled connections, so a lock acquired in
-- one RPC call would release as soon as that call's connection goes back to
-- the pool — not for the duration of the whole Worker invocation. A plain
-- row with a conditional UPDATE works correctly over stateless REST calls.
CREATE TABLE IF NOT EXISTS public.dispatch_lock (
  id text PRIMARY KEY,
  locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz
);
INSERT INTO public.dispatch_lock (id, locked) VALUES ('dispatch-campaigns', false)
ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON public.dispatch_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.dispatch_lock TO service_role;

-- _stale_after_seconds: if a prior invocation crashed/died without
-- releasing the lock, it self-heals after this many seconds instead of
-- deadlocking the dispatcher permanently. Comfortably above the 60s pg_net
-- timeout so a legitimately-still-running invocation is never pre-empted.
CREATE OR REPLACE FUNCTION public.try_acquire_dispatch_lock(_stale_after_seconds integer DEFAULT 90)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE public.dispatch_lock
  SET locked = true, locked_at = now()
  WHERE id = 'dispatch-campaigns'
    AND (locked = false OR locked_at < now() - make_interval(secs => _stale_after_seconds));
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_dispatch_lock()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.dispatch_lock SET locked = false WHERE id = 'dispatch-campaigns';
$function$;

REVOKE ALL ON FUNCTION public.try_acquire_dispatch_lock(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_dispatch_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_dispatch_lock(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_dispatch_lock() TO service_role;
