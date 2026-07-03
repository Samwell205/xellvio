import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SetupInput, type SetupSmsPayload } from "./sender-setup.schema";

export const setupSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SetupSmsPayload) => SetupInput.parse(input))
  .handler(async ({ data, context }) => {
    const { setupSmsForUser } = await import("./sender-setup.server");
    return setupSmsForUser(context.userId, data);
  });
