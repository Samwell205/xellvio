ALTER TABLE public.country_rates REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.country_rates;