import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getCommPrefs, saveCommPrefs } from "@/lib/lifecycle.functions";

type Prefs = {
  product_updates: boolean;
  educational: boolean;
  promotional: boolean;
  announcements: boolean;
};

const ROWS: Array<{ key: keyof Prefs; label: string; hint: string }> = [
  {
    key: "educational",
    label: "Onboarding & tips",
    hint: "Help getting set up and short guides on features you haven't used yet.",
  },
  {
    key: "product_updates",
    label: "Product updates",
    hint: "New features and improvements in Xellvio.",
  },
  {
    key: "announcements",
    label: "In-app announcements",
    hint: "Notices shown inside your workspace.",
  },
  { key: "promotional", label: "Offers", hint: "Plan and credit offers relevant to your usage." },
];

/** Optional communication preferences. Account, billing and delivery notices are always sent. */
export function CommPrefsCard() {
  const load = useServerFn(getCommPrefs);
  const save = useServerFn(saveCommPrefs);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const current = useQuery({
    queryKey: ["comm-prefs"],
    queryFn: () => load() as Promise<Prefs>,
  });

  useEffect(() => {
    if (current.data && !prefs) setPrefs(current.data);
  }, [current.data, prefs]);

  const mutation = useMutation({
    mutationFn: (data: Prefs) => save({ data }),
    onSuccess: () => toast.success("Preferences saved"),
    onError: () => toast.error("Couldn't save preferences"),
  });

  if (!prefs) return null;

  return (
    <Card className="p-5">
      <div className="font-semibold">Email & message preferences</div>
      <p className="text-sm text-muted-foreground mt-1">
        Account, billing, delivery and compliance notices are always sent — they're part of running
        your workspace.
      </p>
      <div className="mt-4 space-y-4">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{row.label}</div>
              <p className="text-xs text-muted-foreground">{row.hint}</p>
            </div>
            <Switch
              checked={prefs[row.key]}
              onCheckedChange={(v) => setPrefs({ ...prefs, [row.key]: v })}
            />
          </div>
        ))}
      </div>
      <Button
        className="mt-5"
        size="sm"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(prefs)}
      >
        {mutation.isPending ? "Saving…" : "Save preferences"}
      </Button>
    </Card>
  );
}
