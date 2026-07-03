import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/solutions", label: "Solutions" },
  { to: "/verify", label: "Earn as Verifier" },
  { to: "/docs", label: "Documentation" },
  { to: "/contact", label: "Contact" },
] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          {links.map((l) => (
            <Link key={l.to} to={l.to as string} className="hover:text-foreground transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Link to="/auth"><Button variant="ghost" size="sm">Login</Button></Link>
          <Link to="/auth" search={{ mode: "signup" } as never}>
            <Button size="sm">Start Free</Button>
          </Link>
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t bg-background">
          <div className="flex flex-col gap-1 p-4">
            {links.map((l) => (
              <Link key={l.to} to={l.to as string} onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm hover:bg-accent">
                {l.label}
              </Link>
            ))}
            <Link to="/auth" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm hover:bg-accent">Login</Link>
            <Link to="/auth" onClick={() => setOpen(false)} className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm text-center">Start Free</Link>
          </div>
        </div>
      )}
    </header>
  );
}
