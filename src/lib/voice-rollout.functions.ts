import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const getVoicePilotAccess = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { hasVoicePilotAccess } = await import("./voice-rollout.server");
  return { available: await hasVoicePilotAccess(context.userId) };
});