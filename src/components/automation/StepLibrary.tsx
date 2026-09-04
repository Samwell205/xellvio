import { useMemo, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CATEGORY_META, CATEGORY_ORDER, CATEGORY_TITLES, LIBRARY_STEPS, type StepDefinition } from "@/lib/automation-catalog";
import { cn } from "@/lib/utils";

type Props = {
  onAdd: (type: string) => void;
  collapsed: boolean;
  onToggle: () => void;
};

export function StepLibrary({ onAdd, collapsed, onToggle }: Props) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (d: StepDefinition) =>
      !q ||
      d.label.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.type.includes(q) ||
      (d.keywords ?? "").includes(q);
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: LIBRARY_STEPS.filter((d) => d.category === cat && match(d)),
    })).filter((g) => g.items.length);
  }, [query]);

  if (collapsed) {
    return (
      <div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r bg-card py-3">
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Open step library">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold tracking-tight">Add step</h2>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse step library">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search steps..."
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-5 px-3 pb-8">
          {grouped.map(({ cat, items }) => {
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat}>
                <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {CATEGORY_TITLES[cat]}
                </p>
                <div className="space-y-1">
                  {items.map((d) => {
                    const Icon = d.icon;
                    return (
                      <button
                        key={d.type}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/xellvio-step", d.type);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onAdd(d.type)}
                        className="group flex w-full cursor-grab items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-all hover:border-border hover:bg-accent/60 active:cursor-grabbing"
                      >
                        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", meta.soft, meta.text)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium leading-tight">{d.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{d.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!grouped.length && <p className="px-2 py-6 text-sm text-muted-foreground">No steps match “{query}”.</p>}
        </div>
      </ScrollArea>
    </aside>
  );
}
