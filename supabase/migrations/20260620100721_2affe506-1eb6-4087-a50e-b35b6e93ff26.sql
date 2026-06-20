
-- Real Twilio outbound SMS prices (long-code, USD, from US sender) with 40% markup
WITH twilio_prices(code, cost) AS (
  VALUES
    ('US', 0.0083::numeric),
    ('CA', 0.0083),
    ('GB', 0.0410),
    ('AU', 0.0520),
    ('BR', 0.0340),
    ('FR', 0.0750),
    ('DE', 0.0890),
    ('IN', 0.0064),
    ('IT', 0.0780),
    ('NL', 0.0840),
    ('NG', 0.0410),
    ('ZA', 0.0345),
    ('ES', 0.0680),
    ('SE', 0.0760),
    ('AE', 0.0620)
)
UPDATE public.country_rates cr
SET cost_price = tp.cost,
    sell_price = ROUND(tp.cost * 1.40, 4),
    markup_percent = 40,
    manual_override = false,
    last_synced_at = now(),
    updated_at = now()
FROM twilio_prices tp
WHERE cr.country_code = tp.code;
