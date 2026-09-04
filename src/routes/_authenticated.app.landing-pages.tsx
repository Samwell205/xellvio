import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteLandingPage, listLandingPages, saveLandingPage } from "@/lib/growth.functions";
import { listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TemplateGallery } from "@/components/growth/TemplateGallery";
import { PAGE_TEMPLATES } from "@/lib/growth-templates";
import { Copy, ExternalLink, LayoutGrid, LayoutTemplate, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/landing-pages")({
  head: () => ({
    meta: [
      { title: "Landing pages — Xellvio" },
      { name: "description", content: "Build hosted landing pages that collect phone numbers straight into your SMS lists." },
      { property: "og:title", content: "Landing pages — Xellvio" },
      { property: "og:description", content: "Build hosted landing pages that collect phone numbers straight into your SMS lists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPagesPage,
});

type Draft = {
  id?: string;
  name: string;
  headline: string;
  subheadline: string;
  body: string;
  cta_label: string;
  success_message: string;
  theme: "light" | "dark";
  accent: string;
  image_url: string;
  list_id: string | null;
  published: boolean;
};

const EMPTY: Draft = {
  name: "",
  headline: "Get 15% off your first order",
  subheadline: "Join our text list for early access to drops and deals.",
  body: "",
  cta_label: "Sign up",
  success_message: "Thanks — watch your phone for your code!",
  theme: "light",
  accent: "#111827",
  image_url: "",
  list_id: null,
  published: true,
};

function LandingPagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLandingPages);
  const saveFn = useServerFn(saveLandingPage);
  const delFn = useServerFn(deleteLandingPage);
  const listsFn = useServerFn(listAudienceContactLists);

  const pagesQ = useQuery({ queryKey: ["landing-pages"], queryFn: () => listFn() });
  const listsQ = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [gallery, setGallery] = useState(false);

  const applyTemplate = (id: string) => {
    const t = PAGE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setGallery(false);
    setDraft({ ...EMPTY, ...t.values, name: t.label });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => saveFn({ data: { ...d, image_url: d.image_url || null } }),
    onSuccess: () => {
      toast.success("Landing page saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete"),
  });

  const pages = pagesQ.data ?? [];
  const urlFor = (slug: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/p/${slug}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Landing pages</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A shareable page with your offer and a phone-number box. Everyone who signs up lands in the list you choose.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>Create blank page</Button>
          <Button onClick={() => setGallery(true)}><LayoutGrid className="mr-2 size-4" />Browse templates</Button>
        </div>
      </div>

      {pages.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-14 text-center">
          <LayoutTemplate className="size-10 text-primary" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Grow your list without a website</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Publish a page in a minute, share the link in bio, ads or QR codes, and watch subscribers come in.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setGallery(true)}>Browse {PAGE_TEMPLATES.length} templates</Button>
            <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>Create blank page</Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pages.map((p: any) => (
            <Card key={p.id} className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">{p.headline}</p>
                </div>
                <Badge variant={p.published ? "default" : "outline"}>{p.published ? "Live" : "Draft"}</Badge>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{p.views ?? 0} views</span>
                <span>{p.submissions ?? 0} signups</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(urlFor(p.slug)); toast.success("Link copied"); }}>
                  <Copy className="mr-1 size-3" />Copy link
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 size-3" />Preview</a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: p.id,
                      name: p.name,
                      headline: p.headline ?? "",
                      subheadline: p.subheadline ?? "",
                      body: p.body ?? "",
                      cta_label: p.cta_label ?? "Sign up",
                      success_message: p.success_message ?? "",
                      theme: p.theme === "dark" ? "dark" : "light",
                      accent: p.accent ?? "#111827",
                      image_url: p.image_url ?? "",
                      list_id: p.list_id ?? null,
                      published: !!p.published,
                    })
                  }
                >
                  Edit
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit landing page" : "New landing page"}</DialogTitle>
            <DialogDescription>Write your offer, choose the list, and publish.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Internal name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div>
                  <Label>Add signups to</Label>
                  <Select value={draft.list_id ?? "none"} onValueChange={(v) => setDraft({ ...draft, list_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No list (contacts only)</SelectItem>
                      {(listsQ.data ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Headline</Label><Input value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} maxLength={160} /></div>
              <div><Label>Sub-headline</Label><Input value={draft.subheadline} onChange={(e) => setDraft({ ...draft, subheadline: e.target.value })} maxLength={240} /></div>
              <div><Label>Extra details (optional)</Label><Textarea rows={3} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} maxLength={2000} /></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label>Button text</Label><Input value={draft.cta_label} onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })} maxLength={40} /></div>
                <div>
                  <Label>Look</Label>
                  <Select value={draft.theme} onValueChange={(v) => setDraft({ ...draft, theme: v as "light" | "dark" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Button colour</Label><Input type="color" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} /></div>
              </div>
              <div><Label>Thank-you message</Label><Input value={draft.success_message} onChange={(e) => setDraft({ ...draft, success_message: e.target.value })} maxLength={200} /></div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Publish this page</div>
                  <p className="text-xs text-muted-foreground">Anyone with the link can sign up while this is on.</p>
                </div>
                <Switch checked={draft.published} onCheckedChange={(v) => setDraft({ ...draft, published: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button disabled={!draft?.name.trim() || save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending ? "Saving…" : "Save page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TemplateGallery
        open={gallery}
        onOpenChange={setGallery}
        title="Browse landing page templates"
        description="Pick a starting point — every word, colour and setting stays editable."
        items={PAGE_TEMPLATES.map((t) => ({
          id: t.id,
          label: t.label,
          category: t.category,
          blurb: t.blurb,
          preview: { headline: t.values.headline, sub: t.values.subheadline, cta: t.values.cta_label, theme: t.values.theme, accent: t.values.accent },
        }))}
        onPick={applyTemplate}
        onBlank={() => { setGallery(false); setDraft({ ...EMPTY }); }}
      />
    </div>
  );
}
