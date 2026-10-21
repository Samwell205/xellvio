import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Read exactly the acting business, not every account visible to a teammate. */
export async function readCampaignAccount(client: SupabaseClient<Database>, accountId: string) {
  const { data, error } = await client.from("accounts")
    .select("id,credit_balance").eq("id", accountId).single();
  if (error) throw error;
  return data;
}