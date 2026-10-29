import { useState } from "react";
import { ArrowDown, ArrowUp, Heading1, ImageIcon, Minus, MousePointer2, Plus, Smartphone, Monitor, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MediaLibraryDialog } from "@/components/builder/MediaPicker";
import { renderEmail, type EmailBlock, type EmailDraft } from "@/lib/email-campaign-rules";

export const EMAIL_TEMPLATES: { name: string; blocks: Omit<EmailBlock, "id">[] }[] = [
  { name: "Announcement", blocks: [ { type: "heading", text: "Something good is here.", url: "" }, { type: "text", text: "Hi {{first_name}},\n\nWe have something new to share with you. Here is what you need to know.", url: "" }, { type: "button", text: "Discover more", url: "" } ] },
  { name: "Newsletter", blocks: [ { type: "heading", text: "Your monthly update", url: "" }, { type: "text", text: "Hi {{first_name}},\n\nA fresh collection of news, stories and updates from our team.", url: "" }, { type: "divider", text: "", url: "" }, { type: "heading", text: "In the spotlight", url: "" }, { type: "text", text: "Share your featured story here.", url: "" }, { type: "button", text: "Read the story", url: "" } ] },
  { name: "Welcome", blocks: [ { type: "heading", text: "Welcome to the family.", url: "" }, { type: "text", text: "Hi {{first_name}},\n\nThank you for joining us. We're glad you're here. Look out for useful updates, news and offers.", url: "" }, { type: "button", text: "Explore our website", url: "" } ] },
];
export function templateBlocks(index: number): EmailBlock[] {
  return (EMAIL_TEMPLATES[index]?.blocks ?? []).map((b) => ({ ...b, id: crypto.randomUUID() }));
}
const TOOLS = [{ type: "heading", icon: Heading1, label: "Heading" }, { type: "text", icon: Type, label: "Text" }, { type: "image", icon: ImageIcon, label: "Image" }, { type: "button", icon: MousePointer2, label: "Button" }, { type: "divider", icon: Minus, label: "Divider" }] as const;
export function EmailDesigner({ draft, onChange }: { draft: EmailDraft; onChange: (blocks: EmailBlock[]) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [media, setMedia] = useState(false);
  const block = draft.blocks.find((b) => b.id === selected);
  function patch(value: Partial<EmailBlock>) { onChange(draft.blocks.map((b) => b.id === selected ? { ...b, ...value } : b)); }
  function move(delta: number) {
    const i = draft.blocks.findIndex((b) => b.id === selected); const next = i + delta;
    if (i < 0 || next < 0 || next >= draft.blocks.length) return;
    const blocks = [...draft.blocks]; const a = blocks[i]; const b = blocks[next];
    if (!a || !b) return; blocks[i] = b; blocks[next] = a; onChange(blocks);
  }
  return <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside className="space-y-5">
      <div className="space-y-2"><h3 className="text-sm font-semibold">Add a block</h3><div className="flex flex-wrap gap-1.5">{TOOLS.map((t) => <Button key={t.type} size="sm" variant="outline" title={t.label} onClick={() => {
        const id = crypto.randomUUID(); onChange([...draft.blocks, { id, type: t.type, text: t.type === "heading" ? "Your heading" : t.type === "button" ? "Learn more" : t.type === "text" ? "Write your message here." : "", url: "" }]); setSelected(id);
      }}><t.icon className="size-4" />{t.label}</Button>)}</div></div>
      <div className="space-y-1">{draft.blocks.map((b, i) => <Button key={b.id} variant={selected === b.id ? "secondary" : "ghost"} className="w-full justify-start overflow-hidden" onClick={() => setSelected(b.id)}><span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><span className="truncate">{b.text || b.type}</span></Button>)}</div>
      {block && <div className="space-y-3 border-t pt-4"><div className="flex items-center justify-between"><h3 className="font-semibold capitalize">{block.type}</h3><div className="flex"><Button size="icon" variant="ghost" title="Move up" onClick={() => move(-1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" title="Move down" onClick={() => move(1)}><ArrowDown className="size-4" /></Button><Button size="icon" variant="ghost" title="Delete block" onClick={() => { onChange(draft.blocks.filter((b) => b.id !== block.id)); setSelected(null); }}><Trash2 className="size-4 text-destructive" /></Button></div></div>
        {block.type !== "divider" && <><Label htmlFor="block-text">{block.type === "image" ? "Image description" : "Content"}</Label><Textarea id="block-text" rows={5} value={block.text} onChange={(e) => patch({ text: e.target.value })} /></>}
        {["image", "button"].includes(block.type) && <><Label htmlFor="block-url">{block.type === "image" ? "Image URL" : "Destination URL"}</Label><Input id="block-url" placeholder="https://" value={block.url} onChange={(e) => patch({ url: e.target.value })} />{block.type === "image" && <Button variant="outline" className="w-full" onClick={() => setMedia(true)}><ImageIcon className="size-4" />Choose or upload image</Button>}</>}
        {block.type === "text" && <Button variant="outline" size="sm" onClick={() => patch({ text: `${block.text} {{first_name}}` })}><Plus className="size-3" />First name</Button>}
      </div>}
    </aside>
    <section className="min-w-0 bg-muted/60 p-3 md:p-5"><div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">EMAIL PREVIEW</span><div className="flex gap-1"><Button size="icon" variant={mobile ? "ghost" : "secondary"} title="Desktop preview" onClick={() => setMobile(false)}><Monitor className="size-4" /></Button><Button size="icon" variant={mobile ? "secondary" : "ghost"} title="Phone preview" onClick={() => setMobile(true)}><Smartphone className="size-4" /></Button></div></div>
      <iframe title="Email design preview" sandbox="" srcDoc={renderEmail(draft, "https://xellvio.com", "Alex")} className={`mx-auto h-[680px] w-full border-0 bg-card ${mobile ? "max-w-[360px]" : "max-w-[620px]"}`} />
    </section>
    <MediaLibraryDialog open={media} onOpenChange={setMedia} onPick={(url) => patch({ url })} />
  </div>;
}