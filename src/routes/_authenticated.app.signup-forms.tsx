import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteSignupForm,
  duplicateSignupForm,
  exportWebsiteLeads,
  listRecentSubmissions,
  listSignupForms,
  saveSignupForm,
} from "@/lib/growth.functions";
import { listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TemplateGallery } from "@/components/growth/TemplateGallery";
import { FORM_TEMPLATES } from "@/lib/growth-templates";
import { FormEditor, type FormDraft } from "@/components/website/FormEditor";
import { LIGHT_DESIGN, mergeDesign } from "@/lib/website-design";
import { Code2, Copy, CopyPlus, Download, ExternalLink, FormInput, LayoutGrid, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/signup-forms")({
  head: () => ({
    meta: [
      { title: "Sign-up forms — Xellvio" },
      { name: "description", content: "Create embeddable SMS sign-up forms that add subscribers to your lists automatically." },
      { property: "og:title", content: "Sign-up forms — Xellvio" },
      { property: "og:description", content: "Create embeddable SMS sign-up forms that add subscribers to your lists automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupFormsPage,
});

const EMPTY: FormDraft = {
  name: "",
  headline: "Get exclusive offers by text",
  description: "Be first to know about new drops and sales.",
  cta_label: "Subscribe",
  success_message: "You are on the list!",
  collect_name: true,
  consent_text:
    "By subscribing you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.",
  design: LIGHT_DESIGN,
  logo_url: "",
  image_url: "",
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

function SignupFormsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSignupForms);
  const saveFn = useServerFn(saveSignupForm);
  const delFn = useServerFn(deleteSignupForm);
  const dupFn = useServerFn(duplicateSignupForm);
  const exportFn = useServerFn(exportWebsiteLeads);
  const subsFn = useServerFn(listRecentSubmissions);
  const listsFn = useServerFn(listAudienceContactLists);

  const formsQ = useQuery({ queryKey: ["signup-forms"], queryFn: () => listFn() });
  const subsQ = useQuery({ queryKey: ["signup-submissions"], queryFn: () => subsFn(), refetchInterval: 30_000 });
  const listsQ = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [gallery, setGallery] = useState(false);

  const applyTemplate = (id: string) => {
    const t = FORM_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setGallery(false);
    setDraft({ ...EMPTY, ...t.values, name: t.label });
  };

  const save = useMutation({
    mutationFn: async (d: FormDraft) =>
      saveFn({
        data: {
          ...d,
          logo_url: d.logo_url || null,
          image_url: d.image_url || null,
          seo_title: d.seo_title || null,
          seo_description: d.seo_description || null,
          og_image_url: d.og_image_url || null,
        },
      }),
    onSuccess: () => {
      toast.success("Form saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["signup-forms"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["signup-forms"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not delete"),
  });

  const dup = useMutation({
    mutationFn: async (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Copy created");
      qc.invalidateQueries({ queryKey: ["signup-forms"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not duplicate"),
  });

  const forms = formsQ.data ?? [];
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (slug: string) => `${origin}/f/${slug}`;

  const openEdit = (f: any) =>
    setDraft({
      id: f.id,
      slug: f.slug,
      name: f.name,
      headline: f.headline ?? "",
      description: f.description ?? "",
      cta_label: f.cta_label ?? "Subscribe",
      success_message: f.success_message ?? "",
      consent_text: f.consent_text ?? EMPTY.consent_text,
      collect_name: !!f.collect_name,
      design: mergeDesign(f.design),
      logo_url: f.logo_url ?? "",
      image_url: f.image_url ?? "",
      seo_title: f.seo_title ?? "",
      seo_description: f.seo_description ?? "",
      og_image_url: f.og_image_url ?? "",
      list_id: f.list_id ?? null,
      published: !!f.published,
    });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Sign-up forms</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A hosted form you can share or embed. Everyone who subscribes goes straight into the list you pick.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>Start from scratch</Button>
          <Button onClick={() => setGallery(true)}><LayoutGrid className="mr-2 size-4" />Browse templates</Button>
        </div>
      </div>

      {forms.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-14 text-center">
          <FormInput className="size-10 text-primary" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Collect subscribers anywhere</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Pick a template, edit the words and colours, then share the link or embed it on your site.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setGallery(true)}>Browse {FORM_TEMPLATES.length} templates</Button>
            <Button variant="outline" onClick={() => setDraft({ ...EMPTY })}>Start from scratch</Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {forms.map((f: any) => {
            const views = Number(f.views ?? 0);
            const subs = Number(f.submissions ?? 0);
            return (
              <Card key={f.id} className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{f.name}</h3>
                    <p className="text-xs text-muted-foreground">{f.headline}</p>
                  </div>
                  <Badge variant={f.published ? "default" : "outline"}>{f.published ? "Live" : "Draft"}</Badge>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{views} views</span>
                  <span>{subs} signups</span>
                  <span>{views > 0 ? ((subs / views) * 100).toFixed(1) : "0.0"}% conversion</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(urlFor(f.slug)); toast.success("Link copied"); }}>
                    <Copy className="mr-1 size-3" />Copy link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `<iframe src="${urlFor(f.slug)}" style="width:100%;height:560px;border:0" title="${f.name}"></iframe>`,
                      );
                      toast.success("Embed code copied");
                    }}
                  >
                    <Code2 className="mr-1 size-3" />Embed
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 size-3" />View</a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(f)}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => dup.mutate(f.id)}><CopyPlus className="mr-1 size-3" />Duplicate</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const rows = await exportFn({ data: { sourceId: f.id } });
                      downloadCsv(rows as any[], `${f.slug}-signups.csv`);
                    }}
                  >
                    <Download className="mr-1 size-3" />Leads
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(f.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(subsQ.data ?? []).length > 0 ? (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Latest signups</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => downloadCsv((await exportFn({ data: {} })) as any[], "all-signups.csv")}
            >
              <Download className="mr-1 size-3" />Export all
            </Button>
          </div>
          <div className="divide-y text-sm">
            {(subsQ.data ?? []).slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span>{s.first_name ? `${s.first_name} — ` : ""}{s.phone_e164}</span>
                <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {draft ? (
        <FormEditor
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
        title="Browse sign-up form templates"
        description="Pick a starting point — every word, colour and setting stays editable."
        items={FORM_TEMPLATES.map((t) => ({
          id: t.id,
          label: t.label,
          category: t.category,
          blurb: t.blurb,
          design: t.values.design,
          preview: { headline: t.values.headline, sub: t.values.description, cta: t.values.cta_label },
        }))}
        onPick={applyTemplate}
        onBlank={() => { setGallery(false); setDraft({ ...EMPTY }); }}
      />
    </div>
  );
}
