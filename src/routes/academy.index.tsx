import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Clock, Sparkles, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listPublishedCourses, type Course } from "@/lib/academy.functions";

export const Route = createFileRoute("/academy/")({
  head: () => ({
    meta: [
      { title: "Xellvio Academy — Learn SMS Marketing, Deliverability & the API" },
      {
        name: "description",
        content:
          "Free & premium courses on SMS fundamentals, sender ID registration, US toll-free verification, compliance, high-converting campaigns, and the Xellvio API.",
      },
      { property: "og:title", content: "Xellvio Academy" },
      { property: "og:description", content: "Master SMS marketing with hands-on courses from the Xellvio team." },
    ],
  }),
  component: AcademyIndex,
});

function AcademyIndex() {
  const { data: courses, isLoading } = useQuery({
    queryKey: ["academy", "courses"],
    queryFn: () => listPublishedCourses(),
  });

  return (
    <>
      <section className="border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-4 gap-1.5">
              <Sparkles className="size-3.5" /> New
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Xellvio Academy
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything we've learned from sending billions of SMS — distilled into short,
              practical courses. Written by the Xellvio team. Free to enroll.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="size-4" /> {courses?.length ?? 0} courses
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="size-4" /> Certificates on completion
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12 md:py-16">
        {isLoading ? (
          <div className="text-muted-foreground">Loading courses…</div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(courses ?? []).map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <Link to="/academy/$slug" params={{ slug: course.slug }} className="group">
      <Card className="h-full p-6 transition-all hover:border-primary/50 hover:shadow-md">
        <div className="flex items-start justify-between mb-3">
          <Badge variant="secondary" className="capitalize">{course.category}</Badge>
          {course.is_premium && (
            <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Premium</Badge>
          )}
        </div>
        <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
          {course.title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
          {course.summary}
        </p>
        <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="capitalize">{course.level}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {course.duration_minutes} min
          </span>
        </div>
      </Card>
    </Link>
  );
}
