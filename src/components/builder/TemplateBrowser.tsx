import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Heart, Search, Sparkles } from "lucide-react";
import { type BuilderTemplate, categoriesFor, instantiate, templatesFor } from "@/lib/builder/templates";
import { type Block, type Theme } from "@/lib/builder/schema";
import { BlockCanvas } from "./BlockRenderer";

const FAV_KEY = "xellvio.builder.favourites";

function readFavs(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function Thumb({ template, height = 260 }: { template: BuilderTemplate; height?: number }) {
  return (
    <div className="pointer-events-none overflow-hidden rounded-lg border bg-muted" style={{ height }}>
      <div style={{ width: 1200, transform: "scale(.31)", transformOrigin: "top left", height: height / 0.31 }}>
        <BlockCanvas blocks={template.blocks} theme={template.theme} />
      </div>
    </div>
  );
}

export function TemplateBrowser({
  kind,
  hasContent,
  onUse,
  onClose,
  onAi,
}: {
  kind: "form" | "page";
  hasContent: boolean;
  onUse: (blocks: Block[], theme: Theme, name: string) => void;
  onClose: () => void;
  onAi?: () => void;
}) {
  const all = templatesFor(kind);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [favs, setFavs] = useState<string[]>(() => (typeof window === "undefined" ? [] : readFavs()));
  const [preview, setPreview] = useState<BuilderTemplate | null>(null);
  const [confirm, setConfirm] = useState<BuilderTemplate | null>(null);

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return all
      .filter((t) => (cat === "All" ? true : cat === "Favourites" ? favs.includes(t.id) : t.category === cat))
      .filter((t) => !query || `${t.label} ${t.category} ${t.blurb}`.toLowerCase().includes(query));
  }, [all, q, cat, favs]);

  const apply = (t: BuilderTemplate) => {
    const { blocks, theme } = instantiate(t);
    onUse(blocks, theme, t.label);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[92vh] max-w-[94vw] flex-col gap-0 p-0 sm:max-w-[94vw]">
        <DialogTitle className="sr-only">Templates</DialogTitle>

        {preview ? (
          <>
            <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{preview.label}</p>
                <p className="truncate text-xs text-muted-foreground">{preview.blurb}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>Back</Button>
                <Button onClick={() => (hasContent ? setConfirm(preview) : apply(preview))}>Use template</Button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-4">
              <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border bg-background shadow-sm">
                <BlockCanvas blocks={preview.blocks} theme={preview.theme} />
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="space-y-3 border-b px-4 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{kind === "form" ? "Sign-up form templates" : "Landing page templates"}</p>
                  <p className="truncate text-xs text-muted-foreground">Every template is fully editable — pick one and change anything.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {onAi ? (
                    <Button variant="outline" className="gap-1.5" onClick={onAi}><Sparkles className="size-4" />Design with AI</Button>
                  ) : null}
                  <Button variant="ghost" onClick={onClose}>Close</Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-8 pl-8 text-sm" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {["Favourites", ...categoriesFor(kind)].map((c) => (
                  <Badge
                    key={c}
                    variant={cat === c ? "default" : "outline"}
                    className="cursor-pointer text-[11px]"
                    onClick={() => setCat(c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {shown.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">No templates match that search.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.map((t) => (
                    <div key={t.id} className="group overflow-hidden rounded-xl border bg-card transition hover:shadow-md">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Preview ${t.label}`}
                        className="block w-full cursor-pointer text-left"
                        onClick={() => setPreview(t)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPreview(t)}
                      >
                        <Thumb template={t} />
                      </div>

                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{t.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{t.category} · {t.blurb}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFav(t.id)}
                          aria-label="Favourite"
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary"
                        >
                          <Heart className={`size-4 ${favs.includes(t.id) ? "fill-primary text-primary" : ""}`} />
                        </button>
                      </div>
                      <div className="flex gap-2 border-t p-3">
                        <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setPreview(t)}>Preview</Button>
                        <Button size="sm" className="flex-1 text-xs" onClick={() => (hasContent ? setConfirm(t) : apply(t))}>Use template</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {confirm ? (
          <div className="absolute inset-0 z-50 grid place-items-center bg-background/80 p-6">
            <div className="w-full max-w-sm space-y-3 rounded-xl border bg-card p-5 shadow-lg">
              <p className="text-sm font-semibold">Using this template will replace your current design.</p>
              <p className="text-xs text-muted-foreground">You can undo straight away with Ctrl/Cmd + Z.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    apply(confirm);
                    setConfirm(null);
                  }}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
