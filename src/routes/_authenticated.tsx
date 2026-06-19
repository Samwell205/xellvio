import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ensureMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (!data.user.email_confirmed_at) {
      throw redirect({ to: "/verify-email", search: { email: data.user.email ?? "" } });
    }
    await ensureMyAccount();
    return { user: data.user };
  },
  component: () => <Outlet />,
});
