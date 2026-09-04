import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Trash2 } from "lucide-react";
import {
  type Block,
  type Styles,
  type Theme,
  BLOCK_LABELS,
  BRAND_PRESETS,
  FIELD_KINDS,
  FIELD_LABELS,
  FONT_STACKS,
  type FontKey,
} from "@/lib/builder/schema";
import { generateBuilderCopy } from "@/lib/builder-ai.functions";

const FONTS: FontKey[] = ["sans", "grotesk", "serif", "slab", "rounded", "mono"];
const FONT_NAMES: Record<FontKey, string> = {
  sans: "Clean sans",
  grotesk: "Neutral grotesk",
  serif: "Classic serif",
  slab: "Bold slab",
  rounded: "Friendly rounded",
  mono: "Technical mono",
};

const TOKENS = ["", "primary", "secondary", "background", "surface", "text", "heading", "muted", "border", "transparent"];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Num({ value, onChange, placeholder }: { value?: number; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return (
    <Input
      className="h-8 text-xs"
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
    />
  );
}

function ColorPick({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const isToken = !!value && !value.startsWith("#");
  return (
    <div className="flex items-center gap-1.5">
      <Select value={isToken ? value : value ? "custom" : ""} onValueChange={(v) => onChange(v === "custom" ? "#111827" : v || undefined)}>
        <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
        <SelectContent>
          {TOKENS.map((t) => (
            <SelectItem key={t || "none"} value={t || "none"} disabled={t === ""}>
              {t || "Default"}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {!isToken ? (
        <input
          type="color"
          className="size-8 shrink-0 cursor-pointer rounded border bg-transparent"
          value={value && value.startsWith("#") ? value : "#111827"}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------- panel ---------------------------------- */

export function PropertiesPanel({
  block,
  theme,
  kind,
  onChangeBlock,
  onChangeTheme,
  onDelete,
  onDuplicate,
  pageContext,
}: {
  block: Block | null;
  theme: Theme;
  kind: "form" | "page";
  onChangeBlock: (patch: (b: Block) => Block) => void;
  onChangeTheme: (t: Theme) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  pageContext: string;
}) {
  if (!block) return <GlobalStyles theme={theme} onChange={onChangeTheme} kind={kind} />;

  const setContent = (patch: Record<string, any>) => onChangeBlock((b) => ({ ...b, content: { ...b.content, ...patch } }));
  const setStyles = (patch: Styles) => onChangeBlock((b) => ({ ...b, styles: { ...b.styles, ...patch } }));
  const s = block.styles ?? {};

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">{BLOCK_LABELS[block.type]}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onDuplicate}>Duplicate</Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>

      <Tabs defaultValue="content" className="min-h-0 flex-1 overflow-hidden">
        <TabsList className="m-2 grid grid-cols-3">
          <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
          <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
          <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
        </TabsList>

        <div className="h-[calc(100%-3rem)] overflow-y-auto px-3 pb-8">
          <TabsContent value="content" className="mt-0 space-y-3">
            <ContentEditor block={block} setContent={setContent} pageContext={pageContext} />
          </TabsContent>

          <TabsContent value="style" className="mt-0 space-y-3">
            <Row label="Text colour"><ColorPick value={s.color} onChange={(color) => setStyles({ color })} /></Row>
            <Row label="Background"><ColorPick value={s.background} onChange={(background) => setStyles({ background })} /></Row>
            <Row label="Font size"><Num value={s.fontSize} onChange={(fontSize) => setStyles({ fontSize })} placeholder="auto" /></Row>
            <Row label="Mobile size"><Num value={s.mobileFontSize} onChange={(mobileFontSize) => setStyles({ mobileFontSize })} placeholder="auto" /></Row>
            <Row label="Weight">
              <Select value={String(s.fontWeight ?? "")} onValueChange={(v) => setStyles({ fontWeight: v ? Number(v) : undefined })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
                <SelectContent>
                  {[400, 500, 600, 700, 800, 900].map((w) => (
                    <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Line height"><Num value={s.lineHeight} onChange={(lineHeight) => setStyles({ lineHeight })} placeholder="1.5" /></Row>
            <Row label="Letter sp."><Num value={s.letterSpacing} onChange={(letterSpacing) => setStyles({ letterSpacing })} placeholder="0" /></Row>
            <Row label="Uppercase">
              <Switch checked={s.textTransform === "uppercase"} onCheckedChange={(v) => setStyles({ textTransform: v ? "uppercase" : "none" })} />
            </Row>
            <Row label="Corner radius"><Num value={s.radius} onChange={(radius) => setStyles({ radius })} placeholder="theme" /></Row>
            <Row label="Border width"><Num value={s.borderWidth} onChange={(borderWidth) => setStyles({ borderWidth })} placeholder="0" /></Row>
            <Row label="Border colour"><ColorPick value={s.borderColor} onChange={(borderColor) => setStyles({ borderColor })} /></Row>
            <Row label="Shadow"><Switch checked={!!s.shadow} onCheckedChange={(shadow) => setStyles({ shadow })} /></Row>
            <Row label="Opacity"><Num value={s.opacity} onChange={(opacity) => setStyles({ opacity })} placeholder="1" /></Row>
            {block.type === "section" ? (
              <Row label="Background image">
                <Input className="h-8 text-xs" value={s.backgroundImage ?? ""} placeholder="https://…" onChange={(e) => setStyles({ backgroundImage: e.target.value })} />
              </Row>
            ) : null}
          </TabsContent>

          <TabsContent value="layout" className="mt-0 space-y-3">
            <Row label="Alignment">
              <Select value={s.align ?? "left"} onValueChange={(v) => setStyles({ align: v as Styles["align"] })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Centre</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Padding Y"><Num value={s.paddingY} onChange={(paddingY) => setStyles({ paddingY })} /></Row>
            <Row label="Padding X"><Num value={s.paddingX} onChange={(paddingX) => setStyles({ paddingX })} /></Row>
            <Row label="Space above"><Num value={s.marginTop} onChange={(marginTop) => setStyles({ marginTop })} /></Row>
            <Row label="Space below"><Num value={s.marginBottom} onChange={(marginBottom) => setStyles({ marginBottom })} /></Row>
            <Row label="Max width"><Num value={s.maxWidth} onChange={(maxWidth) => setStyles({ maxWidth })} placeholder="theme" /></Row>
            <Row label="Min height"><Num value={s.minHeight} onChange={(minHeight) => setStyles({ minHeight })} /></Row>
            <Row label="Columns"><Num value={s.columns} onChange={(columns) => setStyles({ columns })} /></Row>
            <Row label="Mobile cols"><Num value={s.mobileColumns} onChange={(mobileColumns) => setStyles({ mobileColumns })} /></Row>
            <Row label="Gap"><Num value={s.gap} onChange={(gap) => setStyles({ gap })} /></Row>
            <Row label="Width">
              <Select value={s.width ?? "full"} onValueChange={(v) => setStyles({ width: v as Styles["width"] })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full width</SelectItem>
                  <SelectItem value="auto">Fit content</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Hide on mobile"><Switch checked={!!s.hideOnMobile} onCheckedChange={(hideOnMobile) => setStyles({ hideOnMobile })} /></Row>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/* ------------------------------ content editors ----------------------------- */

function AiTextButton({ text, context, onPick }: { text: string; context: string; onPick: (v: string) => void }) {
  const fn = useServerFn(generateBuilderCopy);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string[]>([]);

  const run = async (action: string) => {
    setBusy(true);
    try {
      const r = await fn({ data: { text, context, action: action as any } });
      if (r.options.length === 1) onPick(r.options[0]!);
      else setOptions(r.options);
    } catch (e: any) {
      toast.error(e?.message ?? "AI is unavailable right now");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[
          ["improve", "Improve"],
          ["shorter", "Shorter"],
          ["persuasive", "More persuasive"],
          ["professional", "Professional"],
          ["alternatives", "Alternatives"],
        ].map(([a, l]) => (
          <Button key={a} type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" disabled={busy} onClick={() => run(a!)}>
            <Sparkles className="size-3" />
            {l}
          </Button>
        ))}
      </div>
      {options.length ? (
        <div className="space-y-1 rounded-md border p-2">
          {options.map((o, i) => (
            <button
              key={i}
              type="button"
              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              onClick={() => {
                onPick(o);
                setOptions([]);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemsEditor({
  items,
  fields,
  onChange,
  blank,
}: {
  items: any[];
  fields: { key: string; label: string; area?: boolean }[];
  onChange: (items: any[]) => void;
  blank: Record<string, any>;
}) {
  const set = (i: number, patch: Record<string, any>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="space-y-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Item {i + 1}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="size-6 text-xs" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</Button>
            </div>
          </div>
          {fields.map((f) =>
            f.area ? (
              <Textarea key={f.key} rows={2} className="text-xs" placeholder={f.label} value={it[f.key] ?? ""} onChange={(e) => set(i, { [f.key]: e.target.value })} />
            ) : (
              <Input key={f.key} className="h-8 text-xs" placeholder={f.label} value={it[f.key] ?? ""} onChange={(e) => set(i, { [f.key]: e.target.value })} />
            ),
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => onChange([...items, { ...blank }])}>Add item</Button>
    </div>
  );
}

function ContentEditor({ block, setContent, pageContext }: { block: Block; setContent: (p: Record<string, any>) => void; pageContext: string }) {
  const c = block.content ?? {};
  switch (block.type) {
    case "heading":
      return (
        <>
          <Textarea rows={2} value={c.text ?? ""} onChange={(e) => setContent({ text: e.target.value })} />
          <Row label="Level">
            <Select value={String(c.level ?? 2)} onValueChange={(v) => setContent({ level: Number(v) })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((l) => <SelectItem key={l} value={String(l)}>H{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <AiTextButton text={c.text ?? ""} context={pageContext} onPick={(text) => setContent({ text })} />
        </>
      );
    case "text":
      return (
        <>
          <Textarea rows={5} value={c.text ?? ""} onChange={(e) => setContent({ text: e.target.value })} />
          <AiTextButton text={c.text ?? ""} context={pageContext} onPick={(text) => setContent({ text })} />
        </>
      );
    case "image":
    case "logo":
      return (
        <>
          <Row label="Image URL"><Input className="h-8 text-xs" value={c.url ?? ""} placeholder="https://…" onChange={(e) => setContent({ url: e.target.value })} /></Row>
          <Row label="Alt text"><Input className="h-8 text-xs" value={c.alt ?? ""} onChange={(e) => setContent({ alt: e.target.value })} /></Row>
          {c.url ? <img src={c.url} alt="" className="max-h-28 rounded border object-contain" /> : null}
        </>
      );
    case "icon":
      return <Row label="Icon"><Input className="h-8 text-xs" value={c.glyph ?? ""} onChange={(e) => setContent({ glyph: e.target.value })} /></Row>;
    case "video":
      return <Row label="Video URL"><Input className="h-8 text-xs" value={c.url ?? ""} placeholder="YouTube or Vimeo link" onChange={(e) => setContent({ url: e.target.value })} /></Row>;
    case "html":
      return <Textarea rows={8} className="font-mono text-xs" value={c.html ?? ""} onChange={(e) => setContent({ html: e.target.value })} />;
    case "social":
      return <ItemsEditor items={c.items ?? []} onChange={(items) => setContent({ items })} blank={{ label: "Instagram", url: "#" }} fields={[{ key: "label", label: "Label" }, { key: "url", label: "URL" }]} />;
    case "button":
      return (
        <>
          <Row label="Label"><Input className="h-8 text-xs" value={c.label ?? ""} onChange={(e) => setContent({ label: e.target.value })} /></Row>
          <Row label="Link"><Input className="h-8 text-xs" value={c.url ?? ""} onChange={(e) => setContent({ url: e.target.value })} /></Row>
          <AiTextButton text={c.label ?? ""} context={`${pageContext}\nThis is a call-to-action button label.`} onPick={(label) => setContent({ label })} />
        </>
      );
    case "submit":
      return (
        <>
          <Row label="Label"><Input className="h-8 text-xs" value={c.label ?? ""} onChange={(e) => setContent({ label: e.target.value })} /></Row>
          <AiTextButton text={c.label ?? ""} context={`${pageContext}\nThis is the sign-up button label.`} onPick={(label) => setContent({ label })} />
        </>
      );
    case "field":
      return (
        <>
          <Row label="Field type">
            <Select value={c.kind ?? "email"} onValueChange={(kind) => setContent({ kind, label: FIELD_LABELS[kind as keyof typeof FIELD_LABELS] })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_KINDS.map((k) => <SelectItem key={k} value={k}>{FIELD_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Label"><Input className="h-8 text-xs" value={c.label ?? ""} onChange={(e) => setContent({ label: e.target.value })} /></Row>
          <Row label="Placeholder"><Input className="h-8 text-xs" value={c.placeholder ?? ""} onChange={(e) => setContent({ placeholder: e.target.value })} /></Row>
          <Row label="Help text"><Input className="h-8 text-xs" value={c.help ?? ""} onChange={(e) => setContent({ help: e.target.value })} /></Row>
          <Row label="Required"><Switch checked={!!c.required} onCheckedChange={(required) => setContent({ required })} /></Row>
          {["select", "radio"].includes(c.kind) ? (
            <div>
              <Label className="text-[11px] text-muted-foreground">Options (one per line)</Label>
              <Textarea rows={4} className="text-xs" value={(c.options ?? []).join("\n")} onChange={(e) => setContent({ options: e.target.value.split("\n").filter(Boolean) })} />
            </div>
          ) : null}
        </>
      );
    case "form":
      return (
        <>
          <Row label="After signup">
            <Select value={c.successMode ?? "message"} onValueChange={(successMode) => setContent({ successMode })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="message">Show a message</SelectItem>
                <SelectItem value="redirect">Redirect to a URL</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {c.successMode === "redirect" ? (
            <Row label="Redirect to"><Input className="h-8 text-xs" value={c.redirectUrl ?? ""} placeholder="https://…" onChange={(e) => setContent({ redirectUrl: e.target.value })} /></Row>
          ) : (
            <div>
              <Label className="text-[11px] text-muted-foreground">Success message</Label>
              <Textarea rows={2} className="text-xs" value={c.successMessage ?? ""} onChange={(e) => setContent({ successMessage: e.target.value })} />
            </div>
          )}
          <div>
            <Label className="text-[11px] text-muted-foreground">Consent text</Label>
            <Textarea rows={4} className="text-xs" value={c.consentText ?? ""} onChange={(e) => setContent({ consentText: e.target.value })} />
          </div>
        </>
      );
    case "features":
      return <ItemsEditor items={c.items ?? []} onChange={(items) => setContent({ items })} blank={{ icon: "★", title: "New benefit", body: "Say why it matters." }} fields={[{ key: "icon", label: "Icon" }, { key: "title", label: "Title" }, { key: "body", label: "Description", area: true }]} />;
    case "testimonials":
      return <ItemsEditor items={c.items ?? []} onChange={(items) => setContent({ items })} blank={{ quote: "Great results.", author: "Customer", role: "" }} fields={[{ key: "quote", label: "Quote", area: true }, { key: "author", label: "Author" }, { key: "role", label: "Role" }]} />;
    case "faq":
      return <ItemsEditor items={c.items ?? []} onChange={(items) => setContent({ items })} blank={{ q: "New question?", a: "The answer." }} fields={[{ key: "q", label: "Question" }, { key: "a", label: "Answer", area: true }]} />;
    case "stats":
      return <ItemsEditor items={c.items ?? []} onChange={(items) => setContent({ items })} blank={{ value: "100+", label: "Customers" }} fields={[{ key: "value", label: "Value" }, { key: "label", label: "Label" }]} />;
    case "pricing":
      return (
        <div className="space-y-3">
          {(c.items ?? []).map((it: any, i: number) => (
            <div key={i} className="space-y-2 rounded-md border p-2">
              <Input className="h-8 text-xs" placeholder="Plan name" value={it.name ?? ""} onChange={(e) => setContent({ items: c.items.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-8 text-xs" placeholder="$29" value={it.price ?? ""} onChange={(e) => setContent({ items: c.items.map((x: any, j: number) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                <Input className="h-8 text-xs" placeholder="/mo" value={it.period ?? ""} onChange={(e) => setContent({ items: c.items.map((x: any, j: number) => (j === i ? { ...x, period: e.target.value } : x)) })} />
              </div>
              <Textarea rows={3} className="text-xs" placeholder="One feature per line" value={(it.features ?? []).join("\n")} onChange={(e) => setContent({ items: c.items.map((x: any, j: number) => (j === i ? { ...x, features: e.target.value.split("\n").filter(Boolean) } : x)) })} />
              <Input className="h-8 text-xs" placeholder="Button label" value={it.cta ?? ""} onChange={(e) => setContent({ items: c.items.map((x: any, j: number) => (j === i ? { ...x, cta: e.target.value } : x)) })} />
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Highlight this plan</Label>
                <Switch checked={!!it.featured} onCheckedChange={(v) => setContent({ items: c.items.map((x: any, j: number) => (j === i ? { ...x, featured: v } : x)) })} />
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs text-destructive" onClick={() => setContent({ items: c.items.filter((_: any, j: number) => j !== i) })}>Remove plan</Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setContent({ items: [...(c.items ?? []), { name: "Plan", price: "$0", period: "/mo", features: ["Feature"], cta: "Choose", featured: false }] })}>Add plan</Button>
        </div>
      );
    case "countdown":
      return (
        <>
          <Row label="Label"><Input className="h-8 text-xs" value={c.label ?? ""} onChange={(e) => setContent({ label: e.target.value })} /></Row>
          <Row label="Ends at"><Input className="h-8 text-xs" type="datetime-local" value={c.endsAt ?? ""} onChange={(e) => setContent({ endsAt: e.target.value })} /></Row>
        </>
      );
    default:
      return <p className="text-xs text-muted-foreground">Use the Style and Layout tabs to design this {BLOCK_LABELS[block.type].toLowerCase()}. Drag elements into it from the left.</p>;
  }
}

/* ------------------------------- global styles ------------------------------ */

function GlobalStyles({ theme, onChange, kind }: { theme: Theme; onChange: (t: Theme) => void; kind: "form" | "page" }) {
  const set = (p: Partial<Theme>) => onChange({ ...theme, ...p });
  const colors: { key: keyof Theme; label: string }[] = [
    { key: "primary", label: "Primary" },
    { key: "primaryText", label: "On primary" },
    { key: "secondary", label: "Secondary" },
    { key: "background", label: "Background" },
    { key: "surface", label: "Cards" },
    { key: "heading", label: "Headings" },
    { key: "text", label: "Body text" },
    { key: "muted", label: "Muted text" },
    { key: "border", label: "Borders" },
  ];
  return (
    <div className="h-full space-y-4 overflow-y-auto p-3 pb-10">
      <div>
        <p className="text-xs font-semibold">Global styles</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Nothing selected. These settings apply to the whole {kind === "form" ? "form" : "page"}. Click any element on the canvas to edit it.
        </p>
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground">Style presets</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {BRAND_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange({ ...p.theme })}
              className="rounded-lg border p-2 text-left transition hover:border-primary"
            >
              <div className="mb-1.5 flex gap-1">
                {[p.theme.background, p.theme.surface, p.theme.primary, p.theme.heading].map((c, i) => (
                  <span key={i} className="size-3.5 rounded-full border" style={{ background: c }} />
                ))}
              </div>
              <div className="text-[11px] font-semibold">{p.label}</div>
              <div className="text-[10px] text-muted-foreground">{p.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {colors.map((c) => (
          <Row key={String(c.key)} label={c.label}>
            <div className="flex items-center gap-2">
              <input type="color" className="size-8 cursor-pointer rounded border bg-transparent" value={String(theme[c.key])} onChange={(e) => set({ [c.key]: e.target.value } as Partial<Theme>)} />
              <Input className="h-8 text-xs" value={String(theme[c.key])} onChange={(e) => set({ [c.key]: e.target.value } as Partial<Theme>)} />
            </div>
          </Row>
        ))}
      </div>

      <Row label="Heading font">
        <Select value={theme.headingFont} onValueChange={(v) => set({ headingFont: v as FontKey })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => (
              <SelectItem key={f} value={f}><span style={{ fontFamily: FONT_STACKS[f] }}>{FONT_NAMES[f]}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Body font">
        <Select value={theme.bodyFont} onValueChange={(v) => set({ bodyFont: v as FontKey })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => (
              <SelectItem key={f} value={f}><span style={{ fontFamily: FONT_STACKS[f] }}>{FONT_NAMES[f]}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Base size"><Num value={theme.baseFontSize} onChange={(v) => set({ baseFontSize: v ?? 16 })} /></Row>
      <Row label="Button style">
        <Select value={theme.buttonStyle} onValueChange={(v) => set({ buttonStyle: v as Theme["buttonStyle"] })}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="outline">Outline</SelectItem>
            <SelectItem value="pill">Pill</SelectItem>
            <SelectItem value="soft">Soft</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Card radius"><Num value={theme.radius} onChange={(v) => set({ radius: v ?? 16 })} /></Row>
      <Row label="Input radius"><Num value={theme.inputRadius} onChange={(v) => set({ inputRadius: v ?? 12 })} /></Row>
      <Row label="Button radius"><Num value={theme.buttonRadius} onChange={(v) => set({ buttonRadius: v ?? 12 })} /></Row>
      <Row label="Content width"><Num value={theme.maxWidth} onChange={(v) => set({ maxWidth: v ?? 1100 })} /></Row>
      <Row label="Shadows"><Switch checked={theme.shadow} onCheckedChange={(shadow) => set({ shadow })} /></Row>
    </div>
  );
}
