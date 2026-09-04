import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export type GalleryItem = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  preview: {
    headline: string;
    sub?: string;
    cta: string;
    theme: "light" | "dark";
    accent: string;
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
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

        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <Badge
              key={c}
              variant={c === cat ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setCat(c)}
            >
              {c}
            </Badge>
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
              <div
                className="flex h-40 flex-col justify-center gap-2 p-4"
                style={{
                  background: i.preview.theme === "dark" ? "#0b1120" : "#f8fafc",
                  color: i.preview.theme === "dark" ? "#f8fafc" : "#0f172a",
                }}
              >
                <div className="text-sm font-semibold leading-snug">{i.preview.headline}</div>
                {i.preview.sub && <div className="text-[11px] opacity-70 leading-snug">{i.preview.sub}</div>}
                <div
                  className="mt-1 h-6 rounded-md border"
                  style={{ borderColor: i.preview.theme === "dark" ? "#334155" : "#cbd5e1" }}
                />
                <div
                  className="rounded-md px-2 py-1 text-center text-[11px] font-medium text-white"
                  style={{ background: i.preview.accent }}
                >
                  {i.preview.cta}
                </div>
              </div>
              <div className="space-y-1 border-t p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{i.label}</span>
                  <Badge variant="outline" className="text-[10px]">{i.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{i.blurb}</p>
              </div>
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No templates match that search.</p>}
      </DialogContent>
    </Dialog>
  );
}
