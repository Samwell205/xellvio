import { useQuery } from "@tanstack/react-query";
import { getMySession } from "@/lib/session.functions";

/**
 * Returns the workspace account_id the signed-in user should read/write from.
 * For owners: their own uid. For invited team members: the owner's uid.
 * Returns `null` while loading.
 *
 * The session rarely changes, so it is cached for the whole visit and shared by
 * every component (sidebar, guards, pages) instead of being refetched on each
 * page transition. It is invalidated explicitly on sign-in/out.
 */
const SESSION_QUERY = {
  queryKey: ["my-session"] as const,
  queryFn: () => getMySession(),
  staleTime: 15 * 60_000,
  gcTime: 60 * 60_000,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
};

export function useAccountId(): string | null {
  const { data } = useQuery(SESSION_QUERY);
  return data?.workspaceOwnerId ?? null;
}

export function useSession() {
  return useQuery(SESSION_QUERY);
}
