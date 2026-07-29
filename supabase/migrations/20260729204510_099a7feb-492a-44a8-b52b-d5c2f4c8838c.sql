CREATE OR REPLACE FUNCTION public.country_rates_prevent_below_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  sms_true_cost numeric;
  sms_sell numeric;
  mms_true_cost numeric;
  mms_sell numeric;
BEGIN
  IF COALESCE(NEW.active, false) THEN
    sms_true_cost := COALESCE(NEW.cost_price, 0) + COALESCE(NEW.passthrough_fee, 0);
    sms_sell := COALESCE(NEW.sell_price, 0);

    IF sms_true_cost > 0 AND sms_sell < sms_true_cost THEN
      RAISE EXCEPTION 'Sell price cannot be below true SMS cost for %', NEW.country_code;
    END IF;

    mms_true_cost := sms_true_cost * COALESCE(NEW.mms_cost_multiplier, NEW.mms_multiplier, 1);
    mms_sell := sms_sell * COALESCE(NEW.mms_multiplier, 1);

    IF mms_true_cost > 0 AND mms_sell < mms_true_cost THEN
      RAISE EXCEPTION 'MMS price cannot be below true MMS cost for %', NEW.country_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS country_rates_prevent_below_cost_trigger ON public.country_rates;
CREATE TRIGGER country_rates_prevent_below_cost_trigger
BEFORE INSERT OR UPDATE OF active, cost_price, passthrough_fee, sell_price, mms_multiplier, mms_cost_multiplier
ON public.country_rates
FOR EACH ROW
EXECUTE FUNCTION public.country_rates_prevent_below_cost();

UPDATE public.country_rates
SET
  cost_price = 0.0095,
  passthrough_fee = 0.0040,
  inbound_cost = 0.0080,
  sell_price = 0.0271,
  markup_percent = 101,
  mms_multiplier = 1.4760,
  mms_cost_multiplier = 2.3704,
  manual_override = true,
  number_type_used = 'measured_sms',
  updated_at = now()
WHERE country_code = 'US';