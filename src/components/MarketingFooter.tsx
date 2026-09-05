import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";
import { ABUSE_EMAIL, SUPPORT_EMAIL } from "@/content/legal";

export function MarketingFooter() {
  return (
    <footer className="border-t bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 space-y-12">
        <div className="space-y-4">
          <Logo className="text-secondary-foreground" />
          <p className="text-sm text-secondary-foreground/70 max-w-md">
            The customer messaging platform for SMS, email, automations and reporting — trusted for compliant bulk
            messaging in 190+ countries.
          </p>
        </div>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <FooterCol title="Channels" items={[
            { label: "SMS marketing", to: "/sms-marketing" },
            { label: "Email marketing", to: "/email-marketing" },
            { label: "Email to SMS", to: "/solutions/email-to-sms" },
          ]} />
          <FooterCol title="Platform" items={[
            { label: "All features", to: "/features" },
            { label: "Automations", to: "/features" },
            { label: "Landing pages & forms", to: "/features" },
            { label: "Reporting", to: "/features" },
            { label: "Pricing", to: "/pricing" },
          ]} />
          <FooterCol title="Resources" items={[
            { label: "Documentation", to: "/docs" },
            { label: "Solutions by industry", to: "/solutions" },
            { label: "Earn as a verifier", to: "/verify" },
          ]} />
          <FooterCol title="Company" items={[
            { label: "About Xellvio", to: "/about" },
            { label: "Contact us", to: "/contact" },
            { label: "Log in", to: "/auth" },
          ]} />
          <FooterCol title="Legal" items={[
            { label: "Privacy Policy", to: "/privacy" },
            { label: "Terms of Service", to: "/terms" },
            { label: "Acceptable Use", to: "/aup" },
            { label: "Anti-Spam Policy", to: "/anti-spam" },
            { label: "Prohibited Content", to: "/prohibited-content" },
            { label: "SMS Terms & Consent", to: "/sms-terms" },
            { label: "Data Processing Addendum", to: "/dpa" },
            { label: "Cookie Policy", to: "/cookies" },
          ]} />
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-white/10 pt-8 text-sm text-secondary-foreground/70">
          <Link to="/contact" className="hover:text-secondary-foreground">Contact form</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-secondary-foreground break-all">{SUPPORT_EMAIL}</a>
          <a href={`mailto:${ABUSE_EMAIL}`} className="hover:text-secondary-foreground break-all">
            Report abuse: {ABUSE_EMAIL}
          </a>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 text-xs text-secondary-foreground/60 flex flex-wrap justify-between gap-3">
          <span>© {new Date().getFullYear()} Xellvio. All rights reserved.</span>
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
