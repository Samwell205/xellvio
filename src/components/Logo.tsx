import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/xellio-logo.png";
import darkLogoUrl from "@/assets/xellio-logo-dark.png";


export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-bold text-lg ${className}`}>
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        className="h-8 w-auto dark:hidden"
      />
      <img
        src={darkLogoUrl}
        alt=""
        aria-hidden="true"
        className="hidden h-8 w-auto dark:block"
      />
      <span className="tracking-tight">Xellvio</span>
    </Link>
  );
}
