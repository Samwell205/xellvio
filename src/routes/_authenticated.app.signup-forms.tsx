import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  deleteSignupForm,
  duplicateSignupForm,
  exportWebsiteLeads,
  listSignupForms,
  listRecentSubmissions,
  saveSignupForm,
} from "@/lib/growth.functions";
import { listAudienceContactLists } from "@/lib/audience.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { VisualBuilder, type BuilderDoc } from "@/components/builder/VisualBuilder";
import { docFromRow, legacyFieldsFromDoc, useBuilderDoc } from "@/components/builder/useBuilderDoc";
import { blankDesign } from "@/lib/builder/templates";
import { Code2, Copy, CopyPlus, Download, ExternalLink, FormInput, LayoutGrid, Sparkles, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/signup-forms")({
  head: () => ({
    meta: [
      { title: "Sign-up forms — Xellvio" },
      { name: "description", content: "Design hosted sign-up forms with templates and an AI design assistant, then embed them anywhere." },
      { property: "og:title", content: "Sign-up forms — Xellvio" },
      { property: "og:description", content: "Design hosted sign-up forms with templates and an AI design assistant, then embed them anywhere." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupFormsPage,
});

const DEFAULT_CONSENT =
  "By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.";

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
  const subsFn = useServerFn(listRecentSubmissions);
  const exportFn = useServerFn(exportWebsiteLeads);
  const listsFn = useServerFn(listAudienceContactLists);

  const formsQ = useQuery({ queryKey: ["signup-forms"], queryFn: () => listFn() });
  const listsQ = useQuery({ queryKey: ["contact-lists"], queryFn: () => listsFn() });
  const subsQ = useQuery({ queryKey: ["website-submissions"], queryFn: () => subsFn() });

  const persist = useCallback(
    async (d: BuilderDoc) => {
      const legacy = legacyFieldsFromDoc(d);
      const r = (await saveFn({
        data: {
          id: d.id,
          name: d.name,
          headline: legacy.headline || d.name,
          description: legacy.sub,
          cta_label: legacy.cta,
          success_message: legacy.successMessage,
          collect_name: true,
          consent_text: legacy.consentText || DEFAULT_CONSENT,
          blocks: d.blocks as any,
          builder_theme: d.theme as any,
          logo_url: null,
          image_url: null,
          seo_title: d.seo_title || null,
          seo_description: d.seo_description || null,
          og_image_url: d.og_image_url || null,
          list_id: d.list_id,
          published: d.published,
        },
      })) as any;
      qc.invalidateQueries({ queryKey: ["signup-forms"] });
      return { id: r?.id, slug: r?.slug };
    },
    [saveFn, qc],
  );

  const builder = useBuilderDoc(persist);

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
  const embedFor = (f: { slug: string; name: string }) =>
    `<iframe src="${urlFor(f.slug)}" style="width:100%;height:620px;border:0" title="${f.name}"></iframe>`;

  const startNew = (mode: "scratch" | "templates" | "ai") => {
    const fallback = blankDesign("form");
    builder.open(
      {
        name: mode === "scratch" ? "Untitled form" : "",
        blocks: fallback.blocks,
        theme: fallback.theme,
        seo_title: "",
        seo_description: "",
        og_image_url: "",
        list_id: null,
        published: true,
      },
      mode,
    );
  };

  if (builder.doc) {
    return (
      <VisualBuilder
        kind="form"
        doc={builder.doc}
        onChange={builder.change}
        onClose={builder.close}
        onSave={builder.saveNow}
        saveState={builder.saveState}
        lists={(listsQ.data ?? []) as { id: string; name: string }[]}
        publicUrl={builder.doc.slug ? urlFor(builder.doc.slug) : undefined}
        embedCode={builder.doc.slug ? embedFor({ slug: builder.doc.slug, name: builder.doc.name }) : undefined}
        startMode={builder.startMode}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Sign-up forms</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Build a form visually, start from a template, or describe it and let the design assistant build it for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => startNew("scratch")}>Start from scratch</Button>
          <Button variant="outline" onClick={() => startNew("templates")}><LayoutGrid className="mr-2 size-4" />Templates</Button>
          <Button onClick={() => startNew("ai")}><Sparkles className="mr-2 size-4" />Design with AI</Button>
        </div>
      </div>

      {forms.length === 0 ? (
        <Card className="flex flex-col items-center gap-4 p-14 text-center">
          <FormInput className="size-10 text-primary" />
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Collect subscribers anywhere</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Drag in the pieces you want, edit every word and colour, then share the link or embed it on your site.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => startNew("templates")}>Browse templates</Button>
            <Button variant="outline" onClick={() => startNew("ai")}>Describe it to AI</Button>
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
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{f.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{f.headline}</p>
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
                  <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(embedFor(f)); toast.success("Embed code copied"); }}>
                    <Code2 className="mr-1 size-3" />Embed
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 size-3" />View</a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => builder.open(docFromRow(f, blankDesign("form")))}
                  >
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => dup.mutate(f.id)}><CopyPlus className="mr-1 size-3" />Duplicate</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => downloadCsv((await exportFn({ data: { sourceId: f.id } })) as any[], `${f.slug}-signups.csv`)}
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
    </div>
  );
}
