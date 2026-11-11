ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS publish_error text, ADD COLUMN IF NOT EXISTS publish_retry_at timestamptz;
DROP POLICY "CMS media" ON public.media_assets;
CREATE POLICY "CMS reads media" ON public.media_assets FOR SELECT TO authenticated USING(blog_asset AND public.blog_role() IN ('admin','editor','writer'));
CREATE POLICY "CMS writes media" ON public.media_assets FOR ALL TO authenticated USING(blog_asset AND (public.blog_role() IN ('admin','editor') OR (public.blog_role()='writer' AND created_by=auth.uid()))) WITH CHECK(blog_asset AND (public.blog_role() IN ('admin','editor') OR (public.blog_role()='writer' AND created_by=auth.uid())));
CREATE POLICY "Staff reads authors" ON public.content_authors FOR SELECT TO authenticated USING(public.blog_role() IN ('admin','editor','writer'));
CREATE OR REPLACE FUNCTION public.blog_set_staff(_user uuid,_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role('admin') OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Administrator access required'; END IF;
IF _role IS NOT NULL AND _role NOT IN ('editor','writer') THEN RAISE EXCEPTION 'Invalid blog role'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=_user) THEN RAISE EXCEPTION 'User not found'; END IF;
IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role='admin') THEN RAISE EXCEPTION 'Administrators already have full access'; END IF;
IF _role IS NULL THEN DELETE FROM public.blog_staff WHERE user_id=_user; ELSE INSERT INTO public.blog_staff(user_id,role) VALUES(_user,_role) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role; END IF;
INSERT INTO public.blog_audit(action,actor_id,details) VALUES('staff_access_changed',auth.uid(),jsonb_build_object('userId',_user,'role',_role)); END $$;
REVOKE ALL ON FUNCTION public.blog_set_staff(uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.blog_set_staff(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.blog_schedule_next() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE deadline timestamptz; stamp timestamp; BEGIN
PERFORM pg_advisory_xact_lock(hashtext('blog-publishing-schedule'));
PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='blog-publish-due';
SELECT min(greatest(scheduled_at,coalesce(publish_retry_at,scheduled_at))) INTO deadline FROM public.content_posts WHERE status='scheduled' AND publish_attempts<5;
IF deadline IS NULL THEN RETURN; END IF;
stamp:=date_trunc('minute',greatest(deadline,now())) AT TIME ZONE 'UTC' + interval '1 minute';
PERFORM cron.schedule('blog-publish-due',to_char(stamp,'MI HH24 DD MM')||' *','SELECT public.blog_publish_due()'); END $$;
REVOKE ALL ON FUNCTION public.blog_schedule_next() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.blog_schedule_next() TO service_role;
CREATE OR REPLACE FUNCTION public.blog_publish_due() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; n integer:=0; BEGIN
PERFORM pg_advisory_xact_lock(hashtext('blog-publishing-schedule'));
FOR r IN SELECT id FROM public.content_posts WHERE status='scheduled' AND scheduled_at<=now() AND coalesce(publish_retry_at,scheduled_at)<=now() AND publish_attempts<5 ORDER BY scheduled_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
BEGIN
UPDATE public.content_posts SET status='published',published_at=scheduled_at,scheduled_at=NULL,publish_error=NULL,publish_retry_at=NULL WHERE id=r.id AND status='scheduled'; IF FOUND THEN n:=n+1; END IF;
EXCEPTION WHEN OTHERS THEN UPDATE public.content_posts SET publish_attempts=publish_attempts+1,publish_error=left(SQLERRM,500),publish_retry_at=now()+interval '5 minutes' WHERE id=r.id; END;
END LOOP;
PERFORM public.blog_schedule_next(); RETURN n; END $$;
CREATE OR REPLACE FUNCTION public.blog_arm_schedule() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP='DELETE' THEN IF OLD.status='scheduled' THEN PERFORM public.blog_schedule_next(); END IF; RETURN OLD; END IF;
IF NEW.status='scheduled' OR (TG_OP='UPDATE' AND OLD.status='scheduled') THEN PERFORM public.blog_schedule_next(); END IF; RETURN NEW; END $$;
DROP TRIGGER blog_arm_schedule ON public.content_posts;
CREATE TRIGGER blog_arm_schedule AFTER INSERT OR UPDATE OR DELETE ON public.content_posts FOR EACH ROW EXECUTE FUNCTION public.blog_arm_schedule();
CREATE INDEX IF NOT EXISTS blog_growth_session_idx ON public.growth_events(session_id,created_at) WHERE event='signup_completed';
CREATE OR REPLACE FUNCTION public.blog_metrics() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
IF public.blog_role() NOT IN ('admin','editor') OR public.blog_role() IS NULL THEN RAISE EXCEPTION 'Editor access required'; END IF;
SELECT jsonb_build_object('published',(SELECT count(*) FROM content_posts WHERE status='published' AND visibility='public' AND published_at<=now()),'drafts',(SELECT count(*) FROM content_posts WHERE status IN ('draft','in_review')),'scheduled',(SELECT count(*) FROM content_posts WHERE status='scheduled'),'views',(SELECT count(*) FROM content_events WHERE event_type='blog_view'),'visitors',(SELECT count(DISTINCT session_id) FROM content_events WHERE event_type='blog_view'),'engaged',(SELECT count(*) FROM content_events WHERE event_type='blog_engaged'),'ctaClicks',(SELECT count(*) FROM content_events WHERE event_type='blog_cta'),'subscriptions',(SELECT count(*) FROM blog_subscriptions),'registrations',(SELECT count(DISTINCT g.session_id) FROM growth_events g WHERE g.event='signup_completed' AND EXISTS(SELECT 1 FROM content_events e WHERE e.session_id=g.session_id AND e.event_type='blog_view' AND e.created_at<=g.created_at AND e.created_at>=g.created_at-interval '1 day')),'top',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT p.id,p.title,p.slug,p.topic,count(e.id) FILTER(WHERE e.event_type='blog_view') AS views,count(DISTINCT e.session_id) FILTER(WHERE e.event_type='blog_view') AS visitors,count(e.id) FILTER(WHERE e.event_type='blog_cta') AS cta_clicks FROM content_posts p LEFT JOIN content_events e ON e.slug=p.slug OR e.props->>'postId'=p.id::text WHERE p.status='published' AND p.visibility='public' AND p.published_at<=now() GROUP BY p.id ORDER BY count(e.id) FILTER(WHERE e.event_type='blog_view') DESC,p.id LIMIT 10) t),'trend',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT d::date AS day,count(e.id) AS views FROM generate_series(current_date-29,current_date,'1 day') d LEFT JOIN content_events e ON e.created_at>=d AND e.created_at<d+interval '1 day' AND e.event_type='blog_view' GROUP BY d ORDER BY d) t),'sources',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT coalesce(props->>'source','direct') AS source,count(*) AS views FROM content_events WHERE event_type='blog_view' AND created_at>=now()-interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 20) t)) INTO result; RETURN result; END $$;
CREATE OR REPLACE FUNCTION public.blog_record_event(_slug text,_event text,_session text,_source text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE article uuid; BEGIN
IF _event NOT IN ('blog_view','blog_engaged','blog_cta') OR length(_session)>80 THEN RETURN false; END IF;
SELECT id INTO article FROM content_posts WHERE slug=_slug AND status='published' AND visibility='public' AND published_at<=now(); IF article IS NULL THEN RETURN false; END IF;
PERFORM pg_advisory_xact_lock(hashtext(_session));
IF EXISTS(SELECT 1 FROM content_events WHERE session_id=_session AND event_type=_event AND (slug=_slug OR props->>'postId'=article::text) AND created_at>now()-interval '30 minutes') THEN RETURN false; END IF;
IF (SELECT count(*) FROM content_events WHERE session_id=_session AND created_at>now()-interval '1 day')>=100 THEN RETURN false; END IF;
INSERT INTO content_events(slug,path,event_type,session_id,props) VALUES(_slug,'/blog/'||_slug,_event,_session,jsonb_build_object('source',left(_source,120),'postId',article)); RETURN true; END $$;