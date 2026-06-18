import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";

export function MarketingFooter() {
  return (
    <footer className="border-t bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid gap-10 md:grid-cols-5">
        <div className="md:col-span-2 space-y-4">
          <Logo className="text-secondary-foreground" />
          <p className="text-sm text-secondary-foreground/70 max-w-xs">
            Reach customers worldwide. Fast. Reliable. Compliant bulk SMS for modern businesses.
          </p>
        </div>
        <FooterCol title="Product" items={[
          { label: "Features", to: "/features" },
          { label: "Pricing", to: "/pricing" },
          { label: "API Docs", to: "/docs" },
        ]} />
        <FooterCol title="Company" items={[
          { label: "About", to: "/about" },
          { label: "Contact", to: "/contact" },
          { label: "Solutions", to: "/solutions" },
        ]} />
        <FooterCol title="Legal" items={[
          { label: "Privacy", to: "/privacy" },
          { label: "Terms", to: "/terms" },
        ]} />
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 text-xs text-secondary-foreground/60 flex flex-wrap justify-between gap-3">
          <span>© {new Date().getFullYear()} Samwell Global SMS. All rights reserved.</span>
          <span>Built for global communication.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: { label: string; to: string }[] }) {
  return (
    <div>
      <h4 className="font-semibold text-sm mb-3">{title}</h4>
      <ul className="space-y-2 text-sm text-secondary-foreground/70">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="hover:text-secondary-foreground">{i.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
