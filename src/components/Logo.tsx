import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-bold text-lg ${className}`}>
      <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
        <MessageSquare className="size-4" />
      </div>
      <span className="tracking-tight">
        Samwell<span className="text-primary">Global</span>
      </span>
    </Link>
  );
}
