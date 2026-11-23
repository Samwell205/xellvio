DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.admin_finance_tenants'::regproc);
  d := replace(d, '  CROSS JOIN guard
', '');
  d := replace(d, '  ORDER BY COALESCE(a.credit_balance,0) DESC;', '  WHERE public.is_admin_or_service()
  ORDER BY COALESCE(a.credit_balance,0) DESC;');
  EXECUTE d;
END $mig$;
REVOKE EXECUTE ON FUNCTION public.admin_finance_tenants() FROM anon, public;

CREATE OR REPLACE FUNCTION public.apps_block_self_feature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_service() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.is_featured := false;
  ELSIF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN NEW.is_featured := OLD.is_featured;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS apps_block_self_feature ON public.apps;
CREATE TRIGGER apps_block_self_feature BEFORE INSERT OR UPDATE ON public.apps
FOR EACH ROW EXECUTE FUNCTION public.apps_block_self_feature();

CREATE OR REPLACE FUNCTION public.developers_block_self_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_service() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := DEFAULT_STATUS();
  END IF;
  RETURN NEW;
END $$;
DROP FUNCTION public.developers_block_self_verify();
CREATE OR REPLACE FUNCTION public.developers_block_self_verify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_service() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.verification_status := 'pending';
    NEW.is_first_party := false;
  ELSE
    NEW.verification_status := OLD.verification_status;
    NEW.is_first_party := OLD.is_first_party;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS developers_block_self_verify ON public.developers;
CREATE TRIGGER developers_block_self_verify BEFORE INSERT OR UPDATE ON public.developers
FOR EACH ROW EXECUTE FUNCTION public.developers_block_self_verify();