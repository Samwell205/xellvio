import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { FONT_STACKS, buttonStyle, headingStyle, type Design } from "@/lib/website-design";

export type GalleryItem = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  design: Design;
  preview: {
    headline: string;
    sub?: string;
    cta: string;
    blocks?: string[];
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  items: GalleryItem[];
  onPick: (id: string) => void;
  onBlank: () => void;
};

function Thumb({ item }: { item: GalleryItem }) {
  const d = item.design;
  return (
    <div
      className="overflow-hidden"
      style={{
        background: d.background,
        color: d.text,
        fontFamily: FONT_STACKS[d.font],
        borderRadius: 10,
        padding: "1rem",
        minHeight: 176,
      }}
    >
      <div style={{ ...headingStyle(d, 1.05), fontWeight: 800 }}>{item.preview.headline}</div>
      {item.preview.sub ? (
        <p style={{ color: d.muted, fontSize: ".72rem", margin: ".35rem 0 0", lineHeight: 1.45 }}>{item.preview.sub}</p>
      ) : null}
      <div
        style={{
          marginTop: ".7rem",
          background: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: Math.min(d.radius, 12),
          padding: ".55rem",
        }}
      >
        <div style={{ height: 20, borderRadius: 6, border: `1px solid ${d.border}`, background: d.background }} />
        <div
          style={{
            ...buttonStyle(d),
            marginTop: ".45rem",
            padding: ".35rem",
            textAlign: "center",
            fontSize: ".7rem",
            fontWeight: 600,
          }}
        >
          {item.preview.cta}
        </div>
      </div>
      {item.preview.blocks?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: ".6rem" }}>
          {item.preview.blocks.map((b, i) => (
            <span
              key={i}
              style={{
                fontSize: ".6rem",
                color: d.muted,
                border: `1px solid ${d.border}`,
                borderRadius: 999,
                padding: "1px 6px",
              }}
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TemplateGallery({ open, onOpenChange, title, description, items, onPick, onBlank }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const cats = useMemo(() => ["All", ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const shown = items.filter(
    (i) =>
      (cat === "All" || i.category === cat) &&
      (q.trim() === "" || `${i.label} ${i.blurb} ${i.preview.headline}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="outline" onClick={onBlank}>Start from blank</Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} className="h-7 rounded-full px-3 text-xs" onClick={() => setCat(c)}>
              {c}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onPick(i.id)}
              className="group overflow-hidden rounded-xl border text-left transition hover:border-primary hover:shadow-md"
            >
              <Thumb item={i} />
              <div className="space-y-1 border-t p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{i.label}</span>
                  <Badge variant="outline" className="text-[10px]">{i.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{i.blurb}</p>
              </div>
            </button>
          ))}
          {shown.length === 0 && <p className="p-6 text-sm text-muted-foreground">No templates match that search.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
