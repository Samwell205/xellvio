import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Eye } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  adminGetCourse, adminUpsertLesson, adminDeleteLesson, adminReorderLessons,
  type Lesson,
} from "@/lib/academy.functions";
import { CourseDialog } from "./_authenticated.admin.academy.index";

export const Route = createFileRoute("/_authenticated/admin/academy/$courseId")({
  component: AdminCourseEdit,
});

function AdminCourseEdit() {
  const { courseId } = Route.useParams();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "academy", "course", courseId],
    queryFn: () => adminGetCourse({ data: { id: courseId } }),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDeleteLesson({ data: { id } }),
    onSuccess: () => {
      toast.success("Lesson deleted");
      qc.invalidateQueries({ queryKey: ["admin", "academy", "course", courseId] });
    },
  });

  const reorder = useMutation({
    mutationFn: (ordered: { id: string; order_index: number }[]) => adminReorderLessons({ data: { ordered } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "academy", "course", courseId] }),
  });

  if (!data?.course) return <div className="text-muted-foreground">Loading…</div>;
  const course = data.course;
  const lessons = data.lessons;

  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= lessons.length) return;
    const a = lessons[idx];
    const b = lessons[next];
    reorder.mutate([
      { id: a.id, order_index: b.order_index },
      { id: b.id, order_index: a.order_index },
    ]);
  };

  return (
    <div className="space-y-6">
      <Link to="/admin/academy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All courses
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="secondary" className="capitalize">{course.category}</Badge>
            <Badge variant="outline" className="capitalize">{course.level}</Badge>
            <Badge variant={course.is_published ? "default" : "outline"}>
              {course.is_published ? "Published" : "Draft"}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">/{course.slug}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/academy/$slug" params={{ slug: course.slug }} target="_blank">
              <Eye className="size-4 mr-1" /> Preview
            </Link>
          </Button>
          <CourseDialog trigger={<Button variant="outline"><Pencil className="size-4 mr-1" /> Edit course</Button>} course={course} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Lessons ({lessons.length})</h2>
        <LessonDialog
          courseId={course.id}
          allLessons={lessons}
          trigger={<Button><Plus className="size-4 mr-1" /> New lesson</Button>}
          defaultOrder={lessons.length}
        />
      </div>

      {lessons.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No lessons yet.</Card>
      ) : (
        <div className="grid gap-2">
          {lessons.map((l, i) => (
            <Card key={l.id} className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex flex-col">
                <Button variant="ghost" size="icon" className="size-6" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => move(i, 1)} disabled={i === lessons.length - 1}>
                  <ChevronDown className="size-3.5" />
                </Button>
              </div>
              <div className="size-8 rounded-full bg-muted grid place-items-center text-xs font-medium shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {l.title}
                  {l.is_free_preview && <Badge variant="outline" className="h-5">Free preview</Badge>}
                  {l.prerequisite_lesson_id && (
                    <Badge variant="secondary" className="h-5 text-xs">
                      Requires: {lessons.find((x) => x.id === l.prerequisite_lesson_id)?.title ?? "?"}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  /{l.slug} · {l.duration_minutes} min
                </div>
              </div>
              <div className="flex gap-1">
                <LessonDialog
                  courseId={course.id}
                  allLessons={lessons}
                  lesson={l}
                  trigger={<Button variant="outline" size="sm"><Pencil className="size-4" /></Button>}
                  defaultOrder={l.order_index}
                />
                <Button variant="ghost" size="sm" onClick={() => confirm(`Delete "${l.title}"?`) && del.mutate(l.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LessonDialog({
  courseId, allLessons, lesson, trigger, defaultOrder,
}: {
  courseId: string;
  allLessons: Lesson[];
  lesson?: Lesson;
  trigger: React.ReactNode;
  defaultOrder: number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    id: lesson?.id,
    course_id: courseId,
    slug: lesson?.slug ?? "",
    title: lesson?.title ?? "",
    content: lesson?.content ?? "",
    video_url: lesson?.video_url ?? "",
    duration_minutes: lesson?.duration_minutes ?? 5,
    is_free_preview: lesson?.is_free_preview ?? false,
    order_index: lesson?.order_index ?? defaultOrder,
    prerequisite_lesson_id: lesson?.prerequisite_lesson_id ?? "",
  }));

  const save = useMutation({
    mutationFn: () =>
      adminUpsertLesson({
        data: {
          ...form,
          video_url: form.video_url ? form.video_url : null,
          prerequisite_lesson_id: form.prerequisite_lesson_id ? form.prerequisite_lesson_id : null,
          duration_minutes: Number(form.duration_minutes) || 0,
          order_index: Number(form.order_index) || 0,
        },
      }),
    onSuccess: () => {
      toast.success(lesson ? "Lesson updated" : "Lesson created");
      qc.invalidateQueries({ queryKey: ["admin", "academy", "course", courseId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit lesson" : "New lesson"}</DialogTitle>
          <DialogDescription>Write markdown content, optionally attach a video and set a prerequisite.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
            </div>
          </div>
          <div>
            <Label>Content (markdown)</Label>
            <Textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Video URL (optional)</Label>
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Order</Label>
              <Input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Prerequisite lesson</Label>
              <Select
                value={form.prerequisite_lesson_id || "none"}
                onValueChange={(v) => setForm({ ...form, prerequisite_lesson_id: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {allLessons.filter((l) => l.id !== lesson?.id).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.is_free_preview} onCheckedChange={(v) => setForm({ ...form, is_free_preview: v })} />
            Free preview (viewable without enrolling)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title || !form.slug}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
