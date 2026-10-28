import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV } from "@/components/marketing/nav-data";

type Hit = { to: string; label: string; blurb: string; kind: "Pages" | "Resources" };

const EXTRA: Hit[] = [
  { to: "/pricing", label: "Pricing", blurb: "Pay as you go SMS and email pricing", kind: "Pages" },
  { to: "/features", label: "Features", blurb: "Everything Xellvio can do", kind: "Pages" },
  { to: "/contact", label: "Support center", blurb: "Get help from our team", kind: "Pages" },
  { to: "/auth", label: "Log in", blurb: "Sign in to your account", kind: "Pages" },
];

function buildIndex(): Hit[] {
  const out: Hit[] = [];
  for (const entry of NAV) {
    if (!("groups" in entry)) continue;
    const kind = entry.label === "Resources" ? "Resources" : "Pages";
    for (const g of entry.groups) for (const i of g.items) out.push({ to: i.to, label: i.label, blurb: i.blurb, kind });
  }
  for (const e of EXTRA) if (!out.some((o) => o.to === e.to)) out.push(e);
  return out;
}

export function SiteSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"All" | "Resources" | "Pages">("All");
  const [active, setActive] = useState(0);
  const index = useMemo(buildIndex, []);

  useEffect(() => { if (!open) { setQ(""); setActive(0); } }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return index.filter((h) => (filter === "All" || h.kind === filter) &&
      (!term || h.label.toLowerCase().includes(term) || h.blurb.toLowerCase().includes(term)));
  }, [q, filter, index]);

  const go = (h: Hit) => { onOpenChange(false); navigate({ to: h.to }); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 max-w-2xl gap-0 overflow-hidden rounded-3xl p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search Xellvio</DialogTitle>
        <div className="p-4">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-primary px-4 py-3">
            <Search className="size-5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && results[active]) go(results[active]);
              }}
              placeholder="Search..."
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex gap-2 border-t px-4 py-3">
          {(["All", "Resources", "Pages"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setActive(0); }}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${filter === f ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >{f}</button>
          ))}
        </div>
        <ul className="max-h-[50vh] overflow-y-auto border-t p-2">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">No results for “{q}”</li>}
          {results.map((h, i) => (
            <li key={h.to}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
                className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition-colors ${i === active ? "bg-muted" : ""}`}
              >
                <span>
                  <span className="block font-medium">{h.label}</span>
                  <span className="block text-sm text-muted-foreground">{h.blurb}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
