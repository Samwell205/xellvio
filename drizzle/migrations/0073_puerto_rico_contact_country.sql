CREATE OR REPLACE FUNCTION public.profiles_set_puerto_rico_country()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.country_code IS NULL OR NEW.country_code IN ('', 'US'))
     AND NEW.phone_e164 ~ '^\+1(787|939)' THEN
    NEW.country_code := 'PR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_puerto_rico_country ON public.profiles;
CREATE TRIGGER profiles_set_puerto_rico_country
BEFORE INSERT OR UPDATE OF phone_e164, country_code ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_set_puerto_rico_country();

UPDATE public.profiles SET country_code = 'PR'
WHERE (country_code IS NULL OR country_code IN ('', 'US'))
  AND phone_e164 ~ '^\+1(787|939)';