import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/lovable/")) {
    return next();
  }

  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("[errorMiddleware]", error);
    // Surface real errors as JSON for server-function/API requests so the client mutation
    // can display a useful message instead of trying to parse an HTML error page.
    const url = (request as Request | undefined)?.url ?? "";
    if (url.includes("/_serverFn/") || url.includes("/api/")) {
      const msg = error instanceof Error ? error.message : String(error);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
