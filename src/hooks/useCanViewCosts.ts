import { useSession } from "@/hooks/useAccountId";

/**
 * True when the signed-in person is allowed to see money figures (spend,
 * cost per message, charges). Owners always can; teammates need the
 * "costs" permission. While the session loads we hide costs, so a
 * restricted teammate never sees a flash of spend data.
 */
export function useCanViewCosts(): boolean {
  const { data } = useSession();
  if (!data) return false;
  return data.isOwner || data.permissions.costs === true;
}
