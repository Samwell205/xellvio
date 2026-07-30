REVOKE ALL ON FUNCTION public.claim_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_campaign_messages(uuid, integer) TO service_role;