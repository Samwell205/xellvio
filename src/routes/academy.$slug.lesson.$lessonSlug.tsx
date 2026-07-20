import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, CheckCircle2, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  getCourseWithLessons,
  getMyEnrollment,
  enrollInCourse,
  markLessonComplete,
} from "@/lib/academy.functions";

export const Route = createFileRoute("/academy/$slug/lesson/$lessonSlug")({
  component: LessonPage,
});

function LessonPage() {
  const { slug, lessonSlug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data } = useQuery({
    queryKey: ["academy", "course", slug],
    queryFn: () => getCourseWithLessons(slug),
  });

  const { data: enrollmentData } = useQuery({
    queryKey: ["academy", "enrollment", data?.course.id, userId],
    queryFn: () => (data ? getMyEnrollment({ data: { course_id: data.course.id } }) : null),
    enabled: !!data && !!userId,
  });

  const enrollMut = useMutation({
    mutationFn: () => enrollInCourse({ data: { course_id: data!.course.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy", "enrollment"] }),
  });

  const completeMut = useMutation({
    mutationFn: (lessonId: string) =>
      markLessonComplete({
        data: {
          enrollment_id: (enrollmentData!.enrollment as { id: string } | null)!.id,
          lesson_id: lessonId,
          course_id: data!.course.id,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy", "enrollment"] });
      toast.success("Lesson complete");
    },
  });

  if (!data) return <div className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">Loading…</div>;

  const lessonIdx = data.lessons.findIndex((l) => l.slug === lessonSlug);
  const lesson = data.lessons[lessonIdx];
  if (!lesson) return <div className="mx-auto max-w-3xl px-4 py-16">Lesson not found.</div>;

  const enrolled = !!enrollmentData?.enrollment;
  const completedIds = new Set(enrollmentData?.completedLessonIds ?? []);
  const isComplete = completedIds.has(lesson.id);
  const canAccess = enrolled || lesson.is_free_preview;
  const prev = data.lessons[lessonIdx - 1];
  const next = data.lessons[lessonIdx + 1];
  const prereq = lesson.prerequisite_lesson_id
    ? data.lessons.find((l) => l.id === lesson.prerequisite_lesson_id)
    : null;
  const prereqBlocked = enrolled && prereq && !completedIds.has(prereq.id);

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold">Enroll to unlock this lesson</h2>
          <p className="mt-2 text-muted-foreground">Enrollment is free and takes a moment.</p>
          <Button
            className="mt-4"
            onClick={() => {
              if (!userId) navigate({ to: "/auth", search: { redirect: `/academy/${slug}` } as never });
              else enrollMut.mutate();
            }}
          >
            Enroll now
          </Button>
        </Card>
      </div>
    );
  }

  if (prereqBlocked && prereq) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-semibold">Complete the previous lesson first</h2>
          <p className="mt-2 text-muted-foreground">
            You need to finish <span className="font-medium text-foreground">{prereq.title}</span> before starting this one.
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              navigate({ to: "/academy/$slug/lesson/$lessonSlug", params: { slug, lessonSlug: prereq.slug } })
            }
          >
            Go to {prereq.title}
          </Button>
        </Card>
      </div>
    );
  }

  const handleComplete = () => {
    if (!enrolled) {
      if (!userId) {
        navigate({ to: "/auth", search: { redirect: `/academy/${slug}/lesson/${lessonSlug}` } as never });
        return;
      }
      enrollMut.mutate(undefined, {
        onSuccess: () =>
          setTimeout(() => {
            const refetched = qc.getQueryData<{ enrollment: { id: string } | null }>([
              "academy",
              "enrollment",
              data.course.id,
              userId,
            ]);
            if (refetched?.enrollment) completeMut.mutate(lesson.id);
          }, 300),
      });
      return;
    }
    if (!isComplete) completeMut.mutate(lesson.id);
    if (next) navigate({ to: "/academy/$slug/lesson/$lessonSlug", params: { slug, lessonSlug: next.slug } });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <Link to="/academy/$slug" params={{ slug }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> {data.course.title}
      </Link>
      <div className="text-xs text-muted-foreground mb-2">
        Lesson {lessonIdx + 1} of {data.lessons.length}
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{lesson.title}</h1>

      <article className="legal-prose mt-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.content}</ReactMarkdown>
      </article>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 pt-6 border-t">
        <div>
          {prev && (
            <Button variant="outline" asChild>
              <Link to="/academy/$slug/lesson/$lessonSlug" params={{ slug, lessonSlug: prev.slug }}>
                <ArrowLeft className="size-4 mr-1" /> Previous
              </Link>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isComplete && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" /> Completed
            </span>
          )}
          <Button onClick={handleComplete} disabled={completeMut.isPending || enrollMut.isPending}>
            {next ? (isComplete ? "Next lesson" : "Mark complete & continue") : isComplete ? "Course complete" : "Finish course"}
            {next ? <ArrowRight className="size-4 ml-1" /> : <GraduationCap className="size-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
