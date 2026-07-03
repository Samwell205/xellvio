REVOKE ALL ON public.verifier_signup_codes FROM PUBLIC;
REVOKE ALL ON public.verifier_signup_codes FROM anon;
REVOKE ALL ON public.verifier_signup_codes FROM authenticated;
GRANT ALL ON public.verifier_signup_codes TO service_role;