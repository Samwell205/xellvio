GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.campaigns TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.contact_lists TO authenticated;
GRANT SELECT ON public.sms_thread_messages TO authenticated;

GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.campaigns TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.contact_lists TO service_role;
GRANT ALL ON public.sms_thread_messages TO service_role;