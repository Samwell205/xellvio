
-- Academy schema
CREATE TABLE public.academy_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  level TEXT NOT NULL DEFAULT 'beginner',
  category TEXT NOT NULL DEFAULT 'General',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.academy_courses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_courses TO authenticated;
GRANT ALL ON public.academy_courses TO service_role;
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published courses"
  ON public.academy_courses FOR SELECT
  USING (is_published = true OR public.has_role('admin'));
CREATE POLICY "Admins manage courses (insert)"
  ON public.academy_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage courses (update)"
  ON public.academy_courses FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins manage courses (delete)"
  ON public.academy_courses FOR DELETE TO authenticated
  USING (public.has_role('admin'));

CREATE TRIGGER trg_academy_courses_updated
  BEFORE UPDATE ON public.academy_courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.academy_lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 5,
  is_free_preview BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(course_id, slug)
);
GRANT SELECT ON public.academy_lessons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_lessons TO authenticated;
GRANT ALL ON public.academy_lessons TO service_role;
ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read lessons of published courses"
  ON public.academy_lessons FOR SELECT
  USING (
    public.has_role('admin')
    OR EXISTS (SELECT 1 FROM public.academy_courses c WHERE c.id = course_id AND c.is_published = true)
  );
CREATE POLICY "Admins insert lessons"
  ON public.academy_lessons FOR INSERT TO authenticated
  WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins update lessons"
  ON public.academy_lessons FOR UPDATE TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY "Admins delete lessons"
  ON public.academy_lessons FOR DELETE TO authenticated
  USING (public.has_role('admin'));

CREATE TRIGGER trg_academy_lessons_updated
  BEFORE UPDATE ON public.academy_lessons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.academy_enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  certificate_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_enrollments TO authenticated;
GRANT SELECT ON public.academy_enrollments TO anon; -- for certificate verification by code
GRANT ALL ON public.academy_enrollments TO service_role;
ALTER TABLE public.academy_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own enrollments"
  ON public.academy_enrollments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Anyone can verify certificate by code"
  ON public.academy_enrollments FOR SELECT TO anon
  USING (certificate_code IS NOT NULL);
CREATE POLICY "Users enroll themselves"
  ON public.academy_enrollments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own enrollment"
  ON public.academy_enrollments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own enrollment"
  ON public.academy_enrollments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE TRIGGER trg_academy_enrollments_updated
  BEFORE UPDATE ON public.academy_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.academy_lesson_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES public.academy_enrollments(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(enrollment_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_lesson_progress TO authenticated;
GRANT ALL ON public.academy_lesson_progress TO service_role;
ALTER TABLE public.academy_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own progress"
  ON public.academy_lesson_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role('admin'));
CREATE POLICY "Users write own progress"
  ON public.academy_lesson_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own progress"
  ON public.academy_lesson_progress FOR DELETE TO authenticated
  USING (user_id = auth.uid());
