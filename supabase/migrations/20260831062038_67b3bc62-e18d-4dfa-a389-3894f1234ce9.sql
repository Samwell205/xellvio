GRANT EXECUTE ON FUNCTION public.has_account_access(uuid, public.account_member_role) TO anon;

ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK (
  status = ANY (ARRAY['draft'::text,'queued'::text,'scheduled'::text,'sending'::text,'sent'::text,'paused'::text,'paused_by_user'::text,'paused_low_balance'::text,'cancelled'::text,'failed'::text,'blocked_content'::text])
);