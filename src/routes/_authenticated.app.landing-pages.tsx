import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteLandingPage,
  duplicateLandingPage,
  exportWebsiteLeads,
  listLandingPages,
  saveLandingPage,
} from "@/lib/growth.functions";
import { listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TemplateGallery } from "@/components/growth/TemplateGallery";
import { PAGE_TEMPLATES } from "@/lib/growth-templates";
import { PageEditor, type PageDraft } from "@/components/website/PageEditor";
import { blankSection, LIGHT_DESIGN, mergeDesign, parseSections } from "@/lib/website-design";
import { Copy, CopyPlus, Download, ExternalLink, LayoutGrid, LayoutTemplate, Trash2 } from "lucide-react";

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

const EMPTY: PageDraft = {
  name: "",
  headline: "Get 15% off your first order",
  subheadline: "Join our text list for early access to drops and deals.",
  body: "",
  cta_label: "Sign up",
  success_message: "Thanks — watch your phone for your code!",
  design: LIGHT_DESIGN,
  sections: [blankSection("hero"), blankSection("features"), blankSection("footer")],
  logo_url: "",
  seo_title: "",
  seo_description: "",
  og_image_url: "",
  list_id: null,
  published: true,
};

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return toast.info("No signups to export yet");
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function LandingPagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLandingPages);
  const saveFn = useServerFn(saveLandingPage);
  const delFn = useServerFn(deleteLandingPage);
  const dupFn = useServerFn(duplicateLandingPage);
  const exportFn = useServerFn(exportWebsiteLeads);
  const listsFn = useServerFn(listAudienceContactLists);

  const pagesQ = useQuery({ queryKey: ["landing-pages"], queryFn: () => listFn() });
  const listsQ = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });
  const [draft, setDraft] = useState<PageDraft | null>(null);
  const [gallery, setGallery] = useState(false);

  const applyTemplate = (id: string) => {
    const t = PAGE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setGallery(false);
    setDraft({ ...EMPTY, ...t.values, body: "", name: t.label });
  };

  const save = useMutation({
    mutationFn: async (d: PageDraft) =>
      saveFn({
        data: {
          ...d,
          image_url: null,
          logo_url: d.logo_url || null,
          seo_title: d.seo_title || null,
          seo_description: d.seo_description || null,
          og_image_url: d.og_image_url || null,
          consent_text: d.consent_text || null,
        },
      }),
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

  const dup = useMutation({
    mutationFn: async (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Copy created");
      qc.invalidateQueries({ queryKey: ["landing-pages"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not duplicate"),
  });

  const pages = pagesQ.data ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (slug: string) => `${origin}/p/${slug}`;

  const openEdit = (p: any) =>
    setDraft({
      id: p.id,
      slug: p.slug,
      name: p.name,
      headline: p.headline ?? "",
      subheadline: p.subheadline ?? "",
      body: p.body ?? "",
      cta_label: p.cta_label ?? "Sign up",
      success_message: p.success_message ?? "",
      consent_text: p.consent_text ?? "",
      design: mergeDesign(p.design),
      sections:
        parseSections(p.sections).length > 0
          ? parseSections(p.sections)
          : [{ ...blankSection("hero"), headline: p.headline ?? p.name, subheadline: p.subheadline ?? "", body: p.body ?? "" } as any],
      logo_url: p.logo_url ?? "",
      seo_title: p.seo_title ?? "",
      seo_description: p.seo_description ?? "",
      og_image_url: p.og_image_url ?? "",
      list_id: p.list_id ?? null,
      published: !!p.published,
    });

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
          <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>Start from scratch</Button>
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
            <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>Start from scratch</Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pages.map((p: any) => {
            const views = Number(p.views ?? 0);
            const subs = Number(p.submissions ?? 0);
            return (
              <Card key={p.id} className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.headline}</p>
                  </div>
                  <Badge variant={p.published ? "default" : "outline"}>{p.published ? "Live" : "Draft"}</Badge>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{views} views</span>
                  <span>{subs} signups</span>
                  <span>{views > 0 ? ((subs / views) * 100).toFixed(1) : "0.0"}% conversion</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(urlFor(p.slug)); toast.success("Link copied"); }}>
                    <Copy className="mr-1 size-3" />Copy link
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 size-3" />View</a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => dup.mutate(p.id)}><CopyPlus className="mr-1 size-3" />Duplicate</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const rows = await exportFn({ data: { sourceId: p.id } });
                      downloadCsv(rows as any[], `${p.slug}-signups.csv`);
                    }}
                  >
                    <Download className="mr-1 size-3" />Leads
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(p.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {draft ? (
        <PageEditor
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => save.mutate(draft)}
          saving={save.isPending}
          lists={(listsQ.data ?? []) as { id: string; name: string }[]}
          publicUrl={draft.slug ? urlFor(draft.slug) : undefined}
        />
      ) : null}

      <TemplateGallery
        open={gallery}
        onOpenChange={setGallery}
        title="Browse landing page templates"
        description="Pick a starting point — every section, word and colour stays editable."
        items={PAGE_TEMPLATES.map((t) => ({
          id: t.id,
          label: t.label,
          category: t.category,
          blurb: t.blurb,
          design: t.values.design,
          preview: {
            headline: t.values.headline,
            sub: t.values.subheadline,
            cta: t.values.cta_label,
            blocks: t.values.sections.map((s) => s.type),
          },
        }))}
        onPick={applyTemplate}
        onBlank={() => { setGallery(false); setDraft({ ...EMPTY }); }}
      />
    </div>
  );
}
