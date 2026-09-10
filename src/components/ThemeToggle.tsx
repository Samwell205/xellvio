import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/**
 * Light / dark switch. A single pill with a sliding thumb: the active side is
 * highlighted, the other side is the mode you'd switch to.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, ready, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border bg-muted/70 p-1",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-background shadow-sm",
          ready && "transition-transform duration-300 ease-out",
          isDark && "translate-x-full",
        )}
      />
      <button
        type="button"
        aria-pressed={!isDark}
        aria-label="Light appearance"
        onClick={() => setTheme("light")}
        className={cn(
          "relative z-10 grid size-7 place-items-center rounded-full transition-colors",
          isDark ? "text-muted-foreground hover:text-foreground" : "text-foreground",
        )}
      >
        <Sun className="size-4" />
      </button>
      <button
        type="button"
        aria-pressed={isDark}
        aria-label="Dark appearance"
        onClick={() => setTheme("dark")}
        className={cn(
          "relative z-10 grid size-7 place-items-center rounded-full transition-colors",
          isDark ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="size-4" />
      </button>
    </div>
  );
}

/** Labelled version for wider surfaces (mobile menu, settings, footer). */
export function ThemeToggleLabelled({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-sm font-medium text-foreground">
        {isDark ? "Dark appearance" : "Light appearance"}
      </span>
      <ThemeToggle />
      <button type="button" className="sr-only" onClick={() => setTheme("system")}>
        Match my device
      </button>
    </div>
  );
}
