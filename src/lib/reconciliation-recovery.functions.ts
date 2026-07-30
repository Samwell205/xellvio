import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminListRecoveryCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const [{ supabaseAdmin }, { listRecoveryCases }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/reconciliation-recovery.server"),
    ]);
    return listRecoveryCases(supabaseAdmin);
  });

export const adminUpdateRecoveryCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: string; providerCreditReceived?: number; tenantAmountCollected?: number; adminNotes?: string }) => data)
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const [{ supabaseAdmin }, { updateRecoveryCase }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/reconciliation-recovery.server"),
    ]);
    return updateRecoveryCase(supabaseAdmin, data);
  });

export const adminRecoveryCaseCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const [{ supabaseAdmin }, { recoveryCaseCsv }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/reconciliation-recovery.server"),
    ]);
    return recoveryCaseCsv(supabaseAdmin, data.id);
  });

export const adminSendRecoveryNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const [{ supabaseAdmin }, { sendRecoveryNotice }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/reconciliation-recovery.server"),
    ]);
    return sendRecoveryNotice(supabaseAdmin, data.id);
  });