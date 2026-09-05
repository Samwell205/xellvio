import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ChevronDown, ArrowRight, Search } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { NAV, type NavEntry, type MenuGroup } from "@/components/marketing/nav-data";

function hasMenu(e: NavEntry): e is Extract<NavEntry, { groups: MenuGroup[] }> {
  return "groups" in e;
}

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const open = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu(label);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 120);
  };

  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-xl"
      onKeyDown={(e) => { if (e.key === "Escape") setOpenMenu(null); }}
    >
      <div className="mx-auto flex h-[68px] max-w-[1400px] items-center gap-8 px-5 sm:px-8">
        <Link to="/" className="shrink-0" onClick={() => setOpenMenu(null)}>
          <Logo />
        </Link>

        <nav className="hidden lg:flex items-center gap-1 text-[15px] font-medium">
          {NAV.map((entry) =>
            hasMenu(entry) ? (
              <div key={entry.label} onMouseEnter={() => open(entry.label)} onMouseLeave={scheduleClose}>
                <button
                  type="button"
                  aria-expanded={openMenu === entry.label}
                  onClick={() => setOpenMenu(openMenu === entry.label ? null : entry.label)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 transition-colors ${
                    openMenu === entry.label ? "bg-muted text-foreground" : "text-foreground/75 hover:text-foreground"
                  }`}
                >
                  {entry.label}
                  <ChevronDown className={`size-3.5 transition-transform ${openMenu === entry.label ? "rotate-180" : ""}`} />
                </button>
              </div>
            ) : (
              <Link
                key={entry.label}
                to={entry.to}
                onMouseEnter={scheduleClose}
                className="rounded-full px-3.5 py-2 text-foreground/75 hover:text-foreground transition-colors"
              >
                {entry.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto hidden lg:flex items-center gap-2">
          <Link to="/docs" aria-label="Search the docs" className="grid size-9 place-items-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground transition-colors">
            <Search className="size-4" />
          </Link>
          <Link to="/auth" className="px-3 text-sm font-medium text-foreground/80 hover:text-foreground">Log in</Link>
          <Link to="/auth" search={{ mode: "signup" } as never}>
            <Button className="rounded-full px-5">Sign up</Button>
          </Link>
          <Link to="/contact">
            <Button variant="outline" className="rounded-full px-5">Get a demo</Button>
          </Link>
        </div>

        <button
          className="ml-auto lg:hidden grid size-10 place-items-center rounded-full hover:bg-muted"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Desktop mega menu */}
      {NAV.filter(hasMenu).map((entry) =>
        openMenu === entry.label ? (
          <div
            key={entry.label}
            onMouseEnter={() => open(entry.label)}
            onMouseLeave={scheduleClose}
            className="hidden lg:block absolute inset-x-0 top-full border-b border-border bg-background shadow-[0_24px_48px_-24px_rgba(0,0,0,0.25)]"
          >
            <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-9 grid gap-10 md:grid-cols-3">
              {entry.groups.map((g) => (
                <div key={g.heading}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{g.heading}</p>
                  <ul className="mt-4 space-y-1">
                    {g.items.map((it) => (
                      <li key={it.label}>
                        <Link
                          to={it.to}
                          onClick={() => setOpenMenu(null)}
                          className="group flex gap-3 rounded-xl p-3 hover:bg-muted transition-colors"
                        >
                          <it.icon className="mt-0.5 size-5 text-primary shrink-0" strokeWidth={1.7} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">{it.label}</span>
                            <span className="block text-xs text-muted-foreground leading-relaxed">{it.blurb}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {entry.footer && (
              <div className="border-t border-border bg-muted/50">
                <div className="mx-auto max-w-[1400px] px-5 sm:px-8 py-4">
                  <Link
                    to={entry.footer.to}
                    onClick={() => setOpenMenu(null)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:gap-2.5 transition-all"
                  >
                    {entry.footer.label} <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : null,
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-border bg-background max-h-[80vh] overflow-y-auto">
          <div className="p-4 space-y-1">
            {NAV.map((entry) =>
              hasMenu(entry) ? (
                <details key={entry.label} className="rounded-xl border border-border">
                  <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
                    {entry.label}
                    <ChevronDown className="size-4" />
                  </summary>
                  <div className="px-2 pb-3 space-y-3">
                    {entry.groups.map((g) => (
                      <div key={g.heading}>
                        <p className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{g.heading}</p>
                        {g.items.map((it) => (
                          <Link
                            key={it.label}
                            to={it.to}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                          >
                            <it.icon className="size-4 text-primary" strokeWidth={1.7} />
                            {it.label}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              ) : (
                <Link
                  key={entry.label}
                  to={entry.to}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl border border-border px-4 py-3 text-sm font-semibold"
                >
                  {entry.label}
                </Link>
              ),
            )}
            <div className="pt-2 grid gap-2">
              <Link to="/auth" onClick={() => setMobileOpen(false)} className="rounded-full border border-border px-4 py-2.5 text-center text-sm font-medium">Log in</Link>
              <Link to="/auth" onClick={() => setMobileOpen(false)} className="rounded-full bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground">Sign up</Link>
              <Link to="/contact" onClick={() => setMobileOpen(false)} className="rounded-full border border-border px-4 py-2.5 text-center text-sm font-medium">Get a demo</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
