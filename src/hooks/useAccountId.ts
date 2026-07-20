import { useQuery } from "@tanstack/react-query";
import { getMySession } from "@/lib/session.functions";

/**
 * Returns the workspace account_id the signed-in user should read/write from.
 * For owners: their own uid. For invited team members: the owner's uid.
 * Returns `null` while loading.
 */
export function useAccountId(): string | null {
  const { data } = useQuery({
    queryKey: ["my-session"],
    queryFn: () => getMySession(),
    staleTime: 60_000,
  });
  return data?.workspaceOwnerId ?? null;
}

export function useSession() {
  return useQuery({
    queryKey: ["my-session"],
    queryFn: () => getMySession(),
    staleTime: 60_000,
  });
}
