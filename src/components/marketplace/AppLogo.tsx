import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "size-9 rounded-lg text-sm",
  md: "size-12 rounded-xl text-base",
  lg: "size-16 rounded-2xl text-xl",
} as const;

/** App logo with a branded monogram fallback (no broken images in the grid). */
export function AppLogo({ name, logoUrl, accentColor, size = "md", className }: Props) {
  const [failed, setFailed] = useState(false);
  const accent = accentColor ?? undefined;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border bg-card font-semibold shadow-sm transition-transform duration-300",
        SIZES[size],
        className,
      )}
      style={accent ? { borderColor: `${accent}33`, backgroundColor: `${accent}12`, color: accent } : undefined}
    >
      {logoUrl && !failed ? (
        <img
          src={logoUrl}
          alt=""
          loading="lazy"
          className="size-[62%] object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials || "X"}</span>
      )}
    </div>
  );
}
