import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, Lock, PlayCircle, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCourseWithLessons, enrollInCourse, getMyEnrollment } from "@/lib/academy.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/academy/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} — Xellvio Academy` },
    ],
  }),
  component: CoursePage,
});

function CoursePage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUserId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["academy", "course", slug],
    queryFn: () => getCourseWithLessons(slug),
  });

  const { data: enrollmentData } = useQuery({
    queryKey: ["academy", "enrollment", data?.course.id, userId],
    queryFn: () => (data ? getMyEnrollment({ data: { course_id: data.course.id } }) : null),
    enabled: !!data && !!userId,
  });

  const enrollMutation = useMutation({
    mutationFn: () => enrollInCourse({ data: { course_id: data!.course.id } }),
    onSuccess: () => {
      toast.success("Enrolled!");
      qc.invalidateQueries({ queryKey: ["academy", "enrollment"] });
      if (data?.lessons[0]) {
        navigate({
          to: "/academy/$slug/lesson/$lessonSlug",
          params: { slug: data.course.slug, lessonSlug: data.lessons[0].slug },
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="mx-auto max-w-4xl px-4 py-16 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="mx-auto max-w-4xl px-4 py-16">Course not found.</div>;

  const { course, lessons } = data;
  const enrolled = !!enrollmentData?.enrollment;
  const completedIds = new Set(enrollmentData?.completedLessonIds ?? []);
  const progress = lessons.length > 0 ? Math.round((completedIds.size / lessons.length) * 100) : 0;
  const certCode = (enrollmentData?.enrollment as { certificate_code?: string } | null)?.certificate_code;

  const handleEnroll = () => {
    if (!userId) {
      navigate({ to: "/auth", search: { redirect: `/academy/${slug}` } as never });
      return;
    }
    enrollMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10 md:py-14">
      <Link to="/academy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> All courses
      </Link>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge variant="secondary">{course.category}</Badge>
        <Badge variant="outline" className="capitalize">{course.level}</Badge>
        {course.is_premium && (
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Premium</Badge>
        )}
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="size-3.5" /> {course.duration_minutes} min · {lessons.length} lessons
        </span>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{course.title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{course.description}</p>

      {enrolled ? (
        <Card className="mt-6 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Your progress</div>
              <div className="text-2xl font-bold mt-1">{progress}%</div>
            </div>
            {certCode ? (
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <GraduationCap className="size-4" /> Completed
                </div>
                <div className="text-xs text-muted-foreground mt-1">Cert: <code>{certCode}</code></div>
              </div>
            ) : (
              <Button
                onClick={() => {
                  const next = lessons.find((l) => !completedIds.has(l.id)) ?? lessons[0];
                  if (next) navigate({ to: "/academy/$slug/lesson/$lessonSlug", params: { slug: course.slug, lessonSlug: next.slug } });
                }}
              >
                Continue learning
              </Button>
            )}
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>
      ) : (
        <div className="mt-6">
          <Button size="lg" onClick={handleEnroll} disabled={enrollMutation.isPending}>
            {enrollMutation.isPending ? "Enrolling…" : "Enroll — Free"}
          </Button>
        </div>
      )}

      <h2 className="mt-10 text-xl font-semibold">Curriculum</h2>
      <div className="mt-4 space-y-2">
        {lessons.map((lesson, i) => {
          const done = completedIds.has(lesson.id);
          const canOpen = enrolled || lesson.is_free_preview;
          const inner = (
            <Card className={`p-4 flex items-center gap-4 transition-colors ${canOpen ? "hover:border-primary/50" : "opacity-70"}`}>
              <div className="size-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
                {done ? <CheckCircle2 className="size-5 text-emerald-500" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{lesson.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-2">
                  <Clock className="size-3" /> {lesson.duration_minutes} min
                  {lesson.is_free_preview && !enrolled && (
                    <Badge variant="outline" className="ml-1 h-5">Free preview</Badge>
                  )}
                </div>
              </div>
              {canOpen ? <PlayCircle className="size-5 text-primary shrink-0" /> : <Lock className="size-4 text-muted-foreground shrink-0" />}
            </Card>
          );
          return canOpen ? (
            <Link
              key={lesson.id}
              to="/academy/$slug/lesson/$lessonSlug"
              params={{ slug: course.slug, lessonSlug: lesson.slug }}
              className="block"
            >
              {inner}
            </Link>
          ) : (
            <div key={lesson.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
