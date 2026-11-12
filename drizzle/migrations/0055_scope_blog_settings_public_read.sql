DROP POLICY IF EXISTS "Public blog settings" ON public.blog_settings;
CREATE POLICY "Public blog settings" ON public.blog_settings FOR SELECT TO anon,authenticated USING (id IS TRUE);