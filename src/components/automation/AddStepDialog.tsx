import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CATEGORY_META, LIBRARY_STEPS, type StepCategory } from "@/lib/automation-catalog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: string) => void;
  /** Restrict to one category, e.g. triggers only. */
  only?: StepCategory;
  /** Hide triggers — used when inserting into the middle of a journey. */
  hideTriggers?: boolean;
  title?: string;
  description?: string;
};

export function AddStepDialog({ open, onOpenChange, onPick, only, hideTriggers, title, description }: Props) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIBRARY_STEPS.filter(
      (d) =>
        (!only || d.category === only) &&
        (!hideTriggers || d.category !== "trigger") &&
        (!q ||
          d.label.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          (d.keywords ?? "").includes(q)),
    );
  }, [query, only, hideTriggers]);


  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{title ?? "Add a step"}</DialogTitle>
          <DialogDescription>{description ?? "Search for the step you want to add to this automation."}</DialogDescription>
        </DialogHeader>
        <div className="px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search steps..." className="pl-8" />
          </div>
        </div>
        <ScrollArea className="max-h-[420px] px-3 pb-4">
          <div className="space-y-1 px-2 pt-3">
            {items.map((d) => {
              const meta = CATEGORY_META[d.category];
              const Icon = d.icon;
              return (
                <button
                  key={d.type}
                  type="button"
                  onClick={() => {
                    onPick(d.type);
                    onOpenChange(false);
                    setQuery("");
                  }}
                  className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition hover:border-border hover:bg-accent/60"
                >
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", meta.soft, meta.text)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{d.label}</span>
                    <span className="block text-xs text-muted-foreground">{d.description}</span>
                  </span>
                  <span className="ml-auto shrink-0 self-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </span>
                </button>
              );
            })}
            {!items.length && <p className="px-2 py-6 text-sm text-muted-foreground">Nothing matches “{query}”.</p>}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
