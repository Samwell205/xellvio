import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, PhoneCall, Coins, Wallet, Settings2, LogOut } from "lucide-react";

export const Route = createFileRoute("/_verifier")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/verify/auth" });
    return { user: data.user };
  },
  component: VerifierShell,
});

const NAV = [
  { to: "/verify/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/verify/dashboard/numbers", label: "My numbers", icon: PhoneCall },
  { to: "/verify/dashboard/earnings", label: "Earnings", icon: Coins },
  { to: "/verify/dashboard/withdrawals", label: "Withdrawals", icon: Wallet },
  { to: "/verify/dashboard/settings", label: "Bank details", icon: Settings2 },
];

function VerifierShell() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/verify";
  }
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-60 border-r border-slate-800/60 p-4 flex flex-col">
        <Link to="/verify" className="font-semibold text-lg mb-6">Xellvio Verifier</Link>
        <nav className="flex-1 space-y-1">
          {NAV.map(n => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${active ? "bg-primary/15 text-primary" : "text-slate-300 hover:bg-slate-900"}`}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <Button variant="ghost" onClick={signOut} className="justify-start text-slate-400"><LogOut className="size-4 mr-2"/>Sign out</Button>
      </aside>
      <main className="flex-1 p-6 md:p-8 max-w-5xl">
        <Outlet />
      </main>
    </div>
  );
}
