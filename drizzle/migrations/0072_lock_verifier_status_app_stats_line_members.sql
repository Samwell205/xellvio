CREATE OR REPLACE FUNCTION public.verifiers_block_self_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_service() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.is_active := true;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN NEW.is_active := OLD.is_active;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS verifiers_block_self_active ON public.verifiers;
CREATE TRIGGER verifiers_block_self_active BEFORE INSERT OR UPDATE ON public.verifiers
FOR EACH ROW EXECUTE FUNCTION public.verifiers_block_self_active();

CREATE OR REPLACE FUNCTION public.apps_block_self_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_service() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.rating := NULL; NEW.install_count := 0;
  ELSE
    NEW.rating := OLD.rating; NEW.install_count := OLD.install_count;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS apps_block_self_stats ON public.apps;
CREATE TRIGGER apps_block_self_stats BEFORE INSERT OR UPDATE ON public.apps
FOR EACH ROW EXECUTE FUNCTION public.apps_block_self_stats();

DROP POLICY IF EXISTS "Members read own line" ON public.tenant_twilio_lines;
CREATE POLICY "Members read own line" ON public.tenant_twilio_lines FOR SELECT TO authenticated
USING (account_id = auth.uid() OR EXISTS (SELECT 1 FROM public.account_members m
  WHERE m.account_id = tenant_twilio_lines.account_id AND m.user_id = auth.uid() AND m.status = 'active'));