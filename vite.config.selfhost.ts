// Self-hosted Vite config — used OUTSIDE Lovable (local dev in VS Code and
// Cloudflare Workers deploys). It declares explicitly everything that
// @lovable.dev/vite-tanstack-config bundles implicitly.
//
//   bun run dev:selfhost     -> local dev server on :8080
//   bun run build:selfhost   -> .output/ (Cloudflare Workers bundle)
//
// `vite.config.ts` is left untouched so the project keeps building inside
// Lovable while the migration is in progress. Once you have fully cut over,
// delete vite.config.ts and rename this file to vite.config.ts.
import { defineConfig, loadEnv, type ConfigEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import path from "node:path";

// Publishable (browser-safe) backend connection values. These are NOT secrets —
// the anon key is designed to be shipped to the client and is protected by RLS.
// Hardcoding them as fallbacks means a deploy can never boot with a blank
// "Missing Supabase environment variable(s)" screen just because a CI secret
// was not set. Real `.env` / CI values still win when present.
const FALLBACK_SUPABASE_URL = "https://dbyqktfecfbukglciihc.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw";
const FALLBACK_SUPABASE_PROJECT_ID = "dbyqktfecfbukglciihc";

export default defineConfig((env: ConfigEnv) => {
  // Make every var in .env available to server code via process.env
  // (not just the VITE_-prefixed ones).
  Object.assign(process.env, loadEnv(env.mode, process.cwd(), ""));

  // Normalise both the browser (VITE_*) and server-side names so SSR, server
  // functions and the client bundle all resolve the same project.
  const url =
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  const projectId =
    process.env.VITE_SUPABASE_PROJECT_ID ||
    process.env.SUPABASE_PROJECT_ID ||
    FALLBACK_SUPABASE_PROJECT_ID;

  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = key;
  process.env.VITE_SUPABASE_PROJECT_ID = projectId;
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || url;
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || key;
  process.env.SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID || projectId;

  return {
    // Inline the publishable values so the client bundle never depends on the
    // build machine having the VITE_* vars exported.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(projectId),
    },
    server: { port: 8080, host: true },
    preview: { port: 8080, host: true },
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        // src/server.ts wraps the SSR handler with our error reporting.
        server: { entry: "server" },
      }),
      viteReact(),
      nitro({ config: { preset: "cloudflare_module" } }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // `entities` ships broken subpath exports for the bundler; pin them.
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
    },
  };
});
