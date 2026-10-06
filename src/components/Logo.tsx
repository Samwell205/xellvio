import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/xellio-logo.png";
import darkLogoUrl from "@/assets/xellio-logo-dark.png";


export function Logo({ className = "", iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <Link to="/" aria-label="Xellvio home" className={`flex shrink-0 items-center gap-2 font-bold text-lg ${className}`}>
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className={`${iconOnly ? "size-8 object-contain" : "h-8 w-auto"} dark:hidden`}
      />
      <img
        src={darkLogoUrl}
        alt=""
        aria-hidden="true"
        className={`hidden ${iconOnly ? "size-8 object-contain" : "h-8 w-auto"} dark:block`}
      />
      {!iconOnly && <span className="tracking-tight">Xellvio</span>}
    </Link>
  );
}
