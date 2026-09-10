import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAnnouncements, acknowledgeAnnouncement } from "@/lib/lifecycle.functions";

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_path: string | null;
};

/** Product announcements the workspace hasn't dismissed yet. */
export function AnnouncementBanner() {
  const qc = useQueryClient();
  const load = useServerFn(getAnnouncements);
  const ack = useServerFn(acknowledgeAnnouncement);

  const list = useQuery({
    queryKey: ["lifecycle-announcements"],
    queryFn: () => load() as Promise<Announcement[]>,
    staleTime: 5 * 60_000,
  });
  const dismiss = useMutation({
    mutationFn: (id: string) => ack({ data: { id, action: "dismissed" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lifecycle-announcements"] }),
  });

  const item = (list.data ?? [])[0];
  if (!item) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <Megaphone className="size-4 mt-0.5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{item.title}</div>
        {item.body && <p className="text-sm text-muted-foreground mt-0.5">{item.body}</p>}
        {item.cta_path && item.cta_label && (
          <Link
            to={item.cta_path as never}
            className="inline-block mt-2"
            onClick={() => ack({ data: { id: item.id, action: "clicked" } })}
          >
            <Button size="sm" variant="outline">
              {item.cta_label}
            </Button>
          </Link>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss announcement"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => dismiss.mutate(item.id)}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
