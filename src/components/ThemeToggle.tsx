import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/**
 * Light / dark switch. A single pill with a sliding thumb: the active side is
 * highlighted, the other side is the mode you'd switch to.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border bg-muted/70 p-1",
        className,
      )}
    >
      <Button
        size="icon" variant={theme === "light" ? "secondary" : "ghost"}
        type="button"
        aria-pressed={theme === "light"}
        title="Light appearance"
        aria-label="Light appearance"
        onClick={() => setTheme("light")}
        className={cn(
          "relative z-10 grid size-7 place-items-center rounded-full transition-colors",
        )}
      >
        <Sun className="size-4" />
      </Button>
      <Button
        size="icon" variant={theme === "dark" ? "secondary" : "ghost"}
        type="button"
        aria-pressed={theme === "dark"}
        title="Dark appearance"
        aria-label="Dark appearance"
        onClick={() => setTheme("dark")}
        className={cn(
          "relative z-10 grid size-7 place-items-center rounded-full transition-colors",
        )}
      >
        <Moon className="size-4" />
      </Button>
      <Button size="icon" variant={theme === "system" ? "secondary" : "ghost"} className="size-7 rounded-full" aria-label="System appearance" title="Match my device" aria-pressed={theme === "system"} onClick={() => setTheme("system")}>
        <Monitor className="size-4" />
      </Button>
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
