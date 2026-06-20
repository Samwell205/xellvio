
GRANT SELECT ON public.country_rates_public TO authenticated, anon;

DROP POLICY IF EXISTS "campaign-media insert own" ON storage.objects;
CREATE POLICY "campaign-media insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "campaign-media update own" ON storage.objects;
CREATE POLICY "campaign-media update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "campaign-media delete own" ON storage.objects;
CREATE POLICY "campaign-media delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "campaign-media read own" ON storage.objects;
CREATE POLICY "campaign-media read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
