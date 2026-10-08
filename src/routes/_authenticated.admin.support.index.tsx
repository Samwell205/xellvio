import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/support/")({
  component: () => (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Bot className="size-10 text-primary" />
      <h1 className="text-xl font-semibold">Support copilot</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Start a new case, paste a tenant's message and link their account. The copilot reviews their campaigns,
        failures, holds, payments and numbers, explains what's wrong, writes the reply, and suggests fixes you can apply in one click.
      </p>
    </div>
  ),
});
