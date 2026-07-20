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

// Anon-safe list of published courses
export async function listPublishedCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from("academy_courses" as never)
    .select("*")
    .eq("is_published", true)
    .order("order_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Course[];
}

export async function getCourseWithLessons(slug: string): Promise<{
  course: Course;
  lessons: Lesson[];
} | null> {
  const { data: course, error: cErr } = await supabase
    .from("academy_courses" as never)
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!course) return null;
  const c = course as unknown as Course;
  const { data: lessons, error: lErr } = await supabase
    .from("academy_lessons" as never)
    .select("*")
    .eq("course_id", c.id)
    .order("order_index", { ascending: true });
  if (lErr) throw lErr;
  return { course: c, lessons: (lessons ?? []) as unknown as Lesson[] };
}

export const enrollInCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ course_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("academy_enrollments" as never)
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", data.course_id)
      .maybeSingle();
    if (existing) return existing as unknown;
    const { data: inserted, error } = await supabase
      .from("academy_enrollments" as never)
      .insert({ user_id: userId, course_id: data.course_id })
      .select()
      .single();
    if (error) throw error;
    return inserted as unknown;
  });

export const markLessonComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ enrollment_id: z.string().uuid(), lesson_id: z.string().uuid(), course_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("academy_lesson_progress" as never)
      .insert({ user_id: userId, enrollment_id: data.enrollment_id, lesson_id: data.lesson_id })
      .select();

    // Check if all lessons complete → issue certificate
    const [{ count: totalLessons }, { count: completedCount }] = await Promise.all([
      supabase.from("academy_lessons" as never).select("*", { count: "exact", head: true }).eq("course_id", data.course_id),
      supabase
        .from("academy_lesson_progress" as never)
        .select("*", { count: "exact", head: true })
        .eq("enrollment_id", data.enrollment_id),
    ]);

    if (totalLessons && completedCount && completedCount >= totalLessons) {
      const code = `XA-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      await supabase
        .from("academy_enrollments" as never)
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
      .from("academy_enrollments" as never)
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", data.course_id)
      .maybeSingle();
    if (!enrollment) return { enrollment: null, completedLessonIds: [] as string[] };
    const e = enrollment as { id: string };
    const { data: progress } = await supabase
      .from("academy_lesson_progress" as never)
      .select("lesson_id")
      .eq("enrollment_id", e.id);
    return {
      enrollment,
      completedLessonIds: (progress ?? []).map((p: { lesson_id: string }) => p.lesson_id),
    };
  });

export const listMyEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("academy_enrollments" as never)
      .select("*, academy_courses(*)")
      .eq("user_id", userId)
      .order("enrolled_at", { ascending: false });
    return data ?? [];
  });
