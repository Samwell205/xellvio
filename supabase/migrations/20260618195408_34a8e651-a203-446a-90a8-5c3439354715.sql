
-- touch_updated_at is invoked by triggers; only the table owner needs to run it.
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
