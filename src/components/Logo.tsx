import { Link } from "@tanstack/react-router";
import logoUrl from "@/assets/xellio-logo.png";


export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-bold text-lg ${className}`}>
      <img
        src={logoUrl}
        alt="Xellvio"
        className="h-8 w-auto"
      />
      <span className="tracking-tight">Xellvio</span>
    </Link>
  );
}
