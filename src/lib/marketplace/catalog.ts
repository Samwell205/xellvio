// Client-side marketplace catalog reads.
// The catalog is public data (RLS: published + public apps are readable by anyone),
// so the browser client can query it directly. Anything involving credentials,
// installs or connections goes through server functions instead.

import { supabase } from "@/integrations/supabase/client";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
};

export type AppSummary = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  short_description: string | null;
  logo_url: string | null;
  accent_color: string | null;
  auth_type: string;
  pricing_type: string;
  install_count: number;
  rating: number;
  is_featured: boolean;
  keywords: string[];
  category_id: string | null;
  app_categories: { name: string; slug: string } | null;
  developers: { company_name: string; verification_status: string; is_first_party: boolean } | null;
};

const SUMMARY_COLUMNS = `
  id, name, slug, tagline, short_description, logo_url, accent_color, auth_type,
  pricing_type, install_count, rating, is_featured, keywords, category_id,
  app_categories ( name, slug ),
  developers ( company_name, verification_status, is_first_party )
`;

export async function listCategories(): Promise<(Category & { app_count: number })[]> {
  const [{ data: cats, error }, { data: apps }] = await Promise.all([
    supabase.from("app_categories").select("*").order("sort_order"),
    supabase.from("apps").select("category_id").eq("status", "published"),
  ]);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const a of apps ?? []) {
    if (a.category_id) counts.set(a.category_id, (counts.get(a.category_id) ?? 0) + 1);
  }
  return (cats ?? []).map((c) => ({ ...(c as Category), app_count: counts.get(c.id) ?? 0 }));
}

export type BrowseParams = {
  q?: string;
  category?: string | null;
  sort?: "popular" | "rating" | "newest" | "name";
  featuredOnly?: boolean;
  limit?: number;
};

export async function listApps(params: BrowseParams = {}): Promise<AppSummary[]> {
  const { q, category, sort = "popular", featuredOnly, limit } = params;
  let query = supabase
    .from("apps")
    .select(SUMMARY_COLUMNS)
    .eq("status", "published")
    .eq("visibility", "public");

  if (featuredOnly) query = query.eq("is_featured", true);
  if (category) query = query.eq("app_categories.slug", category);
  if (q && q.trim()) {
    const term = q.trim().replace(/[%,]/g, " ");
    query = query.or(
      [
        `name.ilike.%${term}%`,
        `tagline.ilike.%${term}%`,
        `short_description.ilike.%${term}%`,
        `long_description.ilike.%${term}%`,
      ].join(","),
    );
  }

  if (sort === "rating") query = query.order("rating", { ascending: false });
  else if (sort === "newest") query = query.order("published_at", { ascending: false, nullsFirst: false });
  else if (sort === "name") query = query.order("name");
  else query = query.order("install_count", { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  let rows = (data ?? []) as unknown as AppSummary[];
  // Category filter is applied through the embedded relation; drop non-matches.
  if (category) rows = rows.filter((r) => r.app_categories?.slug === category);
  // Keyword matches that ilike missed (keywords is an array column).
  if (q && q.trim()) {
    const term = q.trim().toLowerCase();
    const seen = new Set(rows.map((r) => r.id));
    const { data: byKeyword } = await supabase
      .from("apps")
      .select(SUMMARY_COLUMNS)
      .eq("status", "published")
      .contains("keywords", [term]);
    for (const r of ((byKeyword ?? []) as unknown as AppSummary[])) {
      if (!seen.has(r.id)) rows.push(r);
    }
  }
  return rows;
}

export type AppDetail = AppSummary & {
  long_description: string | null;
  banner_url: string | null;
  website_url: string | null;
  documentation_url: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  setup_guide: string | null;
  version: string;
  published_at: string | null;
  app_features: { id: string; title: string; description: string | null; icon: string | null }[];
  app_actions: { id: string; name: string; slug: string; description: string | null; canonical_entity: string | null }[];
  app_triggers: { id: string; name: string; slug: string; description: string | null; canonical_entity: string | null }[];
  app_versions: { id: string; version: string; changelog: string | null; created_at: string }[];
  app_reviews: { id: string; rating: number; review: string | null; author_name: string | null; created_at: string }[];
};

export async function getApp(slug: string): Promise<AppDetail | null> {
  const { data, error } = await supabase
    .from("apps")
    .select(
      `${SUMMARY_COLUMNS}, long_description, banner_url, website_url, documentation_url,
       privacy_url, terms_url, setup_guide, version, published_at,
       app_features ( id, title, description, icon, sort_order ),
       app_actions ( id, name, slug, description, canonical_entity ),
       app_triggers ( id, name, slug, description, canonical_entity ),
       app_versions ( id, version, changelog, created_at ),
       app_reviews ( id, rating, review, author_name, created_at )`,
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AppDetail) ?? null;
}

export async function similarApps(categoryId: string | null, excludeId: string): Promise<AppSummary[]> {
  if (!categoryId) return [];
  const { data } = await supabase
    .from("apps")
    .select(SUMMARY_COLUMNS)
    .eq("status", "published")
    .eq("category_id", categoryId)
    .neq("id", excludeId)
    .order("install_count", { ascending: false })
    .limit(4);
  return (data ?? []) as unknown as AppSummary[];
}

export const AUTH_TYPE_LABELS: Record<string, string> = {
  oauth2: "OAuth 2.0",
  api_key: "API key",
  bearer_token: "Bearer token",
  custom: "Custom authentication",
};

export const POPULAR_SEARCHES = ["CRM", "Shopify", "Payments", "Automation", "Email marketing", "Booking", "AI"];
