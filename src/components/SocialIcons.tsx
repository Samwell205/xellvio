import { SOCIAL_LINKS } from "@/content/social";

function Icon({ label, className }: { label: string; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
  switch (label) {
    case "Facebook":
      return (
        <svg {...common}>
          <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.25-1.5 1.55-1.5H16.6V4.4c-.3-.04-1.3-.13-2.45-.13-2.43 0-4.1 1.48-4.1 4.2v2.03H7.4v3h2.65V21h3.45z" />
        </svg>
      );
    case "X":
      return (
        <svg {...common}>
          <path d="M17.53 3H20.5l-6.5 7.43L21.5 21h-5.86l-4.02-5.26L6.9 21H3.93l6.78-7.75L3 3h5.98l3.78 4.99L17.53 3zm-1.04 16.2h1.64L7.6 4.72H5.84l10.65 14.48z" />
        </svg>
      );
    case "Instagram":
      return (
        <svg {...common}>
          <path d="M12 2.2c-2.66 0-2.99.01-4.04.06-1.05.05-1.77.22-2.4.46a4.8 4.8 0 0 0-1.74 1.13A4.8 4.8 0 0 0 2.7 5.6c-.24.62-.4 1.34-.46 2.39C2.2 9.03 2.18 9.36 2.18 12s.01 2.97.06 4.02c.05 1.04.22 1.76.46 2.39a4.8 4.8 0 0 0 1.13 1.74 4.8 4.8 0 0 0 1.74 1.13c.62.24 1.34.4 2.39.46 1.05.05 1.38.06 4.04.06s2.99-.01 4.04-.06c1.05-.05 1.77-.22 2.39-.46a5.1 5.1 0 0 0 2.87-2.87c.24-.62.4-1.34.46-2.39.05-1.05.06-1.38.06-4.02s-.01-2.97-.06-4.02c-.05-1.04-.22-1.76-.46-2.39a4.8 4.8 0 0 0-1.13-1.74 4.8 4.8 0 0 0-1.74-1.13c-.62-.24-1.34-.4-2.39-.46C14.99 2.21 14.66 2.2 12 2.2zm0 1.78c2.6 0 2.91.01 3.94.06.95.04 1.47.2 1.81.34.46.17.78.38 1.12.72.34.34.55.66.72 1.12.13.34.3.86.34 1.81.05 1.03.06 1.34.06 3.94s-.01 2.91-.06 3.94c-.4.95-.21 1.47-.34 1.81-.17.46-.38.78-.72 1.12-.34.34-.66.55-1.12.72-.34.13-.86.3-1.81.34-1.03.05-1.34.06-3.94.06s-2.91-.01-3.94-.06c-.95-.04-1.47-.21-1.81-.34a3 3 0 0 1-1.12-.72 3 3 0 0 1-.72-1.12c-.13-.34-.3-.86-.34-1.81-.05-1.03-.06-1.34-.06-3.94s.01-2.91.06-3.94c.04-.95.21-1.47.34-1.81.17-.46.38-.78.72-1.12a3 3 0 0 1 1.12-.72c.34-.13.86-.3 1.81-.34C9.09 4 9.4 3.98 12 3.98zm0 3.02a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.25a3.25 3.25 0 1 1 0-6.5 3.25 3.25 0 0 1 0 6.5zm6.4-8.45a1.17 1.17 0 1 1-2.33 0 1.17 1.17 0 0 1 2.33 0z" />
        </svg>
      );
    case "TikTok":
      return (
        <svg {...common}>
          <path d="M16.6 2h-3.1v13.2a2.4 2.4 0 1 1-1.9-2.35V9.66a5.55 5.55 0 1 0 5 5.52V9.1a6.3 6.3 0 0 0 3.6 1.12V7.14a3.5 3.5 0 0 1-3.6-3.44V2z" />
        </svg>
      );
    default:
      return null;
  }
}

export function SocialIcons({ className }: { className?: string }) {
  return (
    <ul className={`flex items-center gap-5 ${className ?? ""}`}>
      {SOCIAL_LINKS.map((s) => (
        <li key={s.label}>
          <a
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Xellvio on ${s.label}`}
            className="inline-flex text-secondary-foreground/70 transition-colors hover:text-secondary-foreground"
          >
            <Icon label={s.label} className="h-5 w-5" />
          </a>
        </li>
      ))}
    </ul>
  );
}
