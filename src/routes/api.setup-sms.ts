import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SetupInput } from "@/lib/sender-setup.schema";
import { setupSmsForUser } from "@/lib/sender-setup.server";

export const Route = createFileRoute("/api/setup-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("authorization") ?? "";
          const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
          if (!token) return Response.json({ error: "Please sign in again, then retry SMS setup." }, { status: 401 });

          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) return Response.json({ error: "Backend auth is not configured." }, { status: 500 });

          const supabase = createClient<Database>(url, key, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const { data: userData, error: userError } = await supabase.auth.getUser(token);
          if (userError || !userData.user) {
            return Response.json({ error: "Please sign in again, then retry SMS setup." }, { status: 401 });
          }

          const payload = SetupInput.parse(await request.json());
          const result = await setupSmsForUser(userData.user.id, payload);
          return Response.json(result);
        } catch (e: any) {
          const error = e?.issues?.[0]?.message ?? e?.message ?? "Could not set up SMS. Please try again.";
          return Response.json({ error }, { status: 500 });
        }
      },
    },
  },
});