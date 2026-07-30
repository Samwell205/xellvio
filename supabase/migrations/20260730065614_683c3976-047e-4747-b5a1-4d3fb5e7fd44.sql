UPDATE public.platform_settings SET value = '55'::jsonb, updated_at = now() WHERE key = 'default_markup_percent';
INSERT INTO public.platform_settings (key, value)
SELECT 'default_markup_percent', '55'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'default_markup_percent');

UPDATE public.country_rates
SET markup_percent = 55,
    sell_price = round((cost_price + COALESCE(passthrough_fee,0)) * 1.55, 4),
    updated_at = now()
WHERE manual_override = false;