// Test-only: loads the real blog migrations into an in-memory Postgres with minimal platform stubs.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const BASE = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA cron;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('test.role',true),''),'service_role') $$;
CREATE TABLE cron.job(jobid serial PRIMARY KEY, jobname text UNIQUE, schedule text, command text);
CREATE FUNCTION cron.schedule(n text, s text, c text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command) VALUES(n,s,c) ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule RETURNING jobid::bigint $$;
CREATE FUNCTION cron.unschedule(n text) RETURNS boolean LANGUAGE sql AS $$ WITH d AS (DELETE FROM cron.job WHERE jobname=n RETURNING 1) SELECT count(*)>0 FROM d $$;
GRANT USAGE ON SCHEMA auth, cron TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TYPE public.content_kind AS ENUM ('article','guide','tutorial','pillar','glossary','case_study');
CREATE TYPE public.content_status AS ENUM ('draft','in_review','approved','scheduled','published','archived');
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role app_role NOT NULL);
CREATE FUNCTION public.has_role(_user_id uuid,_role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
CREATE FUNCTION public.has_role(_role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.has_role(auth.uid(),_role) $$;
CREATE TABLE public.accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, owner_id uuid, email text);
CREATE TABLE public.content_authors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, name text, title text, bio text, avatar_url text, expertise text[] DEFAULT '{}', links jsonb DEFAULT '{}', is_organization boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.content_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL, content_type content_kind DEFAULT 'article', status content_status DEFAULT 'draft', title text NOT NULL, excerpt text DEFAULT '', body text DEFAULT '', featured_image text, image_alt text, topic text DEFAULT 'sms-marketing', tags text[] DEFAULT '{}', industries text[] DEFAULT '{}', author_id uuid, seo_title text, meta_description text, canonical_url text, og_image text, primary_keyword text, cta_key text, schema_type text DEFAULT 'Article', related_posts text[] DEFAULT '{}', related_products text[] DEFAULT '{}', related_templates text[] DEFAULT '{}', related_solutions text[] DEFAULT '{}', faqs jsonb DEFAULT '[]', featured boolean DEFAULT false, indexable boolean DEFAULT true, review_notes text, published_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), plan_id uuid, last_reviewed_at timestamptz, next_review_at timestamptz, review_interval_months smallint DEFAULT 6);
CREATE TABLE public.content_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text, path text, event_type text, session_id text, props jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
CREATE TABLE public.growth_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), event text, session_id text, account_id uuid, path text, page_type text, entity_type text, entity_slug text, cta_name text, cta_placement text, source text, medium text, campaign text, referrer_host text, country text, experiment text, variant text, props jsonb DEFAULT '{}');
CREATE TABLE public.media_assets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid, name text, kind text DEFAULT 'image', content_type text DEFAULT 'application/octet-stream', size bigint DEFAULT 0, storage_path text, url text, created_by uuid, created_at timestamptz DEFAULT now());
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON public.content_posts, public.media_assets, public.content_events TO authenticated; GRANT SELECT ON public.content_posts, public.user_roles, public.content_authors TO anon, authenticated;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published content is public" ON public.content_posts FOR SELECT USING (status='published');
CREATE POLICY "CMS media" ON public.media_assets FOR ALL USING (false);
CREATE POLICY "Admins manage content" ON public.content_posts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
`;

export const BLOG_MIGRATIONS = ['0051_integrated_blog_cms','0052_blog_metrics_and_permissions','0053_complete_blog_permissions_and_deadline_publishing','0054_blog_schedule_retry_validation','0055_scope_blog_settings_public_read','0056_blog_popular_articles'];

export async function blogDb() {
  const db = new PGlite();
  await db.exec(BASE);
  for (const m of BLOG_MIGRATIONS) {
    try { await db.exec(readFileSync(new URL(`../../drizzle/migrations/${m}.sql`, import.meta.url), 'utf8')); }
    catch (e) { throw new Error(`${m}: ${(e as Error).message}`); }
  }
  return db;
}

/** Run statements as a signed-in user (role authenticated) or anon; resets afterward. */
export async function as<T>(db: PGlite, who: { uid?: string; role: 'anon'|'authenticated'|'service_role' }, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SELECT set_config('test.uid','${who.uid ?? ''}',false); SELECT set_config('test.role','${who.role}',false); SET ROLE ${who.role};`);
  try { return await fn(); } finally { await db.exec(`RESET ROLE; SELECT set_config('test.uid','',false); SELECT set_config('test.role','',false);`); }
}
