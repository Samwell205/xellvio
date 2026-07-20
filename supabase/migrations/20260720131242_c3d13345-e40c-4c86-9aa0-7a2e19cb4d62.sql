DROP POLICY IF EXISTS "Public read academy covers" ON storage.objects;
DROP POLICY IF EXISTS "Admins read academy covers" ON storage.objects;
CREATE POLICY "Admins read academy covers" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'academy-covers' AND public.has_role('admin'));