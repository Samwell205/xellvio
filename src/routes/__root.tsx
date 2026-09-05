import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AiChatWidget } from "../components/AiChatWidget";
import { CookieBanner } from "../components/CookieBanner";
import { Toaster } from "../components/ui/sonner";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import { installCtaTracking, trackView } from "@/lib/growth/track";
import { BRAND, organizationSchema } from "@/lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Xellvio — Global Bulk SMS Platform" },
      { name: "description", content: BRAND.short },
      { property: "og:site_name", content: BRAND.name },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0f111a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Xellvio" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          ...organizationSchema(),
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;
    Promise.all([
      import("@/integrations/supabase/client"),
      import("@/lib/auth-cache"),
    ]).then(([{ supabase }, { clearAuthCache }]) => {
      if (!mounted) return;
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
          return;
        }
        // Identity changed — drop the cached session/role checks.
        clearAuthCache();
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsub = () => data.subscription.unsubscribe();
    });
    return () => {
      mounted = false;
      unsub?.();
    };
  }, [router, queryClient]);

  // Organic-traffic + conversion measurement. No-op unless a measurement ID is set.
  // First-party growth measurement always runs (no cookies, no personal data).
  useEffect(() => {
    initAnalytics();
    const path = window.location.pathname;
    trackPageView(path + window.location.search);
    trackView(path);
    const removeCta = installCtaTracking();
    let stopVitals: (() => void) | undefined;
    let onStart: (() => void) | undefined;
    let onEnd: (() => void) | undefined;
    // Real-user performance measurement (Core Web Vitals + route transition time).
    import("@/lib/perf").then(({ initWebVitals, markNavigationStart, markNavigationEnd }) => {
      initWebVitals();
      onStart = router.subscribe("onBeforeNavigate", ({ toLocation }) =>
        markNavigationStart(toLocation.pathname),
      );
      onEnd = router.subscribe("onResolved", ({ toLocation }) =>
        markNavigationEnd(toLocation.pathname),
      );
    });
    const unsub = router.subscribe("onResolved", ({ toLocation }) => {
      trackPageView(toLocation.href);
      trackView(toLocation.pathname);
    });
    return () => {
      removeCta();
      unsub();
      onStart?.();
      onEnd?.();
      stopVitals?.();
    };
  }, [router]);


  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors position="top-right" />
      <CookieBanner />
      <AiChatWidget />
    </QueryClientProvider>
  );
}
