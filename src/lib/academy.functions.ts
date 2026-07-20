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
  prerequisite_lesson_id: string | null;
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

/** Anon-safe: verify a certificate by code. */
export async function verifyCertificate(code: string) {
  const clean = code.trim();
  if (!clean) return null;
  const { data: enrollment, error } = await supabase
    .from("academy_enrollments")
    .select("id, user_id, course_id, enrolled_at, completed_at, certificate_code")
    .eq("certificate_code", clean)
    .maybeSingle();
  if (error) throw error;
  if (!enrollment || !enrollment.completed_at) return null;
  const { data: course } = await supabase
    .from("academy_courses")
    .select("title, slug, category, level, duration_minutes")
    .eq("id", enrollment.course_id)
    .maybeSingle();
  return {
    code: enrollment.certificate_code,
    completed_at: enrollment.completed_at,
    enrolled_at: enrollment.enrolled_at,
    course,
  };
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

export type MyEnrollmentSummary = {
  enrollment_id: string;
  enrolled_at: string;
  completed_at: string | null;
  certificate_code: string | null;
  course: Course;
  total_lessons: number;
  completed_lessons: number;
  next_lesson: { slug: string; title: string } | null;
};

export const listMyEnrollments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyEnrollmentSummary[]> => {
    const { supabase, userId } = context;
    const { data: enrollments } = await supabase
      .from("academy_enrollments")
      .select("id, enrolled_at, completed_at, certificate_code, course_id")
      .eq("user_id", userId)
      .order("enrolled_at", { ascending: false });
    if (!enrollments || enrollments.length === 0) return [];
    const courseIds = enrollments.map((e) => e.course_id);
    const [{ data: courses }, { data: lessons }, { data: progress }] = await Promise.all([
      supabase.from("academy_courses").select("*").in("id", courseIds),
      supabase.from("academy_lessons").select("id, course_id, slug, title, order_index").in("course_id", courseIds).order("order_index", { ascending: true }),
      supabase.from("academy_lesson_progress").select("lesson_id, enrollment_id").in("enrollment_id", enrollments.map((e) => e.id)),
    ]);
    const courseMap = new Map((courses ?? []).map((c) => [c.id, c as Course]));
    const lessonsByCourse = new Map<string, { id: string; slug: string; title: string }[]>();
    for (const l of lessons ?? []) {
      const arr = lessonsByCourse.get(l.course_id) ?? [];
      arr.push({ id: l.id, slug: l.slug, title: l.title });
      lessonsByCourse.set(l.course_id, arr);
    }
    const doneByEnrollment = new Map<string, Set<string>>();
    for (const p of progress ?? []) {
      const set = doneByEnrollment.get(p.enrollment_id) ?? new Set<string>();
      set.add(p.lesson_id);
      doneByEnrollment.set(p.enrollment_id, set);
    }
    return enrollments
      .map((e): MyEnrollmentSummary | null => {
        const course = courseMap.get(e.course_id);
        if (!course) return null;
        const allLessons = lessonsByCourse.get(e.course_id) ?? [];
        const done = doneByEnrollment.get(e.id) ?? new Set<string>();
        const nextL = allLessons.find((l) => !done.has(l.id));
        return {
          enrollment_id: e.id,
          enrolled_at: e.enrolled_at,
          completed_at: e.completed_at,
          certificate_code: e.certificate_code,
          course,
          total_lessons: allLessons.length,
          completed_lessons: [...done].filter((id) => allLessons.some((l) => l.id === id)).length,
          next_lesson: nextL ? { slug: nextL.slug, title: nextL.title } : null,
        };
      })
      .filter((x): x is MyEnrollmentSummary => x !== null);
  });

// -------------------- Admin authoring --------------------

const courseInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  summary: z.string().default(""),
  description: z.string().default(""),
  cover_url: z.string().url().nullable().optional(),
  level: z.string().default("beginner"),
  category: z.string().default("general"),
  duration_minutes: z.number().int().nonnegative().default(0),
  is_premium: z.boolean().default(false),
  is_published: z.boolean().default(false),
  order_index: z.number().int().default(0),
});

const lessonInput = z.object({
  id: z.string().uuid().optional(),
  course_id: z.string().uuid(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  content: z.string().default(""),
  video_url: z.string().url().nullable().optional(),
  duration_minutes: z.number().int().nonnegative().default(0),
  is_free_preview: z.boolean().default(false),
  order_index: z.number().int().default(0),
  prerequisite_lesson_id: z.string().uuid().nullable().optional(),
});

async function requireAdmin(ctx: { supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _role: "admin" });
  if (error || data !== true) throw new Error("Forbidden");
}

export const adminListCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("academy_courses")
      .select("*")
      .order("order_index", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Course[];
  });

export const adminGetCourse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const [{ data: course }, { data: lessons }] = await Promise.all([
      context.supabase.from("academy_courses").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("academy_lessons").select("*").eq("course_id", data.id).order("order_index", { ascending: true }),
    ]);
    return { course: course as Course | null, lessons: (lessons ?? []) as Lesson[] };
  });

export const adminUpsertCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => courseInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: row, error } = await context.supabase
      .from("academy_courses")
      .upsert(data as never)
      .select()
      .single();
    if (error) throw error;
    return row as Course;
  });

export const adminDeleteCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    await context.supabase.from("academy_lessons").delete().eq("course_id", data.id);
    const { error } = await context.supabase.from("academy_courses").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminUpsertLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => lessonInput.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: row, error } = await context.supabase
      .from("academy_lessons")
      .upsert(data as never)
      .select()
      .single();
    if (error) throw error;
    return row as Lesson;
  });

export const adminDeleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("academy_lessons").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminReorderLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ ordered: z.array(z.object({ id: z.string().uuid(), order_index: z.number().int() })) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    for (const item of data.ordered) {
      await context.supabase.from("academy_lessons").update({ order_index: item.order_index }).eq("id", item.id);
    }
    return { ok: true };
  });
