import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

export type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  cover_url: string | null;
  level: string;
  category: string;
  duration_minutes: number;
  is_premium: boolean;
  is_published: boolean;
  order_index: number;
};

export type Lesson = {
  id: string;
  course_id: string;
  slug: string;
  title: string;
  content: string;
  video_url: string | null;
  duration_minutes: number;
  is_free_preview: boolean;
  order_index: number;
};

export async function listPublishedCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("is_published", true)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function getCourseWithLessons(slug: string) {
  const { data: course, error: cErr } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!course) return null;
  const { data: lessons, error: lErr } = await supabase
    .from("academy_lessons")
    .select("*")
    .eq("course_id", course.id)
    .order("order_index", { ascending: true });
  if (lErr) throw lErr;
  return { course: course as Course, lessons: (lessons ?? []) as Lesson[] };
}

export const enrollInCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ course_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("academy_enrollments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", data.course_id)
      .maybeSingle();
    if (existing) return { enrollment: existing };
    const { data: inserted, error } = await supabase
      .from("academy_enrollments")
      .insert({ user_id: userId, course_id: data.course_id })
      .select()
      .single();
    if (error) throw error;
    return { enrollment: inserted };
  });

export const markLessonComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        enrollment_id: z.string().uuid(),
        lesson_id: z.string().uuid(),
        course_id: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("academy_lesson_progress")
      .insert({
        user_id: userId,
        enrollment_id: data.enrollment_id,
        lesson_id: data.lesson_id,
      });

    const [{ count: totalLessons }, { count: completedCount }] = await Promise.all([
      supabase
        .from("academy_lessons")
        .select("*", { count: "exact", head: true })
        .eq("course_id", data.course_id),
      supabase
        .from("academy_lesson_progress")
        .select("*", { count: "exact", head: true })
        .eq("enrollment_id", data.enrollment_id),
    ]);

    if (totalLessons && completedCount && completedCount >= totalLessons) {
      const code = `XA-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now()
        .toString(36)
        .toUpperCase()}`;
      await supabase
        .from("academy_enrollments")
        .update({ completed_at: new Date().toISOString(), certificate_code: code })
        .eq("id", data.enrollment_id)
        .is("completed_at", null);
    }
    return { ok: true };
  });

export const getMyEnrollment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ course_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: enrollment } = await supabase
      .from("academy_enrollments")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", data.course_id)
      .maybeSingle();
    if (!enrollment) return { enrollment: null, completedLessonIds: [] as string[] };
    const { data: progress } = await supabase
      .from("academy_lesson_progress")
      .select("lesson_id")
      .eq("enrollment_id", enrollment.id);
    return {
      enrollment,
      completedLessonIds: (progress ?? []).map((p) => p.lesson_id),
    };
  });
