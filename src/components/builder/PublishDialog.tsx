/**
 * Publish panel: shows the live address, lets the tenant rename it, publish the
 * current draft, take the page offline and roll back to an earlier version.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, ExternalLink, History, Loader2, Rocket } from "lucide-react";
import {
  listWebsiteVersions,
  normalizeSlug,
  publishWebsiteDesign,
  restoreWebsiteVersion,
  unpublishWebsiteDesign,
  updateWebsiteSlug,
} from "@/lib/website-publishing.functions";
import { type Block, type Theme, mergeTheme, normalizeBlocks } from "@/lib/builder/schema";

type Version = { id: string; version: number; label: string | null; created_at: string };

export function PublishDialog({
  kind,
  id,
  slug,
  published,
  lastPublishedAt,
  publicUrl,
  onClose,
  onSlugChange,
  onPublishedChange,
  onRestore,
}: {
  kind: "page" | "form";
  id?: string;
  slug?: string;
  published: boolean;
  lastPublishedAt?: string | null;
  publicUrl?: string;
  onClose: () => void;
  onSlugChange: (slug: string) => void;
  onPublishedChange: (published: boolean) => void;
  onRestore: (blocks: Block[], theme: Theme) => void;
}) {
  const [draftSlug, setDraftSlug] = useState(slug ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);

  const loadVersions = async () => {
    if (!id) return;
    try {
      const rows = (await listWebsiteVersions({ data: { kind, id } })) as Version[];
      setVersions(rows);
    } catch {
      /* history is non-critical */
    }
  };

  useEffect(() => {
    void loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const saveSlug = () =>
    run("slug", async () => {
      if (!id) throw new Error("Save this design first.");
      const r = await updateWebsiteSlug({ data: { kind, id, slug: draftSlug } });
      onSlugChange(r.slug);
      setDraftSlug(r.slug);
      toast.success("Web address updated");
    });

  const publish = () =>
    run("publish", async () => {
      if (!id) throw new Error("Save this design first.");
      const r = await publishWebsiteDesign({ data: { kind, id } });
      onPublishedChange(true);
      toast.success(`Published — version ${r.version} is now live`);
      await loadVersions();
    });

  const unpublish = () =>
    run("unpublish", async () => {
      if (!id) return;
      await unpublishWebsiteDesign({ data: { kind, id } });
      onPublishedChange(false);
      toast.success("Taken offline");
    });

  const restore = (versionId: string) =>
    run(versionId, async () => {
      const r = await restoreWebsiteVersion({ data: { kind, versionId } });
      onRestore(normalizeBlocks(r.blocks), mergeTheme(r.theme));
      toast.success("Version loaded into your draft — publish when you're happy.");
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="size-4" /> Publish
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant={published ? "default" : "outline"}>{published ? "Live" : "Not live"}</Badge>
            {lastPublishedAt ? (
              <span className="text-xs text-muted-foreground">Last published {new Date(lastPublishedAt).toLocaleString()}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Your edits stay private until you publish.</span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Web address</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">/{kind === "page" ? "p" : "f"}/</span>
              <Input
                value={draftSlug}
                onChange={(e) => setDraftSlug(normalizeSlug(e.target.value))}
                placeholder="summer-sale"
              />
              <Button variant="outline" disabled={!id || busy === "slug" || draftSlug === slug} onClick={saveSlug}>
                {busy === "slug" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </Button>
            </div>
            {publicUrl ? (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                <ExternalLink className="size-3" /> {publicUrl}
              </a>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!id || busy === "publish"} onClick={publish}>
              {busy === "publish" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Rocket className="mr-2 size-4" />}
              {published ? "Publish changes" : "Publish"}
            </Button>
            {published ? (
              <Button variant="outline" disabled={busy === "unpublish"} onClick={unpublish}>
                Take offline
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <History className="size-3.5" /> Version history
            </div>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No versions yet — the first publish creates one.</p>
            ) : (
              <ul className="max-h-52 space-y-1.5 overflow-y-auto">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{v.label ?? `Version ${v.version}`}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                    </div>
                    <Button size="sm" variant="ghost" disabled={busy === v.id} onClick={() => restore(v.id)}>
                      {busy === v.id ? <Loader2 className="size-3.5 animate-spin" /> : "Restore"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
