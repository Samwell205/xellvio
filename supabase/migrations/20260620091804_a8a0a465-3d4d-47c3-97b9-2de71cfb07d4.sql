ALTER TABLE public.sender_assets REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sender_assets;