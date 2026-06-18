CREATE POLICY "tenant uploads own opt-in screenshot" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'opt-in-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tenant reads own opt-in screenshot" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'opt-in-assets' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role('admin')));
CREATE POLICY "tenant updates own opt-in screenshot" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'opt-in-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "tenant deletes own opt-in screenshot" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'opt-in-assets' AND (storage.foldername(name))[1] = auth.uid()::text);