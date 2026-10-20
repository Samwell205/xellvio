CREATE TABLE public.receptionist_assistants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id), name text NOT NULL DEFAULT 'Assistant', configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
 carrier_assistant_id text, sync_status text NOT NULL DEFAULT 'draft', archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.receptionist_assistants TO authenticated;
GRANT ALL ON public.receptionist_assistants TO service_role;
ALTER TABLE public.receptionist_assistants ENABLE ROW LEVEL SECURITY;
CREATE POLICY receptionist_assistant_read ON public.receptionist_assistants FOR SELECT TO authenticated USING (account_id=auth.uid() OR public.has_role('admin'));
CREATE INDEX receptionist_assistants_owner ON public.receptionist_assistants(account_id, created_at DESC);
ALTER TABLE public.receptionist_settings ADD COLUMN IF NOT EXISTS selected_assistant_id uuid REFERENCES public.receptionist_assistants(id);
INSERT INTO public.receptionist_assistants(account_id,name,configuration,carrier_assistant_id,sync_status)
 SELECT account_id,COALESCE(NULLIF(configuration->>'businessName',''),'Business') || ' assistant', configuration,assistant_id,CASE WHEN assistant_id IS NULL THEN 'draft' ELSE 'synced' END FROM public.receptionist_settings;
UPDATE public.receptionist_settings s SET selected_assistant_id=a.id FROM public.receptionist_assistants a WHERE a.account_id=s.account_id AND s.selected_assistant_id IS NULL;
CREATE OR REPLACE FUNCTION public.select_receptionist_assistant(_account_id uuid, _assistant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; active boolean;
BEGIN
 SELECT enabled INTO active FROM public.receptionist_settings WHERE account_id=_account_id FOR UPDATE;
 IF active THEN RAISE EXCEPTION 'Pause calling before switching assistants'; END IF;
 IF EXISTS(SELECT 1 FROM public.receptionist_calls WHERE account_id=_account_id AND ended_at IS NULL) THEN RAISE EXCEPTION 'Wait until current calls end before switching assistants'; END IF;
 SELECT * INTO a FROM public.receptionist_assistants WHERE id=_assistant_id AND account_id=_account_id AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assistant not found'; END IF;
 INSERT INTO public.receptionist_settings(account_id,configuration,selected_assistant_id,assistant_id,test_verified_at)
 VALUES(_account_id,a.configuration,a.id,a.carrier_assistant_id,NULL)
 ON CONFLICT(account_id) DO UPDATE SET configuration=EXCLUDED.configuration,selected_assistant_id=EXCLUDED.selected_assistant_id,assistant_id=EXCLUDED.assistant_id,test_verified_at=NULL,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.select_receptionist_assistant(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.select_receptionist_assistant(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.mirror_selected_receptionist_assistant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.selected_assistant_id IS NOT NULL THEN
 UPDATE public.receptionist_assistants SET configuration=NEW.configuration,carrier_assistant_id=NEW.assistant_id,
 sync_status=CASE WHEN NEW.assistant_id IS NULL THEN 'draft' WHEN NEW.configuration IS DISTINCT FROM OLD.configuration THEN 'changes_pending' ELSE 'synced' END,updated_at=now()
 WHERE id=NEW.selected_assistant_id AND account_id=NEW.account_id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER mirror_selected_receptionist_assistant AFTER UPDATE OF configuration,assistant_id ON public.receptionist_settings FOR EACH ROW EXECUTE FUNCTION public.mirror_selected_receptionist_assistant();