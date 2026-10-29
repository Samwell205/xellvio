import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlignCenter, AlignLeft, ArrowDown, ArrowUp, BookmarkPlus, Code2, Columns2, DownloadCloud, FileUp, Heading1, ImageIcon, LayoutTemplate, Loader2, Minus, MousePointer2, MoveVertical, Palette, Plus, Quote, Share2, Smartphone, Monitor, Sparkles, Trash2, Type, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MediaLibraryDialog } from "@/components/builder/MediaPicker";
import { renderEmail, resolveTheme, type EmailBlock, type EmailDraft, type EmailMode, type EmailTheme } from "@/lib/email-campaign-rules";
import { listEmailTemplates, saveEmailTemplate, deleteEmailTemplate, importProviderEmailTemplates } from "@/lib/email-templates.functions";

type Tpl = { name: string; category: string; theme?: EmailTheme; blocks: Omit<EmailBlock, "id">[] };
const b = (type: EmailBlock["type"], text = "", url = "", align?: "left" | "center"): Omit<EmailBlock, "id"> => ({ type, text, url, ...(align ? { align } : {}) });
export const EMAIL_TEMPLATES: Tpl[] = [
  { name: "Announcement", category: "General", blocks: [b("heading", "Something good is here."), b("text", "Hi {{first_name}},\n\nWe have something new to share with you. Here is what you need to know."), b("button", "Discover more")] },
  { name: "Newsletter", category: "General", blocks: [b("heading", "Your monthly update"), b("text", "Hi {{first_name}},\n\nA fresh collection of news, stories and updates from our team."), b("divider"), b("heading", "In the spotlight"), b("text", "Share your featured story here."), b("button", "Read the story")] },
  { name: "Welcome", category: "Onboarding", blocks: [b("heading", "Welcome to the family.", "", "center"), b("text", "Hi {{first_name}},\n\nThank you for joining us. We're glad you're here. Look out for useful updates, news and offers.", "", "center"), b("button", "Explore our website", "", "center")] },
  { name: "Sale / promotion", category: "Sales", theme: { brand: "#c2410c", background: "#fff7ed" }, blocks: [b("heading", "Our biggest sale of the season", "", "center"), b("text", "Hi {{first_name}}, for a limited time enjoy up to 30% off selected items.", "", "center"), b("image", "Sale banner"), b("button", "Shop the sale", "", "center"), b("text", "Offer ends Sunday at midnight.", "", "center")] },
  { name: "Product launch", category: "Sales", theme: { brand: "#1d4ed8", background: "#eff6ff" }, blocks: [b("logo", "Logo"), b("heading", "Meet our newest product"), b("image", "Product photo"), b("columns", "Why you'll love it\nSimple to use and built to last.\n---\nAvailable today\nOrder now and get it delivered fast."), b("button", "See it now")] },
  { name: "Event invitation", category: "Events", theme: { brand: "#7c2d12", background: "#fdf4ee", font: "Georgia" }, blocks: [b("heading", "You're invited", "", "center"), b("text", "Hi {{first_name}},\n\nJoin us for an evening of ideas and conversation.\n\nDate: \nTime: \nPlace: ", "", "center"), b("button", "Reserve my seat", "", "center"), b("spacer"), b("social", "Instagram|https://instagram.com\nFacebook|https://facebook.com")] },
  { name: "Follow-up / thank you", category: "Onboarding", blocks: [b("heading", "Thank you, {{first_name}}"), b("text", "We appreciate you. If there is anything we can help with, simply reply to this email."), b("quote", "“Great service from start to finish.” — A happy customer")] },
  { name: "Reminder", category: "General", theme: { brand: "#0f766e" }, blocks: [b("heading", "A quick reminder"), b("text", "Hi {{first_name}}, just a friendly reminder about your upcoming appointment."), b("button", "View details")] },
  { name: "Restaurant menu", category: "Food", theme: { brand: "#9a3412", background: "#fefce8", font: "Georgia" }, blocks: [b("logo", "Logo"), b("heading", "This week's menu", "", "center"), b("image", "Featured dish"), b("columns", "Starters\nSeasonal soup\nFresh salad\n---\nMains\nGrilled chicken\nVegetable pasta"), b("button", "Order now", "", "center")] },
  { name: "Real estate listing", category: "Property", theme: { brand: "#334155" }, blocks: [b("heading", "New listing just for you"), b("image", "Property photo"), b("text", "3 bedrooms · 2 bathrooms · Garden\n\nBook a viewing this week."), b("button", "Book a viewing")] },
];
export function templateBlocks(index: number): EmailBlock[] {
  return (EMAIL_TEMPLATES[index]?.blocks ?? []).map((x) => ({ ...x, id: crypto.randomUUID() }));
}
const TOOLS = [
  { type: "heading", icon: Heading1, label: "Heading" }, { type: "text", icon: Type, label: "Text" }, { type: "image", icon: ImageIcon, label: "Image" },
  { type: "button", icon: MousePointer2, label: "Button" }, { type: "columns", icon: Columns2, label: "Columns" }, { type: "quote", icon: Quote, label: "Quote" },
  { type: "logo", icon: Sparkles, label: "Logo" }, { type: "social", icon: Share2, label: "Social" }, { type: "divider", icon: Minus, label: "Divider" }, { type: "spacer", icon: MoveVertical, label: "Space" },
] as const;
const DEFAULT_TEXT: Partial<Record<EmailBlock["type"], string>> = { heading: "Your heading", button: "Learn more", text: "Write your message here.", quote: "A short quote", columns: "Left column\n---\nRight column", social: "Instagram|https://instagram.com\nFacebook|https://facebook.com", logo: "Logo" };
const FONTS = ["Arial", "Helvetica", "Georgia", "Verdana", "Trebuchet MS"] as const;

export function EmailDesigner({ draft, onChange }: { draft: EmailDraft; onChange: (v: Partial<EmailDraft>) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [media, setMedia] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const mode = draft.content_mode;
  const theme = resolveTheme(draft.theme);
  const block = draft.blocks.find((x) => x.id === selected);
  const setBlocks = (blocks: EmailBlock[]) => onChange({ blocks });
  function patch(value: Partial<EmailBlock>) { setBlocks(draft.blocks.map((x) => x.id === selected ? { ...x, ...value } : x)); }
  function move(delta: number) {
    const i = draft.blocks.findIndex((x) => x.id === selected); const next = i + delta;
    if (i < 0 || next < 0 || next >= draft.blocks.length) return;
    const blocks = [...draft.blocks]; const a = blocks[i]; const c = blocks[next];
    if (!a || !c) return; blocks[i] = c; blocks[next] = a; setBlocks(blocks);
  }
  function switchMode(next: EmailMode) {
    if (next === mode) return;
    const updates: Partial<EmailDraft> = { content_mode: next };
    if (next === "html" && !draft.html_body.trim()) updates.html_body = renderEmail({ ...draft, content_mode: "design" }, "{{unsubscribe_url}}", "{{first_name}}").replace(/<a href="\{\{unsubscribe_url\}\}"/, '<a href="{{unsubscribe_url}}"');
    if (next === "plain" && !draft.plain_body.trim()) updates.plain_body = `Hi {{first_name}},\n\n\n\nThanks,\n${draft.from_name}`;
    onChange(updates);
  }
  async function importFile(file: File) {
    if (file.size > 400_000) { toast.error("That file is too large. Keep HTML emails under 400 KB."); return; }
    onChange({ content_mode: "html", html_body: await file.text() }); toast.success("HTML imported");
  }
  const save = useServerFn(saveEmailTemplate);
  const qc = useQueryClient();
  async function saveTemplate() {
    try {
      await save({ data: { name: tplName.trim() || draft.name, subject: draft.subject, content_mode: draft.content_mode, blocks: draft.blocks, plain_body: draft.plain_body, html_body: draft.html_body, theme: draft.theme } });
      toast.success("Saved to your templates"); setSaveOpen(false); setTplName(""); qc.invalidateQueries({ queryKey: ["email-templates"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Template could not be saved"); }
  }
  const preview = renderEmail(draft, "https://xellvio.com", "Alex");

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={mode} onValueChange={(v) => switchMode(v as EmailMode)}>
        <TabsList>
          <TabsTrigger value="design"><Wand2 className="size-4" />Drag & drop design</TabsTrigger>
          <TabsTrigger value="plain"><Type className="size-4" />Plain message</TabsTrigger>
          <TabsTrigger value="html"><Code2 className="size-4" />HTML code</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setGallery(true)}><LayoutTemplate className="size-4" />Templates</Button>
        <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}><BookmarkPlus className="size-4" />Save as template</Button>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-5">
        {mode === "design" && <>
          <div className="space-y-2"><h3 className="text-sm font-semibold">Add a block</h3><div className="grid grid-cols-2 gap-1.5">{TOOLS.map((t) => <Button key={t.type} size="sm" variant="outline" className="justify-start" title={t.label} onClick={() => {
            const id = crypto.randomUUID(); setBlocks([...draft.blocks, { id, type: t.type, text: DEFAULT_TEXT[t.type] ?? "", url: "" }]); setSelected(id);
          }}><t.icon className="size-4" />{t.label}</Button>)}</div></div>
          <div className="space-y-1">{draft.blocks.map((x, i) => <Button key={x.id} variant={selected === x.id ? "secondary" : "ghost"} className="w-full justify-start overflow-hidden" onClick={() => setSelected(x.id)}><span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><span className="truncate">{x.type === "divider" || x.type === "spacer" ? x.type : x.text || x.type}</span></Button>)}</div>
          {block && <div className="space-y-3 border-t pt-4"><div className="flex items-center justify-between"><h3 className="font-semibold capitalize">{block.type}</h3><div className="flex"><Button size="icon" variant="ghost" title="Move up" onClick={() => move(-1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" title="Move down" onClick={() => move(1)}><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" title="Delete block" onClick={() => { setBlocks(draft.blocks.filter((x) => x.id !== block.id)); setSelected(null); }}><Trash2 className="size-4 text-destructive" /></Button></div></div>
            {!["divider", "spacer"].includes(block.type) && <><Label htmlFor="block-text">{block.type === "image" || block.type === "logo" ? "Image description" : block.type === "social" ? "One link per line: Name|https://…" : block.type === "columns" ? "Put --- on its own line between columns" : "Content"}</Label><Textarea id="block-text" rows={5} value={block.text} onChange={(e) => patch({ text: e.target.value })} /></>}
            {["image", "button", "logo"].includes(block.type) && <><Label htmlFor="block-url">{block.type === "button" ? "Destination URL" : "Image URL"}</Label><Input id="block-url" placeholder="https://" value={block.url} onChange={(e) => patch({ url: e.target.value })} />{block.type !== "button" && <Button variant="outline" className="w-full" onClick={() => setMedia(true)}><ImageIcon className="size-4" />Choose or upload image</Button>}</>}
            {["heading", "text", "button"].includes(block.type) && <div className="flex gap-1"><Button size="sm" variant={block.align === "center" ? "ghost" : "secondary"} onClick={() => patch({ align: "left" })}><AlignLeft className="size-4" />Left</Button><Button size="sm" variant={block.align === "center" ? "secondary" : "ghost"} onClick={() => patch({ align: "center" })}><AlignCenter className="size-4" />Center</Button></div>}
            {["text", "heading"].includes(block.type) && <Button variant="outline" size="sm" onClick={() => patch({ text: `${block.text} {{first_name}}` })}><Plus className="size-3" />First name</Button>}
          </div>}
          <div className="space-y-3 border-t pt-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Palette className="size-4" />Style</h3>
            <div className="grid grid-cols-3 gap-2">{([["brand", "Buttons"], ["background", "Background"], ["text", "Text"]] as const).map(([k, label]) => <label key={k} className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><Input type="color" className="h-9 p-1" value={theme[k]} onChange={(e) => onChange({ theme: { ...draft.theme, [k]: e.target.value } })} /></label>)}</div>
            <div className="flex flex-wrap gap-1">{FONTS.map((f) => <Button key={f} size="sm" variant={theme.font === f ? "secondary" : "ghost"} style={{ fontFamily: f }} onClick={() => onChange({ theme: { ...draft.theme, font: f } })}>{f}</Button>)}</div>
          </div>
        </>}
        {mode === "plain" && <div className="space-y-3">
          <Label htmlFor="plain-body">Your message</Label>
          <Textarea id="plain-body" rows={16} value={draft.plain_body} onChange={(e) => onChange({ plain_body: e.target.value })} placeholder="Write your email just like a normal message…" />
          <Button variant="outline" size="sm" onClick={() => onChange({ plain_body: `${draft.plain_body}{{first_name}}` })}><Plus className="size-3" />First name</Button>
          <p className="text-xs text-muted-foreground">Sends like a personal email with no design. Links starting with https:// become clickable. Your business address and unsubscribe link are added automatically.</p>
        </div>}
        {mode === "html" && <div className="space-y-3">
          <div className="flex items-center justify-between"><Label htmlFor="html-body">HTML code</Label><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FileUp className="size-4" />Import .html file</Button></div>
          <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <Textarea id="html-body" rows={18} spellCheck={false} className="font-mono text-xs" value={draft.html_body} onChange={(e) => onChange({ html_body: e.target.value })} placeholder="Paste your email HTML here" />
          <p className="text-xs text-muted-foreground">Use {"{{first_name}}"} for personalization and {"{{unsubscribe_url}}"} for your own unsubscribe link — if missing, a footer with your address and unsubscribe link is added. Scripts, forms and unsafe links are removed before sending.</p>
        </div>}
      </aside>
      <section className="min-w-0 bg-muted/60 p-3 md:p-5"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">EMAIL PREVIEW</span><div className="flex gap-1"><Button size="icon" variant={mobile ? "ghost" : "secondary"} title="Desktop preview" onClick={() => setMobile(false)}><Monitor className="size-4" /></Button><Button size="icon" variant={mobile ? "secondary" : "ghost"} title="Phone preview" onClick={() => setMobile(true)}><Smartphone className="size-4" /></Button></div></div>
        <iframe title="Email design preview" sandbox="" srcDoc={preview} className={`mx-auto h-[680px] w-full border-0 bg-card transition-all duration-300 ${mobile ? "max-w-[360px]" : "max-w-[640px]"}`} />
      </section>
    </div>
    <MediaLibraryDialog open={media} onOpenChange={setMedia} onPick={(url) => patch({ url })} />
    <TemplateGallery open={gallery} onOpenChange={setGallery} onPick={(v) => { onChange(v); setSelected(null); setGallery(false); toast.success("Template applied"); }} />
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent><DialogHeader><DialogTitle>Save as template</DialogTitle></DialogHeader>
      <div className="space-y-2"><Label htmlFor="tpl-name">Template name</Label><Input id="tpl-name" value={tplName} placeholder={draft.name} onChange={(e) => setTplName(e.target.value)} /></div>
      <p className="text-sm text-muted-foreground">Reuse this design for future campaigns. Only your business can see it.</p>
      <Button onClick={() => void saveTemplate()}><BookmarkPlus className="size-4" />Save template</Button>
    </DialogContent></Dialog>
  </div>;
}

function TemplateGallery({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (v: Partial<EmailDraft>) => void }) {
  const list = useServerFn(listEmailTemplates); const remove = useServerFn(deleteEmailTemplate); const importFn = useServerFn(importProviderEmailTemplates);
  const q = useQuery({ queryKey: ["email-templates"], queryFn: () => list(), enabled: open });
  const [busy, setBusy] = useState(false);
  type Row = NonNullable<typeof q.data>["saved"][number];
  const fromRow = (r: Row): Partial<EmailDraft> => ({ content_mode: r.content_mode as EmailMode, blocks: ((r.blocks as EmailBlock[]) ?? []).map((x) => ({ ...x, id: crypto.randomUUID() })), plain_body: r.plain_body, html_body: r.html_body, theme: (r.theme as EmailTheme) ?? {}, ...(r.subject ? { subject: r.subject } : {}) });
  const card = (key: string, title: string, sub: string, html: string, pick: () => void, extra?: React.ReactNode) => <div key={key} className="group overflow-hidden rounded-lg border bg-card transition hover:-translate-y-0.5 hover:shadow-md">
    <button type="button" className="block w-full text-left" onClick={pick}><div className="pointer-events-none h-44 overflow-hidden bg-muted"><iframe title={title} sandbox="" srcDoc={html} tabIndex={-1} className="h-[700px] w-[640px] origin-top-left scale-[0.42] border-0" /></div>
      <div className="flex items-center justify-between gap-2 p-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{title}</div><div className="text-xs text-muted-foreground">{sub}</div></div></div></button>{extra}
  </div>;
  const sample = { preheader: "", from_name: "Your business", postal_address: "Your address" };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
    <DialogHeader><DialogTitle>Email templates</DialogTitle></DialogHeader>
    {q.data?.isAdmin && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm"><span>Owner tool: copy every template from your email service into the shared library for all businesses.</span><Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await importFn(); toast.success(`${r.imported} templates imported${r.skipped ? `, ${r.skipped} skipped` : ""}`); await q.refetch(); } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); } finally { setBusy(false); } }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}Import templates</Button></div>}
    {!!q.data?.saved.length && <><h3 className="font-semibold">Your saved templates</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data.saved.map((r) => card(r.id, r.name, r.content_mode === "html" ? "HTML" : r.content_mode === "plain" ? "Plain message" : "Design", renderEmail({ ...sample, ...fromRow(r), blocks: fromRow(r).blocks ?? [] }, "#", "Alex"), () => onPick(fromRow(r)),
      <div className="border-t px-3 py-2"><Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await remove({ data: { id: r.id } }); await q.refetch(); }}><Trash2 className="size-3" />Delete</Button></div>))}</div></>}
    {!!q.data?.library.length && <><h3 className="font-semibold">Library</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data.library.map((r) => card(r.id, r.name, r.category, renderEmail({ ...sample, ...fromRow(r), blocks: fromRow(r).blocks ?? [] }, "#", "Alex"), () => onPick(fromRow(r)), <div className="px-3 pb-2"><Badge variant="secondary">{r.category}</Badge></div>))}</div></>}
    <h3 className="font-semibold">Starter designs</h3>
    {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading your templates…</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{EMAIL_TEMPLATES.map((t, i) => card(t.name, t.name, t.category, renderEmail({ ...sample, blocks: templateBlocks(i), theme: t.theme ?? {} }, "#", "Alex"), () => onPick({ content_mode: "design", blocks: templateBlocks(i), theme: t.theme ?? {} })))}
      {card("plain", "Plain message", "No design", renderEmail({ ...sample, blocks: [], content_mode: "plain", plain_body: "Hi {{first_name}},\n\nJust a quick note from our team.\n\nThanks!" }, "#", "Alex"), () => onPick({ content_mode: "plain", plain_body: "Hi {{first_name}},\n\n\n\nThanks!" }))}
    </div>
  </DialogContent></Dialog>;
}
