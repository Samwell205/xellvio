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

export default defineConfig((env: ConfigEnv) => {
  // Make every var in .env available to server code via process.env
  // (not just the VITE_-prefixed ones).
  Object.assign(process.env, loadEnv(env.mode, process.cwd(), ""));

  return {
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
