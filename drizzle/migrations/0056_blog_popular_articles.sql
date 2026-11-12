-- Public popular articles ranked by real unique visitors over the last 30 days; internal/QA events are excluded.
CREATE INDEX IF NOT EXISTS blog_content_events_view_idx ON public.content_events(created_at) WHERE event_type='blog_view';
CREATE OR REPLACE FUNCTION public.blog_popular(_limit integer DEFAULT 4) RETURNS TABLE(slug text,title text,featured_image text,image_alt text,topic text,words integer,visitors bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT p.slug,p.title,p.featured_image,p.image_alt,p.topic,
 coalesce(array_length(regexp_split_to_array(nullif(btrim(regexp_replace(p.body,'<[^>]+>',' ','g')),''),'\s+'),1),0),
 count(DISTINCT e.session_id)
FROM public.content_events e JOIN public.content_posts p ON p.id::text=e.props->>'postId'
WHERE e.event_type='blog_view' AND e.created_at>=now()-interval '30 days' AND coalesce(e.props->>'internal','false')<>'true'
 AND p.status='published' AND p.visibility='public' AND p.published_at<=now()
GROUP BY p.id ORDER BY count(DISTINCT e.session_id) DESC,p.published_at DESC LIMIT least(greatest(coalesce(_limit,4),1),8) $$;
REVOKE ALL ON FUNCTION public.blog_popular(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_popular(integer) TO anon,authenticated,service_role;
