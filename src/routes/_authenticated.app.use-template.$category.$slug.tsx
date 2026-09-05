import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importTemplate } from "@/lib/template-import.functions";
import { findLibraryTemplate } from "@/lib/templates/library";
import { trackProduct } from "@/lib/growth/track";

export const Route = createFileRoute("/_authenticated/app/use-template/$category/$slug")({
  component: UseTemplate,
});

/** Bridges the public template page to the workspace: import, then open the builder. */
function UseTemplate() {
  const { category, slug } = Route.useParams();
  const navigate = useNavigate();
  const run = useServerFn(importTemplate);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const tpl = findLibraryTemplate(category, slug);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!tpl) {
      setError("That template no longer exists.");
      return;
    }
    run({ data: { category, slug } })
      .then((res) => {
        trackProduct("template_imported", { name: res.name });
        toast.success(`${res.name} added to your workspace as a draft`);
        navigate({ to: res.to, replace: true });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not add that template."));
  }, [category, slug, navigate, run, tpl]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {error ? (
        <>
          <AlertCircle className="size-8 text-destructive" />
          <div>
            <h1 className="text-lg font-semibold">We couldn't add that template</h1>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: "/app" })}>
            Back to dashboard
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Adding {tpl?.label ?? "your template"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We're copying it into your workspace as an editable draft — nothing goes live until you publish it.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
