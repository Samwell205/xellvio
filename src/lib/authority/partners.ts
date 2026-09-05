/**
 * Public reads for partner profiles.
 *
 * Only rows an admin explicitly verified and published are readable (enforced by
 * row-level security), so the public partner pages can never describe a
 * partnership that does not exist.
 */
import { supabase } from "@/integrations/supabase/client";

export type PublicPartner = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  relationship: string | null;
  integration_summary: string | null;
  integration_app_slug: string | null;
  use_cases: string[];
  benefits: string[];
  related_links: string[];
  website_url: string | null;
  logo_url: string | null;
  updated_at: string | null;
};

const COLUMNS =
  "id, name, slug, short_description, description, relationship, integration_summary, integration_app_slug, use_cases, benefits, related_links, website_url, logo_url, updated_at";

function normalise(row: any): PublicPartner {
  const list = (v: any) => (Array.isArray(v) ? v.map(String) : []);
  return {
    ...row,
    use_cases: list(row.use_cases),
    benefits: list(row.benefits),
    related_links: list(row.related_links),
  } as PublicPartner;
}

export async function listPublishedPartners(): Promise<PublicPartner[]> {
  const { data, error } = await (supabase as any)
    .from("authority_partners")
    .select(COLUMNS)
    .eq("published", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalise);
}

export async function getPublishedPartner(slug: string): Promise<PublicPartner | null> {
  const { data, error } = await (supabase as any)
    .from("authority_partners")
    .select(COLUMNS)
    .eq("published", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalise(data) : null;
}
