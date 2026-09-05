import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Monitor, Smartphone } from "lucide-react";
import { type Design, type Section } from "@/lib/website-design";
import { PageRenderer } from "./renderers";
import { DesignControls, ImageField } from "./DesignControls";
import { SectionEditor } from "./SectionEditor";

export type PageDraft = {
  id?: string;
  slug?: string;
  name: string;
  headline: string;
  subheadline: string;
  body: string;
  cta_label: string;
  success_message: string;
  consent_text?: string;
  design: Design;
  sections: Section[];
  logo_url: string;
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  seo_indexable?: boolean;
  list_id: string | null;
  published: boolean;
};

export function PageEditor({
  draft,
  onChange,
  onClose,
  onSave,
  saving,
  lists,
  publicUrl,
}: {
  draft: PageDraft;
  onChange: (d: PageDraft) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  lists: { id: string; name: string }[];
  publicUrl?: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const set = (p: Partial<PageDraft>) => onChange({ ...draft, ...p });

  const consent =
    draft.consent_text ||
    "By signing up you agree to receive recurring marketing texts. Message and data rates may apply. Reply STOP to opt out.";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[95vh] max-w-[98vw] flex-col gap-0 p-0 sm:max-w-[98vw]">
        <DialogTitle className="sr-only">Landing page editor</DialogTitle>
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <Input className="h-9 max-w-64" value={draft.name} placeholder="Page name" onChange={(e) => set({ name: e.target.value })} />
          <Badge variant={draft.published ? "default" : "outline"}>{draft.published ? "Live" : "Draft"}</Badge>
          {publicUrl && draft.id ? (
            <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
              <ExternalLink className="size-3" />{publicUrl}
            </a>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-md border p-0.5 sm:flex">
              <Button variant={device === "desktop" ? "secondary" : "ghost"} size="icon" className="size-7" onClick={() => setDevice("desktop")}><Monitor className="size-4" /></Button>
              <Button variant={device === "mobile" ? "secondary" : "ghost"} size="icon" className="size-7" onClick={() => setDevice("mobile")}><Smartphone className="size-4" /></Button>
            </div>
            <div className="flex items-center gap-2 rounded-md border px-2 py-1">
              <span className="text-xs">Published</span>
              <Switch checked={draft.published} onCheckedChange={(v) => set({ published: v })} />
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button disabled={!draft.name.trim() || saving} onClick={onSave}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
          <aside className="min-h-0 overflow-y-auto border-r p-4">
            <Tabs defaultValue="content">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="design">Design</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="mt-4">
                <SectionEditor sections={draft.sections} onChange={(sections) => set({ sections })} />
              </TabsContent>

              <TabsContent value="design" className="mt-4 space-y-5">
                <ImageField label="Logo" hint="Shown at the top of the page." value={draft.logo_url} onChange={(logo_url) => set({ logo_url })} />
                <DesignControls design={draft.design} onChange={(design) => set({ design })} />
              </TabsContent>

              <TabsContent value="seo" className="mt-4 space-y-4">
                <div>
                  <Label className="text-xs">Search title</Label>
                  <Input value={draft.seo_title} maxLength={70} placeholder={draft.headline} onChange={(e) => set({ seo_title: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">{(draft.seo_title || "").length}/70 characters</p>
                </div>
                <div>
                  <Label className="text-xs">Search description</Label>
                  <Textarea rows={3} maxLength={160} value={draft.seo_description} placeholder={draft.subheadline} onChange={(e) => set({ seo_description: e.target.value })} />
                  <p className="mt-1 text-xs text-muted-foreground">{(draft.seo_description || "").length}/160 characters</p>
                </div>
                <ImageField
                  label="Social share image"
                  hint="1200 × 630 works best on WhatsApp, X and Facebook."
                  value={draft.og_image_url}
                  onChange={(og_image_url) => set({ og_image_url })}
                />
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label className="text-xs">Show this page in search engines</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Turn off for private or one-off pages. The link keeps working — it just
                      stays out of Google and out of your sitemap.
                    </p>
                  </div>
                  <Switch
                    checked={draft.seo_indexable !== false}
                    onCheckedChange={(seo_indexable) => set({ seo_indexable })}
                  />
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Preview</p>
                  {draft.og_image_url ? <img src={draft.og_image_url} alt="" className="mt-2 aspect-[1200/630] w-full rounded object-cover" /> : null}
                  <p className="mt-2 truncate text-sm font-medium">{draft.seo_title || draft.headline || draft.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{draft.seo_description || draft.subheadline}</p>
                  {publicUrl ? <p className="mt-1 truncate text-xs text-emerald-600">{publicUrl}</p> : null}
                </div>
              </TabsContent>

              <TabsContent value="settings" className="mt-4 space-y-4">
                <div>
                  <Label className="text-xs">Add signups to</Label>
                  <Select value={draft.list_id ?? "none"} onValueChange={(v) => set({ list_id: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No list (contacts only)</SelectItem>
                      {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Button text</Label><Input value={draft.cta_label} maxLength={40} onChange={(e) => set({ cta_label: e.target.value })} /></div>
                <div><Label className="text-xs">Thank-you message</Label><Input value={draft.success_message} maxLength={200} onChange={(e) => set({ success_message: e.target.value })} /></div>
                <div>
                  <Label className="text-xs">Consent wording</Label>
                  <Textarea rows={3} maxLength={400} value={consent} onChange={(e) => set({ consent_text: e.target.value })} />
                </div>
              </TabsContent>
            </Tabs>
          </aside>

          <section className="min-h-0 overflow-y-auto bg-muted/40 p-4">
            <div
              className="mx-auto overflow-hidden rounded-xl border bg-background shadow-sm transition-all"
              style={{ maxWidth: device === "mobile" ? 390 : "100%" }}
            >
              <PageRenderer
                design={draft.design}
                sections={draft.sections}
                logoUrl={draft.logo_url || null}
                preview
                form={{
                  ctaLabel: draft.cta_label || "Sign up",
                  successMessage: draft.success_message,
                  consentText: consent,
                  collectName: true,
                }}
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
