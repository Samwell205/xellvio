
CREATE POLICY "Public read academy covers" ON storage.objects FOR SELECT TO public USING (bucket_id = 'academy-covers');
CREATE POLICY "Admins upload academy covers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'academy-covers' AND public.has_role('admin'));
CREATE POLICY "Admins update academy covers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'academy-covers' AND public.has_role('admin'));
CREATE POLICY "Admins delete academy covers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'academy-covers' AND public.has_role('admin'));
