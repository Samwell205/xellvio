import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { AUTOMATION_TEMPLATES } from "@/lib/automation-templates";
import { stepDef } from "@/lib/automation-catalog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (templateId: string) => void;
  /** Warn when applying will replace what is already on the canvas. */
  replacing?: boolean;
};

const TAGS = ["All", "Welcome", "Keywords", "Re-engagement", "Dates", "Sales", "Compliance"] as const;

export function TemplatePicker({ open, onOpenChange, onPick, replacing }: Props) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<(typeof TAGS)[number]>("All");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AUTOMATION_TEMPLATES.filter(
      (t) =>
        (tag === "All" || t.tag === tag) &&
        (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
  }, [query, tag]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Start from a ready-made journey
          </DialogTitle>
          <DialogDescription>
            {replacing
              ? "Applying a template replaces what is on the canvas — you can undo it straight after."
              : "Every step stays fully editable once applied."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search journeys..." className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  tag === t ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="max-h-[460px] px-3 pb-5">
          <div className="grid gap-2 px-2 pt-3 sm:grid-cols-2">
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onPick(t.id)}
                className="rounded-xl border p-3 text-left transition hover:border-primary/60 hover:bg-accent/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {t.tag}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.nodes.slice(0, 5).map((n) => (
                    <span key={n.key} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {stepDef(n.type).label}
                    </span>
                  ))}
                  {t.nodes.length > 5 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      +{t.nodes.length - 5} more
                    </span>
                  )}
                </div>
              </button>
            ))}
            {!items.length && <p className="px-2 py-6 text-sm text-muted-foreground">No journeys match that search.</p>}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
