import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/marketplace")({
  component: MarketplaceLayout,
});

const NAV = [
  { label: "Marketplace", to: "/marketplace" as const },
  { label: "Categories", to: "/marketplace/categories" as const },
  { label: "Developers", to: "/marketplace/developers" as const },
];

function MarketplaceLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 md:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/marketplace" }}
                activeProps={{ className: "bg-muted text-foreground" }}
                className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
            <Link
              to="/marketplace/apps"
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            >
              Documentation
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/marketplace/apps"
              aria-label="Search the marketplace"
              className="hidden size-9 place-items-center rounded-full border text-muted-foreground transition hover:text-foreground sm:grid"
            >
              <Search className="size-4" />
            </Link>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/app/apps">My Apps</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/app">Open Xellvio</Link>
            </Button>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border md:hidden"
              aria-label="Menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-t px-4 py-3 md:hidden">
            {[...NAV, { label: "My Apps", to: "/app/apps" as const }].map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm hover:bg-muted"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <Outlet />

      <footer className="border-t py-10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} Xellvio. One ecosystem for your whole business.</p>
          <div className="flex flex-wrap gap-4">
            <Link to="/marketplace/apps" className="hover:text-foreground">
              Browse apps
            </Link>
            <Link to="/marketplace/categories" className="hover:text-foreground">
              Categories
            </Link>
            <Link to="/marketplace/developers" className="hover:text-foreground">
              Build for Xellvio
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
