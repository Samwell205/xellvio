import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Clock, Sparkles, BookOpen, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");

  const categories = useMemo(() => {
    const s = new Set<string>();
    (courses ?? []).forEach((c) => c.category && s.add(c.category));
    return ["all", ...Array.from(s).sort()];
  }, [courses]);

  const levels = useMemo(() => {
    const s = new Set<string>();
    (courses ?? []).forEach((c) => c.level && s.add(c.level));
    return ["all", ...Array.from(s).sort()];
  }, [courses]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (courses ?? []).filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (level !== "all" && c.level !== level) return false;
      if (!term) return true;
      return (
        c.title.toLowerCase().includes(term) ||
        c.summary?.toLowerCase().includes(term) ||
        c.category?.toLowerCase().includes(term)
      );
    });
  }, [courses, q, category, level]);

  return (
    <>
      <section className="border-b bg-gradient-to-b from-primary/5 to-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-4 gap-1.5">
              <Sparkles className="size-3.5" /> New
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Xellvio Academy</h1>
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
              <Link to="/academy/verify" className="inline-flex items-center gap-1.5 hover:text-foreground">
                <ShieldCheck className="size-4" /> Verify a certificate
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 md:py-10">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-6">
          <div className="relative md:max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search courses…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={category === c ? "default" : "outline"}
                onClick={() => setCategory(c)}
                className="capitalize"
              >
                {c === "all" ? "All categories" : c}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          {levels.map((l) => (
            <Button
              key={l}
              size="sm"
              variant={level === l ? "secondary" : "ghost"}
              onClick={() => setLevel(l)}
              className="capitalize h-7 text-xs"
            >
              {l === "all" ? "All levels" : l}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading courses…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No courses match your search.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
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
      <Card className="h-full overflow-hidden transition-all hover:border-primary/50 hover:shadow-md">
        {course.cover_url && (
          <div className="aspect-video bg-muted overflow-hidden">
            <img src={course.cover_url} alt={course.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <Badge variant="secondary" className="capitalize">{course.category}</Badge>
            {course.is_premium && (
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">Premium</Badge>
            )}
          </div>
          <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">{course.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{course.summary}</p>
          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="capitalize">{course.level}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> {course.duration_minutes} min
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
