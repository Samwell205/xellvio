import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicCreditPack = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  price: number;
  credits: number;
  is_popular: boolean;
};

export const getPublicCreditPacks = createServerFn({ method: "GET" }).handler(async () => {
  const supabasePublic = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabasePublic
    .from("credit_packs")
    .select("id,name,description,currency,price,credits,is_popular")
    .eq("is_active", true)
    .eq("currency", "USD")
    .lte("price", 500)
    .order("price", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    currency: p.currency,
    price: Number(p.price),
    credits: Number(p.credits),
    is_popular: !!p.is_popular,
  })) satisfies PublicCreditPack[];
});
