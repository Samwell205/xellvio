import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { INDUSTRIES } from "@/components/marketing/industries";
import { CATEGORY_META, PUBLIC_TEMPLATES, type TemplateCategory } from "@/lib/marketing/template-catalog";
import {
  GOAL_LABEL,
  INDUSTRY_LABEL,
  MIN_COLLECTION_SIZE,
  templatesByGoal,
  templatesByIndustry,
  type Goal,
  type Industry,
} from "@/lib/templates/library";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/seo";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

/**
 * Published, explicitly indexable tenant landing pages. Only presentation-free
 * fields are read (slug + timestamp), never contacts or submissions, and drafts
 * or pages a tenant marked non-indexable are excluded.
 */
async function publishedLandingPages(): Promise<SitemapEntry[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const entries: SitemapEntry[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin
        .from("landing_pages")
        .select("slug, updated_at, seo_indexable")
        .eq("published", true)
        .order("slug")
        .range(offset, offset + pageSize - 1);
      if (error || !data) break;
      for (const row of data as {
        slug: string;
        updated_at: string | null;
        seo_indexable: boolean | null;
      }[]) {
        if (row.seo_indexable === false) continue;
        entries.push({
          path: `/p/${encodeURIComponent(row.slug)}`,
          lastmod: row.updated_at ?? undefined,
          changefreq: "weekly",
          priority: "0.5",
        });
      }
      if (data.length < pageSize) break;
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Published partner profiles. Only verified, published rows exist publicly, and
 * `/partners` itself is only listed once at least one profile is live so search
 * engines never see an empty hub page.
 */
async function partnerPages(): Promise<SitemapEntry[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("authority_partners")
      .select("slug, updated_at")
      .eq("published", true)
      .order("slug");
    if (error || !data?.length) return [];
    return [
      { path: "/partners", changefreq: "monthly", priority: "0.6" },
      ...data.map((row: { slug: string; updated_at: string | null }) => ({
        path: `/partners/${encodeURIComponent(row.slug)}`,
        lastmod: row.updated_at ?? undefined,
        changefreq: "monthly",
        priority: "0.5",
      })),
    ];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const categories = Object.keys(CATEGORY_META) as TemplateCategory[];
        const entries: SitemapEntry[] = [
          ...PUBLIC_PAGES.map((p) => ({
            path: p.path,
            changefreq: p.changefreq,
            priority: p.priority,
          })),
          ...INDUSTRIES.map((i) => ({
            path: `/solutions/${i.slug}`,
            changefreq: "monthly",
            priority: "0.7",
          })),
          ...categories.map((c) => ({
            path: CATEGORY_META[c].path,
            changefreq: "monthly",
            priority: "0.6",
          })),
          ...PUBLIC_TEMPLATES.map((t) => ({
            path: `${CATEGORY_META[t.category].path}/${t.slug}`,
            changefreq: "monthly",
            priority: "0.5",
          })),
          // Industry / goal template collections, only where enough real templates exist.
          ...(Object.keys(INDUSTRY_LABEL) as Industry[])
            .filter((i) => templatesByIndustry(i).length >= MIN_COLLECTION_SIZE)
            .map((i) => ({ path: `/templates/industry/${i}`, changefreq: "monthly", priority: "0.6" })),
          ...(Object.keys(GOAL_LABEL) as Goal[])
            .filter((g) => templatesByGoal(g).length >= MIN_COLLECTION_SIZE)
            .map((g) => ({ path: `/templates/use-case/${g}`, changefreq: "monthly", priority: "0.6" })),
          ...(await partnerPages()),
          ...(await publishedLandingPages()),

        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${SITE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
