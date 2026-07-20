import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, BookOpen, ArrowRight, Sparkles, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listMyEnrollments, listPublishedCourses } from "@/lib/academy.functions";

export const Route = createFileRoute("/_authenticated/app/my-academy")({
  component: MyAcademyPage,
});

function MyAcademyPage() {
  const { data: enrollments, isLoading } = useQuery({
    queryKey: ["academy", "my-enrollments"],
    queryFn: () => listMyEnrollments(),
  });
  const { data: allCourses } = useQuery({
    queryKey: ["academy", "courses"],
    queryFn: () => listPublishedCourses(),
  });

  const inProgress = (enrollments ?? []).filter((e) => !e.completed_at);
  const completed = (enrollments ?? []).filter((e) => !!e.completed_at);
  const enrolledIds = new Set((enrollments ?? []).map((e) => e.course.id));
  const recommendations = (allCourses ?? []).filter((c) => !enrolledIds.has(c.id)).slice(0, 3);

  const recommendedNext = inProgress[0];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="size-7 text-primary" /> My Academy
          </h1>
          <p className="text-muted-foreground mt-1">Track your enrolled courses and pick up where you left off.</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/academy">Browse all courses</Link>
        </Button>
      </div>

      {recommendedNext && recommendedNext.next_lesson && (
        <Card className="p-6 border-primary/30 bg-primary/5">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="size-12 rounded-full bg-primary/15 grid place-items-center shrink-0">
              <Sparkles className="size-6 text-primary" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="text-xs uppercase tracking-wide text-primary font-semibold">Continue learning</div>
              <div className="mt-1 font-semibold">{recommendedNext.course.title}</div>
              <div className="text-sm text-muted-foreground">Next up: {recommendedNext.next_lesson.title}</div>
            </div>
            <Button asChild>
              <Link
                to="/academy/$slug/lesson/$lessonSlug"
                params={{ slug: recommendedNext.course.slug, lessonSlug: recommendedNext.next_lesson.slug }}
              >
                Resume <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">In progress</h2>
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : inProgress.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <BookOpen className="size-8 mx-auto mb-2 opacity-60" />
            You're not enrolled in any courses yet. <Link to="/academy" className="text-primary underline">Browse the catalog</Link>.
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {inProgress.map((e) => {
              const pct = e.total_lessons ? Math.round((e.completed_lessons / e.total_lessons) * 100) : 0;
              return (
                <Card key={e.enrollment_id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge variant="secondary" className="capitalize mb-2">{e.course.category}</Badge>
                      <div className="font-semibold truncate">{e.course.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                        <Clock className="size-3" /> {e.course.duration_minutes} min · {e.total_lessons} lessons
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold">{pct}%</div>
                      <div className="text-xs text-muted-foreground">{e.completed_lessons} / {e.total_lessons}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground truncate">
                      {e.next_lesson ? <>Next: <span className="text-foreground">{e.next_lesson.title}</span></> : "All done"}
                    </div>
                    <Button size="sm" asChild>
                      {e.next_lesson ? (
                        <Link
                          to="/academy/$slug/lesson/$lessonSlug"
                          params={{ slug: e.course.slug, lessonSlug: e.next_lesson.slug }}
                        >
                          Continue
                        </Link>
                      ) : (
                        <Link to="/academy/$slug" params={{ slug: e.course.slug }}>Open</Link>
                      )}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Completed</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {completed.map((e) => (
              <Card key={e.enrollment_id} className="p-5">
                <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="size-4" /> Completed
                </div>
                <div className="mt-2 font-semibold">{e.course.title}</div>
                {e.certificate_code && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Certificate: <code className="font-mono">{e.certificate_code}</code>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/academy/$slug" params={{ slug: e.course.slug }}>Review</Link>
                  </Button>
                  {e.certificate_code && (
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/academy/verify">Verify</Link>
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {recommendations.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Recommended for you</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {recommendations.map((c) => (
              <Link key={c.id} to="/academy/$slug" params={{ slug: c.slug }}>
                <Card className="p-5 h-full hover:border-primary/50 transition-colors">
                  <Badge variant="secondary" className="capitalize mb-2">{c.category}</Badge>
                  <div className="font-semibold">{c.title}</div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
