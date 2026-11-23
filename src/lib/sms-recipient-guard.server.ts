// Server-only: direct one-off sends (flow tests, connected-app sends) may only
// reach an existing contact of this business with an active SMS subscription,
// so they cannot be used to text arbitrary numbers.
export async function assertSubscribedSmsContact(accountId: string, e164: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("account_id", accountId)
    .eq("phone_e164", e164)
    .limit(5);
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length) {
    const { data: consent } = await supabaseAdmin
      .from("consents")
      .select("id")
      .in("profile_id", ids)
      .eq("channel", "sms")
      .eq("status", "subscribed")
      .limit(1)
      .maybeSingle();
    if (consent) return;
  }
  throw new Error("This number isn't a subscribed contact in your business. Add the contact with SMS consent first.");
}
