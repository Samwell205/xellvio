import { isVoicePilotIdentity, VOICE_COMING_SOON } from "./voice-rollout";
import { resolveActingAccount } from "./acting-account.server";
export async function hasVoicePilotAccount(accountId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.auth.admin.getUserById(accountId);
  return !result.error && isVoicePilotIdentity(result.data.user);
}
export async function hasVoicePilotAccess(userId: string, accountId?: string) {
  const account = accountId ?? (await resolveActingAccount(userId)).accountId;
  return account === userId && await hasVoicePilotAccount(account);
}
export async function assertVoicePilotAccess(userId: string, accountId?: string) {
  if (!await hasVoicePilotAccess(userId, accountId)) throw new Error(VOICE_COMING_SOON);
}