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
import { MediaLibraryDialog } from "@/components/builder/MediaPicker";
import { renderEmail, resolveTheme, type EmailBlock, type EmailDraft, type EmailMode, type EmailTheme } from "@/lib/email-campaign-rules";
import { listEmailTemplates, saveEmailTemplate, deleteEmailTemplate, importProviderEmailTemplates } from "@/lib/email-templates.functions";
import { EmailTemplatePreview } from "./EmailTemplatePreview";
import { EmailVisualEditor } from "./EmailVisualEditor";
import { CREATIVE_EMAIL_TEMPLATES, emailTemplateCategory } from "@/lib/email-template-catalog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

type Method = "template" | "scratch" | "plain" | "html";
const METHODS: { id: Method; icon: typeof Wand2; title: string; desc: string }[] = [
  { id: "template", icon: LayoutTemplate, title: "Use a template", desc: "Pick a ready-made design, then change any words, pictures or buttons." },
  { id: "scratch", icon: Wand2, title: "Design from scratch", desc: "Build your own layout with drag & drop blocks." },
  { id: "plain", icon: Type, title: "Plain message", desc: "A simple, personal email with no design — just words." },
  { id: "html", icon: Code2, title: "HTML code", desc: "Paste or import your own coded email." },
];

/** Step where the business decides how to build the email; templates open straight into editing. */
export function EmailContentChooser({ draft, onPick }: { draft: EmailDraft; onPick: (values: Partial<EmailDraft>, method: Method) => void }) {
  const [method, setMethod] = useState<Method | null>(null);
  const libraryRef = useRef<HTMLDivElement>(null);
  function choose(m: Method) {
    if (m === "template") { setMethod("template"); requestAnimationFrame(() => libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); return; }
    setMethod(m);
    if (m === "scratch") {
      if (draft.content_mode === "design" && draft.blocks.length && !window.confirm("Start over with an empty design? Your current design blocks will be cleared.")) return;
      onPick({ content_mode: "design", blocks: [], theme: {} }, m);
    } else if (m === "plain") onPick({ content_mode: "plain", plain_body: draft.plain_body.trim() ? draft.plain_body : `Hi {{first_name}},\n\n\n\nThanks,\n${draft.from_name}` }, m);
    else onPick({ content_mode: "html" }, m);
  }
  return <div className="space-y-8">
    <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-green">Step 2</p><h2 className="text-2xl font-bold">How do you want to create your email?</h2><p className="mt-1 text-sm text-muted-foreground">Choose one. You can come back and change it any time.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {METHODS.map((m, i) => <button key={m.id} type="button" onClick={() => choose(m.id)} aria-pressed={method === m.id} style={{ animationDelay: `${i * 60}ms` }} className={`group relative overflow-hidden rounded-3xl border bg-card p-5 text-left transition duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:hover:-translate-y-1 hover:border-brand-green hover:shadow-lg ${method === m.id ? "border-brand-green ring-2 ring-brand-green/30" : ""}`}>
        <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-brand-green/10 blur-2xl transition group-hover:bg-brand-green/20" />
        <span className="relative grid size-12 place-items-center rounded-2xl bg-brand-green/12 text-brand-green transition group-hover:scale-110"><m.icon className="size-6" /></span>
        <h3 className="relative mt-4 font-semibold">{m.title}</h3>
        <p className="relative mt-1 text-sm text-muted-foreground">{m.desc}</p>
        {m.id === "template" && <span className="relative mt-3 inline-flex rounded-full bg-brand-green/12 px-2.5 py-0.5 text-xs font-medium text-brand-green">Most popular</span>}
      </button>)}
    </div>
    {method === "template" && <div ref={libraryRef} className="scroll-mt-24 rounded-3xl border bg-card p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 md:p-6"><TemplateLibrary onPick={(v) => onPick(v, "template")} /></div>}
  </div>;
}

const METHOD_LABEL: Record<EmailMode, string> = { design: "Drag & drop design", plain: "Plain message", html: "Template or HTML email" };

export function EmailDesigner({ draft, onChange, onChangeMethod, htmlView, onHtmlView }: { draft: EmailDraft; onChange: (v: Partial<EmailDraft>) => void; onChangeMethod: () => void; htmlView: "visual" | "code"; onHtmlView: (v: "visual" | "code") => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [media, setMedia] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [editorKey, setEditorKey] = useState(0);
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
  async function importFile(file: File) {
    if (file.size > 400_000) { toast.error("That file is too large. Keep HTML emails under 400 KB."); return; }
    onChange({ content_mode: "html", html_body: await file.text() }); setEditorKey((k) => k + 1); toast.success("HTML imported");
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-green/12 text-brand-green">{mode === "plain" ? <Type className="size-4" /> : mode === "html" ? <Code2 className="size-4" /> : <Wand2 className="size-4" />}</span><div className="min-w-0"><p className="text-xs text-muted-foreground">You're editing</p><p className="truncate text-sm font-semibold">{METHOD_LABEL[mode]}</p></div><Button variant="ghost" size="sm" onClick={onChangeMethod}>Change</Button></div>
      <div className="flex flex-wrap items-center gap-2">
        {mode === "html" && <Tabs value={htmlView} onValueChange={(v) => { onHtmlView(v as "visual" | "code"); setEditorKey((k) => k + 1); }}><TabsList className="rounded-full p-1"><TabsTrigger value="visual" className="rounded-full"><MousePointer2 className="size-4" />Visual editor</TabsTrigger><TabsTrigger value="code" className="rounded-full"><Code2 className="size-4" />Code</TabsTrigger></TabsList></Tabs>}
        <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}><BookmarkPlus className="size-4" />Save as template</Button>
      </div>
    </div>

    {mode === "html" && htmlView === "visual" && draft.html_body.trim() ? <EmailVisualEditor key={editorKey} html={draft.html_body} onChange={(html_body) => onChange({ html_body })} /> :
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-5 rounded-3xl border bg-card p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        {mode === "design" && <>
          <div className="space-y-2"><h3 className="text-sm font-semibold">Add a block</h3><div className="grid grid-cols-3 gap-2">{TOOLS.map((t) => <Button key={t.type} variant="outline" className="h-auto flex-col gap-1.5 rounded-xl py-3 text-xs hover:border-brand-green hover:bg-brand-green/5" title={t.label} onClick={() => {
            const id = crypto.randomUUID(); setBlocks([...draft.blocks, { id, type: t.type, text: DEFAULT_TEXT[t.type] ?? "", url: "" }]); setSelected(id);
          }}><t.icon className="size-4 text-brand-green" />{t.label}</Button>)}</div></div>
          {!draft.blocks.length && <p className="rounded-xl border border-dashed border-brand-green/50 bg-brand-green/5 p-3 text-xs text-muted-foreground">Your email is empty. Tap a block above to add it — start with a Logo or Heading.</p>}
          {!!draft.blocks.length && <h3 className="text-sm font-semibold">Layers</h3>}
          <div className="space-y-1">{draft.blocks.map((x, i) => <Button key={x.id} variant="ghost" className={`w-full justify-start overflow-hidden rounded-xl border ${selected === x.id ? "border-brand-green bg-brand-green/10" : "border-transparent"}`} onClick={() => setSelected(x.id)}><span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><span className="truncate">{x.type === "divider" || x.type === "spacer" ? x.type : x.text || x.type}</span></Button>)}</div>
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
      <section className="min-w-0 rounded-3xl border bg-[radial-gradient(circle_at_top,var(--brand-green-soft),transparent_60%)] bg-muted/50 p-3 md:p-6"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">EMAIL PREVIEW</span><div className="flex gap-1"><Button size="icon" variant={mobile ? "ghost" : "secondary"} title="Desktop preview" onClick={() => setMobile(false)}><Monitor className="size-4" /></Button><Button size="icon" variant={mobile ? "secondary" : "ghost"} title="Phone preview" onClick={() => setMobile(true)}><Smartphone className="size-4" /></Button></div></div>
        <iframe title="Email design preview" sandbox="" srcDoc={preview} className={`mx-auto h-[680px] w-full border-0 bg-card transition-all duration-300 ${mobile ? "max-w-[360px]" : "max-w-[640px]"}`} />
      </section>
    </div>}
    <MediaLibraryDialog open={media} onOpenChange={setMedia} onPick={(url) => patch({ url })} />
    <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogContent><DialogHeader><DialogTitle>Save as template</DialogTitle></DialogHeader>
      <div className="space-y-2"><Label htmlFor="tpl-name">Template name</Label><Input id="tpl-name" value={tplName} placeholder={draft.name} onChange={(e) => setTplName(e.target.value)} /></div>
      <p className="text-sm text-muted-foreground">Reuse this design for future campaigns. Only your business can see it.</p>
      <Button onClick={() => void saveTemplate()}><BookmarkPlus className="size-4" />Save template</Button>
    </DialogContent></Dialog>
  </div>;
}

function TemplateLibrary({ onPick }: { onPick: (v: Partial<EmailDraft>) => void }) {
  const list = useServerFn(listEmailTemplates);
  const remove = useServerFn(deleteEmailTemplate);
  const importFn = useServerFn(importProviderEmailTemplates);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["email-templates"], queryFn: () => list() });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("ready");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState("All categories");
  const [previewTemplate, setPreviewTemplate] = useState<{ name: string; values: Partial<EmailDraft> } | null>(null);
  type Row = NonNullable<typeof q.data>["saved"][number];
  const fromRow = (r: Row): Partial<EmailDraft> => ({ content_mode: r.content_mode as EmailMode, blocks: ((r.blocks as EmailBlock[]) ?? []).map((x) => ({ ...x, id: crypto.randomUUID() })), plain_body: r.plain_body, html_body: r.html_body, theme: (r.theme as EmailTheme) ?? {}, ...(r.subject ? { subject: r.subject } : {}) });
  const sample = { preheader: "", from_name: "Your business", postal_address: "Your business address" };
  const allRows = (tab === "saved" ? q.data?.saved ?? [] : q.data?.library.filter((r) => r.provider_template_id?.startsWith("prebuilt:")) ?? []).map((r) => ({ ...r, category: emailTemplateCategory(r.name, r.category) }));
  const matches = (t: { name: string; category: string }) => t.name.toLowerCase().includes(search.toLowerCase()) && (category === "All categories" || t.category === category);
  const rows = allRows.filter(matches);
  const basics = EMAIL_TEMPLATES.map((t, i) => ({ ...t, index: i })).filter(matches);
  const originals = CREATIVE_EMAIL_TEMPLATES.filter(matches);
  const categories = ["All categories", ...new Set((tab === "creative" ? CREATIVE_EMAIL_TEMPLATES : tab === "basic" ? EMAIL_TEMPLATES : allRows).map((t) => t.category))];
  const total = tab === "creative" ? originals.length : tab === "basic" ? basics.length : rows.length;
  const pages = Math.max(1, Math.ceil(total / 8));
  const currentPage = Math.min(page, pages - 1);
  const card = (id: string, name: string, subtitle: string, values: Partial<EmailDraft>, deletable = false) => <article key={id} className="group min-w-0 overflow-hidden rounded-lg border bg-card transition motion-safe:hover:-translate-y-1 hover:border-brand-green">
    <div className="border-b"><EmailTemplatePreview title={`${name} template preview`} html={renderEmail({ ...sample, ...values, blocks: values.blocks ?? [] }, "#", "Alex")} /></div>
    <div className="space-y-4 p-4"><div className="min-w-0"><p className="mb-1 text-xs text-muted-foreground">{subtitle}</p><h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5">{name.replace(/ Email Template$/i, "")}</h3></div><div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><Button className="min-w-0" onClick={() => onPick(values)}>Edit this template</Button><Button variant="outline" size="icon" title={`Preview ${name}`} onClick={() => setPreviewTemplate({ name, values })}><Monitor className="size-4 shrink-0" /></Button></div>{deletable && <Button variant="ghost" size="sm" title={`Delete ${name}`} onClick={async () => { try { await remove({ data: { id } }); await q.refetch(); } catch { toast.error("Template could not be deleted"); } }}><Trash2 className="size-4 text-destructive" />Delete</Button>}</div>
  </article>;
  return <section aria-label="Email template library" className="space-y-5">
    <div className="grid min-w-0 gap-4 border-b pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-green">Template library</p><h2 className="text-2xl font-bold">Pick a template to edit</h2></div><Input aria-label="Search templates" placeholder="Search templates" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="w-full sm:w-64" /></div>
    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]"><Tabs value={tab} onValueChange={(v) => { setTab(v); setCategory("All categories"); setPage(0); setSearch(""); }}><TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"><TabsTrigger className="min-w-0 whitespace-normal" value="ready">Ready-made</TabsTrigger><TabsTrigger className="min-w-0 whitespace-normal" value="creative">Studio designs</TabsTrigger><TabsTrigger className="min-w-0 whitespace-normal" value="saved">My templates</TabsTrigger><TabsTrigger className="min-w-0 whitespace-normal" value="basic">Basic layouts</TabsTrigger></TabsList></Tabs><Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}><SelectTrigger aria-label="Template category" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
    {q.data?.isAdmin && tab === "ready" && <div className="flex justify-end"><Button variant="ghost" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { let offset: number | null = 0; let total = 0; let skipped = 0; while (offset !== null) { const r = await importFn({ data: { offset } }); total += r.imported; skipped += r.skipped; offset = r.nextOffset; } toast.success(`${total} templates refreshed${skipped ? `; ${skipped} unavailable` : ""}`); await qc.invalidateQueries({ queryKey: ["email-templates"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Library could not refresh"); } finally { setBusy(false); } }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}Refresh library</Button></div>}
    {["ready", "saved"].includes(tab) && q.isLoading && <div role="status" className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading templates…</div>}
    {["ready", "saved"].includes(tab) && q.error && <div role="alert" className="py-6 text-sm text-destructive">Templates could not load. <Button variant="ghost" onClick={() => void q.refetch()}>Try again</Button></div>}
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {tab === "creative" ? originals.slice(currentPage * 8, currentPage * 8 + 8).map((t) => card(t.id, t.name, `${t.category} · Original`, t.values)) : tab === "basic" ? basics.slice(currentPage * 8, currentPage * 8 + 8).map((t) => card(t.name, t.name, t.category, { content_mode: "design", blocks: templateBlocks(t.index), theme: t.theme ?? {} })) : rows.slice(currentPage * 8, currentPage * 8 + 8).map((r) => card(r.id, r.name, r.category, fromRow(r), tab === "saved"))}
    </div>
    {!total && (["basic", "creative"].includes(tab) || (!q.isLoading && !q.error)) && <p className="py-10 text-center text-muted-foreground">{search || category !== "All categories" ? "No templates match your filters." : tab === "saved" ? "No saved templates yet." : "No ready-made designs are available yet."}</p>}
    {total > 0 && <div className="grid gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><span className="min-w-0 text-xs text-muted-foreground">{currentPage * 8 + 1}–{Math.min(total, (currentPage + 1) * 8)} of {total} templates</span><div className="flex shrink-0 items-center gap-3"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-xs text-muted-foreground">{currentPage + 1} / {pages}</span><Button variant="outline" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>}
    <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{previewTemplate?.name}</DialogTitle></DialogHeader>{previewTemplate && <><iframe title="Full template preview" sandbox="" referrerPolicy="no-referrer" srcDoc={renderEmail({ ...sample, ...previewTemplate.values, blocks: previewTemplate.values.blocks ?? [] }, "#", "Alex")} className="h-[60vh] w-full border bg-muted" /><Button onClick={() => { onPick(previewTemplate.values); setPreviewTemplate(null); }}>Edit this template<MousePointer2 className="size-4" /></Button></>}</DialogContent></Dialog>
  </section>;
}
