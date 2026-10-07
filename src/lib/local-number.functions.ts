import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AREA_CODE_PATTERN } from "./local-number.server";

export const getLocalNumberOffer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveActingAccount } = await import("./acting-account.server");
    const accountId = (await resolveActingAccount(context.userId)).accountId;
    const m = await import("./local-number.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [price, balance, owned, sellable, pending] = await Promise.all([
      m.readLocalPrice(),
      m.getBalance(accountId),
      m.tenantLocalNumber(accountId),
      m.listSellableLocalNumbers().catch(() => []),
      supabaseAdmin.from("number_requests").select("id,area_code,status,created_at,admin_notes")
        .eq("account_id", accountId).eq("number_type", "ten_dlc").not("area_code", "is", null)
        .order("created_at", { ascending: false }).limit(5),
    ]);
    return {
      price_usd: price,
      balance,
      owned_number: owned,
      available: sellable.length > 0,
      requests: (pending.data ?? []) as Array<{ id: string; area_code: string; status: string; created_at: string; admin_notes: string | null }>,
    };
  });

/** Buy any available verified local number now, paid from credit balance. */
export const buyLocalNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveActingAccount, assertPermission } = await import("./acting-account.server");
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "setup_sms");
    const accountId = acting.accountId;
    const m = await import("./local-number.server");
    if (await m.tenantLocalNumber(accountId)) throw new Error("You already have a local number.");
    const price = await m.readLocalPrice();
    if ((await m.getBalance(accountId)) < price) {
      throw new Error(`Insufficient balance. A local number costs $${price.toFixed(2)}.`);
    }
    const pick = (await m.listSellableLocalNumbers())[0];
    if (!pick) throw new Error("No local numbers are available right now. Request an area code instead.");
    await m.attachLocalNumber(accountId, pick.phone_number, pick.country_code ?? "US");
    await m.chargeLocal(accountId, pick.phone_number, price);
    await m.notifyAdmins("Local number sold", `${pick.phone_number} sold to account ${accountId} for $${price.toFixed(2)}.`);
    return { ok: true, phone_number: pick.phone_number };
  });

/** Request a specific US area code; admin assigns manually, charged on assignment. */
export const requestLocalAreaCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ area_code: z.string().trim().regex(/^[2-9]\d{2}$/, "Enter a valid 3-digit US area code") }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { resolveActingAccount, assertPermission } = await import("./acting-account.server");
    const acting = await resolveActingAccount(context.userId);
    assertPermission(acting, "setup_sms");
    const accountId = acting.accountId;
    const m = await import("./local-number.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (await m.tenantLocalNumber(accountId)) throw new Error("You already have a local number.");
    const price = await m.readLocalPrice();
    if ((await m.getBalance(accountId)) < price) {
      throw new Error(`Insufficient balance. Keep at least $${price.toFixed(2)} in credits — it's charged when your number is assigned.`);
    }
    const { data: open } = await supabaseAdmin.from("number_requests").select("id")
      .eq("account_id", accountId).eq("number_type", "ten_dlc").not("area_code", "is", null)
      .in("status", ["pending", "approved"]).limit(1);
    if (open?.length) throw new Error("You already have an area code request under review.");
    const { data: acct } = await supabaseAdmin.from("accounts")
      .select("legal_business_name,email").eq("id", accountId).maybeSingle();
    const name = acct?.legal_business_name || acct?.email || "Tenant";
    const { error } = await supabaseAdmin.from("number_requests").insert({
      account_id: accountId,
      requested_by: context.userId,
      country: "US",
      number_type: "ten_dlc",
      area_code: data.area_code,
      business_name: name,
      use_case: `Local number request for area code ${data.area_code}`,
      sample_message: "n/a — verified 10DLC local number",
      expected_monthly_volume: 0,
      admin_notes: `Area code ${data.area_code} requested. $${price.toFixed(2)} charged from credits on assignment.`,
    } as any);
    if (error) throw new Error(error.message);
    await m.notifyAdmins("Area code request", `${name} requested a local number in area code ${data.area_code}.`);
    return { ok: true };
  });
