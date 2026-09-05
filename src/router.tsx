import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { RouteFallback } from "./components/RouteFallback";

export const getRouter = () => {
  // Created per request so server rendering never shares cache between users.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Stale-while-revalidate: returning to a recently visited page paints
        // instantly from cache, then refreshes quietly in the background.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Hovering / focusing a link starts loading its code + data immediately.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    // TanStack Query owns data freshness.
    defaultPreloadStaleTime: 0,
    // Show the page skeleton almost immediately instead of freezing on the old
    // page, and don't hold it on screen longer than needed.
    defaultPendingMs: 120,
    defaultPendingMinMs: 200,
    defaultPendingComponent: RouteFallback,
  });

  return router;
};
