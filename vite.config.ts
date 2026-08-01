// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import path from "node:path";
import { loadEnv, type ConfigEnv } from "vite";

export default async function config(env: ConfigEnv) {
  const serverEnv = loadEnv(env.mode, process.cwd(), "");
  Object.assign(process.env, serverEnv);

  // Publishable browser connection values. Keep fallbacks in the primary
  // production config as well as vite.config.selfhost.ts: xellvio.com can be
  // built through this config, and an unset CI variable must not produce a
  // broken sign-in bundle.
  const supabaseUrl =
    serverEnv.VITE_SUPABASE_URL ||
    serverEnv.SUPABASE_URL ||
    "https://dbyqktfecfbukglciihc.supabase.co";
  const supabasePublishableKey =
    serverEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    serverEnv.SUPABASE_PUBLISHABLE_KEY ||
    serverEnv.VITE_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRieXFrdGZlY2ZidWtnbGNpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODY5OTYsImV4cCI6MjA5NzM2Mjk5Nn0.IijlbZkJPlNvjp0_be_JRBYjrNwJmdWpte51rSSFcjw";
  const supabaseProjectId =
    serverEnv.VITE_SUPABASE_PROJECT_ID ||
    serverEnv.SUPABASE_PROJECT_ID ||
    "dbyqktfecfbukglciihc";

  process.env.VITE_SUPABASE_URL = supabaseUrl;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey;
  process.env.VITE_SUPABASE_PROJECT_ID = supabaseProjectId;
  process.env.SUPABASE_URL ||= supabaseUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY ||= supabasePublishableKey;
  process.env.SUPABASE_PROJECT_ID ||= supabaseProjectId;

  return defineConfig({
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
    vite: {
      plugins: [mcpPlugin()],
      define: {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
        "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
        "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
      },
      resolve: {
        alias: {
          "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
          "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
          entities: path.resolve(__dirname, "node_modules/entities"),
        },
      },
    },

  })(env);
}
