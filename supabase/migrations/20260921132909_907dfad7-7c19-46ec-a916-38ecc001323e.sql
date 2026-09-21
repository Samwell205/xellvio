-- blocked_domains: internal moderation blocklist, read only server-side
DROP POLICY IF EXISTS "Anyone can read blocklist" ON public.blocked_domains;
REVOKE ALL ON public.blocked_domains FROM anon;
CREATE POLICY "Admins read blocklist" ON public.blocked_domains
  FOR SELECT TO authenticated USING (has_role('admin'::app_role));

-- app_categories: catalogue reference data, served through server code
DROP POLICY IF EXISTS "categories are public" ON public.app_categories;
REVOKE ALL ON public.app_categories FROM anon;
CREATE POLICY "Signed-in users read categories" ON public.app_categories
  FOR SELECT TO authenticated USING (true);

-- developers: contains support_email, must not be world-readable
DROP POLICY IF EXISTS "developer profiles are public" ON public.developers;
REVOKE ALL ON public.developers FROM anon;
CREATE POLICY "Owners and admins read developer profiles" ON public.developers
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role('admin'::app_role));

-- content_authors: no client reads; admin-only
DROP POLICY IF EXISTS "Authors are public" ON public.content_authors;
REVOKE ALL ON public.content_authors FROM anon;
CREATE POLICY "Admins read authors" ON public.content_authors
  FOR SELECT TO authenticated USING (has_role('admin'::app_role));

-- content_events: no client writes; server code uses the service role
DROP POLICY IF EXISTS "Anyone can record content events" ON public.content_events;
REVOKE ALL ON public.content_events FROM anon;
GRANT ALL ON public.content_events TO service_role;