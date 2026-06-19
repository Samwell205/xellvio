import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/samwell-logo.png.asset.json";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-bold text-lg ${className}`}>
      <img
        src={logoAsset.url}
        alt="SAMWELL SMS HUB"
        className="h-8 w-auto"
      />
      <span className="tracking-tight">SMS HUB</span>
    </Link>
  );
}
