import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SECTION_LABELS, blankSection, type Section, type SectionType } from "@/lib/website-design";
import { ImageField } from "./DesignControls";

type Props = { sections: Section[]; onChange: (s: Section[]) => void };

export function SectionEditor({ sections, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null);

  const patch = (id: string, p: Record<string, unknown>) =>
    onChange(sections.map((s) => (s.id === id ? ({ ...s, ...p } as Section) : s)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...sections];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
    onChange(next);
  };
  const add = (t: SectionType) => {
    const s = blankSection(t);
    onChange([...sections, s]);
    setOpenId(s.id);
  };

  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        const open = openId === s.id;
        return (
          <div key={s.id} className="rounded-lg border">
            <div className="flex items-center gap-1 p-2">
              <button type="button" className="flex-1 truncate text-left text-sm font-medium" onClick={() => setOpenId(open ? null : s.id)}>
                {SECTION_LABELS[s.type]}
              </button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="size-4" /></Button>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => onChange(sections.filter((x) => x.id !== s.id))} aria-label="Delete section">
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>

            {open && (
              <div className="space-y-3 border-t p-3">
                {s.type === "hero" && (
                  <>
                    <div><Label className="text-xs">Headline</Label><Input value={s.headline} maxLength={160} onChange={(e) => patch(s.id, { headline: e.target.value })} /></div>
                    <div><Label className="text-xs">Sub-headline</Label><Input value={s.subheadline} maxLength={240} onChange={(e) => patch(s.id, { subheadline: e.target.value })} /></div>
                    <div><Label className="text-xs">Extra text</Label><Textarea rows={3} value={s.body} maxLength={2000} onChange={(e) => patch(s.id, { body: e.target.value })} /></div>
                    <ImageField label="Hero image" hint="Paste any image link." value={s.imageUrl} onChange={(v) => patch(s.id, { imageUrl: v })} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Alignment</Label>
                        <Select value={s.align} onValueChange={(v) => patch(s.id, { align: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="left">Side by side</SelectItem><SelectItem value="center">Centred</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end justify-between gap-2 rounded-lg border p-2">
                        <span className="text-xs">Show sign-up box</span>
                        <Switch checked={s.showForm} onCheckedChange={(v) => patch(s.id, { showForm: v })} />
                      </div>
                    </div>
                  </>
                )}

                {s.type === "text" && (
                  <>
                    <div><Label className="text-xs">Heading</Label><Input value={s.heading} maxLength={120} onChange={(e) => patch(s.id, { heading: e.target.value })} /></div>
                    <div><Label className="text-xs">Text</Label><Textarea rows={4} value={s.body} maxLength={3000} onChange={(e) => patch(s.id, { body: e.target.value })} /></div>
                  </>
                )}

                {s.type === "image" && (
                  <>
                    <ImageField label="Image link" value={s.url} onChange={(v) => patch(s.id, { url: v })} />
                    <div><Label className="text-xs">Description for screen readers</Label><Input value={s.alt} maxLength={160} onChange={(e) => patch(s.id, { alt: e.target.value })} /></div>
                    <div><Label className="text-xs">Caption</Label><Input value={s.caption} maxLength={160} onChange={(e) => patch(s.id, { caption: e.target.value })} /></div>
                  </>
                )}

                {s.type === "features" && (
                  <>
                    <div><Label className="text-xs">Heading</Label><Input value={s.heading} maxLength={120} onChange={(e) => patch(s.id, { heading: e.target.value })} /></div>
                    {s.items.map((it, idx) => (
                      <div key={idx} className="space-y-2 rounded-md border p-2">
                        <Input
                          placeholder="Title"
                          value={it.title}
                          maxLength={80}
                          onChange={(e) => patch(s.id, { items: s.items.map((x, k) => (k === idx ? { ...x, title: e.target.value } : x)) })}
                        />
                        <Textarea
                          rows={2}
                          placeholder="Short description"
                          value={it.body}
                          maxLength={240}
                          onChange={(e) => patch(s.id, { items: s.items.map((x, k) => (k === idx ? { ...x, body: e.target.value } : x)) })}
                        />
                        <Button variant="ghost" size="sm" onClick={() => patch(s.id, { items: s.items.filter((_, k) => k !== idx) })}>Remove</Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => patch(s.id, { items: [...s.items, { title: "New benefit", body: "" }] })}>
                      <Plus className="mr-1 size-3" />Add benefit
                    </Button>
                  </>
                )}

                {s.type === "quote" && (
                  <>
                    <div><Label className="text-xs">Quote</Label><Textarea rows={3} value={s.text} maxLength={400} onChange={(e) => patch(s.id, { text: e.target.value })} /></div>
                    <div><Label className="text-xs">Who said it</Label><Input value={s.author} maxLength={80} onChange={(e) => patch(s.id, { author: e.target.value })} /></div>
                  </>
                )}

                {s.type === "faq" && (
                  <>
                    <div><Label className="text-xs">Heading</Label><Input value={s.heading} maxLength={120} onChange={(e) => patch(s.id, { heading: e.target.value })} /></div>
                    {s.items.map((it, idx) => (
                      <div key={idx} className="space-y-2 rounded-md border p-2">
                        <Input
                          placeholder="Question"
                          value={it.q}
                          maxLength={160}
                          onChange={(e) => patch(s.id, { items: s.items.map((x, k) => (k === idx ? { ...x, q: e.target.value } : x)) })}
                        />
                        <Textarea
                          rows={2}
                          placeholder="Answer"
                          value={it.a}
                          maxLength={500}
                          onChange={(e) => patch(s.id, { items: s.items.map((x, k) => (k === idx ? { ...x, a: e.target.value } : x)) })}
                        />
                        <Button variant="ghost" size="sm" onClick={() => patch(s.id, { items: s.items.filter((_, k) => k !== idx) })}>Remove</Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => patch(s.id, { items: [...s.items, { q: "New question", a: "" }] })}>
                      <Plus className="mr-1 size-3" />Add question
                    </Button>
                  </>
                )}

                {s.type === "signup" && (
                  <>
                    <div><Label className="text-xs">Heading above the box</Label><Input value={s.heading} maxLength={120} onChange={(e) => patch(s.id, { heading: e.target.value })} /></div>
                    <div><Label className="text-xs">Small note</Label><Input value={s.note} maxLength={200} onChange={(e) => patch(s.id, { note: e.target.value })} /></div>
                  </>
                )}

                {s.type === "footer" && (
                  <div><Label className="text-xs">Footer text</Label><Textarea rows={2} value={s.text} maxLength={400} onChange={(e) => patch(s.id, { text: e.target.value })} /></div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-lg border border-dashed p-3">
        <Label className="text-xs text-muted-foreground">Add a section</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(SECTION_LABELS) as SectionType[]).map((t) => (
            <Button key={t} variant="outline" size="sm" className="text-xs" onClick={() => add(t)}>
              <Plus className="mr-1 size-3" />{SECTION_LABELS[t].split(" (")[0]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
