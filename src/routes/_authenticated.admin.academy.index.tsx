import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, GraduationCap, Eye, EyeOff } from "lucide-react";
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
import { adminListCourses, adminUpsertCourse, adminDeleteCourse, type Course } from "@/lib/academy.functions";

export const Route = createFileRoute("/_authenticated/admin/academy/")({
  component: AdminAcademyList,
});

function AdminAcademyList() {
  const qc = useQueryClient();
  const { data: courses, isLoading } = useQuery({
    queryKey: ["admin", "academy", "courses"],
    queryFn: () => adminListCourses(),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDeleteCourse({ data: { id } }),
    onSuccess: () => {
      toast.success("Course deleted");
      qc.invalidateQueries({ queryKey: ["admin", "academy", "courses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="size-6 text-primary" /> Academy authoring
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Create, publish and manage Xellvio Academy courses.</p>
        </div>
        <CourseDialog
          trigger={<Button><Plus className="size-4 mr-1" /> New course</Button>}
        />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (courses ?? []).length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">No courses yet. Create one to get started.</Card>
      ) : (
        <div className="grid gap-3">
          {(courses ?? []).map((c) => (
            <Card key={c.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{c.title}</span>
                  <Badge variant="secondary" className="capitalize">{c.category}</Badge>
                  <Badge variant="outline" className="capitalize">{c.level}</Badge>
                  {c.is_premium && <Badge className="bg-amber-500 text-white border-0">Premium</Badge>}
                  <Badge variant={c.is_published ? "default" : "outline"} className="gap-1">
                    {c.is_published ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                    {c.is_published ? "Published" : "Draft"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  /{c.slug} · order {c.order_index} · {c.duration_minutes} min
                </div>
                {c.summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin/academy/$courseId" params={{ courseId: c.id }}>
                    <Pencil className="size-4 mr-1" /> Edit
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete "${c.title}" and all its lessons?`)) del.mutate(c.id);
                  }}
                >
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

export function CourseDialog({ trigger, course }: { trigger: React.ReactNode; course?: Course }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    id: course?.id,
    slug: course?.slug ?? "",
    title: course?.title ?? "",
    summary: course?.summary ?? "",
    description: course?.description ?? "",
    cover_url: course?.cover_url ?? "",
    level: course?.level ?? "beginner",
    category: course?.category ?? "general",
    duration_minutes: course?.duration_minutes ?? 0,
    is_premium: course?.is_premium ?? false,
    is_published: course?.is_published ?? false,
    order_index: course?.order_index ?? 0,
  }));

  const save = useMutation({
    mutationFn: () =>
      adminUpsertCourse({
        data: {
          ...form,
          cover_url: form.cover_url ? form.cover_url : null,
          duration_minutes: Number(form.duration_minutes) || 0,
          order_index: Number(form.order_index) || 0,
        },
      }),
    onSuccess: () => {
      toast.success(course ? "Course updated" : "Course created");
      qc.invalidateQueries({ queryKey: ["admin", "academy"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "New course"}</DialogTitle>
          <DialogDescription>Set course details, cover image and publish state.</DialogDescription>
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
            <Label>Summary</Label>
            <Textarea rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </div>
          <div>
            <Label>Description (markdown)</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label>Level</Label>
              <Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="beginner / intermediate / advanced" />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Order</Label>
              <Input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Cover image</Label>
            <CoverUploader value={form.cover_url} onChange={(url) => setForm({ ...form, cover_url: url })} />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_premium} onCheckedChange={(v) => setForm({ ...form, is_premium: v })} />
              Premium
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
              Published
            </label>
          </div>
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

function CoverUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…  or upload below"
      />
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const { supabase } = await import("@/integrations/supabase/client");
              const path = `covers/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
              const up = await supabase.storage.from("academy-covers").upload(path, file, { upsert: true });
              if (up.error) throw up.error;
              const signed = await supabase.storage.from("academy-covers").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
              if (signed.error) throw signed.error;
              onChange(signed.data.signedUrl);
              toast.success("Cover uploaded");
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
        {busy && <span className="text-xs text-muted-foreground">Uploading…</span>}
      </div>
      {value && (
        <img src={value} alt="Cover preview" className="mt-1 rounded-md border max-h-40 object-cover" />
      )}
    </div>
  );
}
