import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/my-academy")({
  component: MyAcademyPage,
  head: () => ({
    meta: [
      { title: "My Academy — Coming Soon | Xellvio" },
      { name: "description", content: "Xellvio Academy courses on SMS marketing, compliance and deliverability are coming soon." },
      { property: "og:title", content: "My Academy — Coming Soon | Xellvio" },
      { property: "og:description", content: "Xellvio Academy courses on SMS marketing, compliance and deliverability are coming soon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function MyAcademyPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <GraduationCap className="size-7 text-primary" /> My Academy
        </h1>
        <p className="text-muted-foreground mt-1">Learning hub for SMS marketing, compliance and deliverability.</p>
      </div>

      <Card className="p-10 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock className="size-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Coming soon</h2>
        <p className="mt-2 text-muted-foreground max-w-md mx-auto">
          We're putting the finishing touches on the Academy. Courses and lessons will appear here as soon as they're ready.
        </p>
      </Card>
    </div>
  );
}
