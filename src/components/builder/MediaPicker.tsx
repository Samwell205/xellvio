/**
 * Image / video picker used across the builder: paste a link, upload a file, or
 * pick something already in the workspace library.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ALLOWED_MEDIA_TYPES,
  MEDIA_MAX_BYTES,
  confirmMediaUpload,
  createMediaUpload,
  deleteMediaAsset,
  listMediaAssets,
  mediaUrlFor,
} from "@/lib/media.functions";

type Asset = {
  id: string;
  name: string;
  kind: string;
  url: string;
  storage_path: string;
  content_type: string;
};

/** Uploads one file and returns its public delivery URL. */
export async function uploadBuilderFile(file: File): Promise<string> {
  if (file.size > MEDIA_MAX_BYTES) throw new Error("That file is larger than 50 MB.");
  if (!ALLOWED_MEDIA_TYPES.includes(file.type as any)) {
    throw new Error("Use a PNG, JPG, WEBP, GIF, SVG, MP4 or WebM file.");
  }
  const ticket = await createMediaUpload({ data: { name: file.name, contentType: file.type, size: file.size } });
  const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, {
    contentType: file.type,
  });
  if (error) throw new Error(error.message);
  await confirmMediaUpload({
    data: { path: ticket.path, name: file.name, contentType: file.type, size: file.size },
  });
  return mediaUrlFor(ticket.path);
}

export function MediaLibraryDialog({
  open,
  onOpenChange,
  onPick,
  accept = "image",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (url: string) => void;
  accept?: "image" | "any";
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["media-assets"],
    queryFn: () => listMediaAssets() as Promise<Asset[]>,
    enabled: open,
  });

  const visible = accept === "image" ? assets.filter((a) => a.kind === "image") : assets;

  const doUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      let last = "";
      for (const file of Array.from(files)) last = await uploadBuilderFile(file);
      await qc.invalidateQueries({ queryKey: ["media-assets"] });
      if (last) {
        onPick(last);
        onOpenChange(false);
        toast.success("File added");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Media library</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="library">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="link">Paste link</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing here yet — upload your first image on the Upload tab.
              </p>
            ) : (
              <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
                {visible.map((a) => (
                  <div key={a.id} className="group relative overflow-hidden rounded-lg border">
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => {
                        onPick(a.url);
                        onOpenChange(false);
                      }}
                    >
                      {a.kind === "image" ? (
                        <img src={a.url} alt={a.name} className="h-24 w-full bg-muted object-cover" />
                      ) : (
                        <div className="flex h-24 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                          {a.kind}
                        </div>
                      )}
                      <span className="block truncate px-2 py-1 text-[11px]">{a.name}</span>
                    </button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-1 top-1 size-6 opacity-0 transition group-hover:opacity-100"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await deleteMediaAsset({ data: { id: a.id } });
                        await qc.invalidateQueries({ queryKey: ["media-assets"] });
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void doUpload(e.dataTransfer.files);
              }}
            >
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag files here, or choose from your device. Up to 50 MB each.</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={accept === "image" ? "image/*" : "image/*,video/mp4,video/webm"}
                className="hidden"
                onChange={(e) => void doUpload(e.target.files)}
              />
              <Button disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {busy ? "Uploading…" : "Choose files"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="link" className="mt-4 space-y-3">
            <Label className="text-xs">Image or video address</Label>
            <Input value={link} placeholder="https://…" onChange={(e) => setLink(e.target.value)} />
            <Button
              disabled={!/^https?:\/\//i.test(link.trim())}
              onClick={() => {
                onPick(link.trim());
                onOpenChange(false);
              }}
            >
              Use this link
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Inline field: preview + change/remove, backed by the library dialog. */
export function MediaField({
  label,
  value,
  onChange,
  accept = "image",
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  accept?: "image" | "any";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          value={value ?? ""}
          placeholder="https://… or upload"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setOpen(true)} title="Media library">
          <ImageIcon className="size-4" />
        </Button>
      </div>
      {value && accept === "image" ? (
        <img src={value} alt="" className="max-h-24 rounded border object-contain" />
      ) : null}
      <MediaLibraryDialog open={open} onOpenChange={setOpen} onPick={onChange} accept={accept} />
    </div>
  );
}
