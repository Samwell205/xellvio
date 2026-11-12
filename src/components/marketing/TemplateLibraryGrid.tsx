import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { COMPLEXITY_LABEL, GOAL_LABEL, type LibraryTemplate } from "@/lib/templates/library";
import { CATEGORY_META, type TemplateCategory } from "@/lib/marketing/template-catalog";
import { TemplatePreview } from "./TemplatePreview";

const TYPE_LABEL: Record<LibraryTemplate["type"], string> = {
  "landing-page": "Landing page",
  "signup-form": "Sign-up form",
  automation: "Automation",
};

export function TemplateCard({ t }: { t: LibraryTemplate }) {
  return (
    <div className="group relative flex flex-col rounded-2xl border border-border bg-card p-3 transition-colors hover:border-foreground/30 focus-within:ring-2 focus-within:ring-ring">
      <TemplatePreview category={t.category as TemplateCategory} slug={t.slug} label={t.label} />
      <div className="flex flex-1 flex-col px-3 pb-3 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {TYPE_LABEL[t.type]}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">{COMPLEXITY_LABEL[t.complexity]}</span>
      </div>
      <h3 className="mt-3 text-lg font-bold text-foreground">{t.label}</h3>
      <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
      <p className="mt-4 text-xs text-muted-foreground">{t.goals.map((g) => GOAL_LABEL[g]).join(" · ")}</p>
      <Link
        to="/templates/$category/$slug"
        params={{ category: t.category, slug: t.slug }}
        aria-label={`Preview template: ${t.label}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
      >
        Preview template <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      </div>
    </div>
  );
}

export function TemplateGrid({ items }: { items: LibraryTemplate[] }) {
  if (items.length === 0)
    return (
      <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No templates match those filters yet. Clear a filter to see the full library.
      </p>
    );
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((t) => (
        <TemplateCard key={`${t.category}-${t.slug}`} t={t} />
      ))}
    </div>
  );
}

export function CategoryLinks({ exclude }: { exclude?: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {(Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[])
        .filter((c) => c !== exclude)
        .map((c) => (
          <Link
            key={c}
            to={CATEGORY_META[c].path}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {CATEGORY_META[c].label}
          </Link>
        ))}
    </div>
  );
}
