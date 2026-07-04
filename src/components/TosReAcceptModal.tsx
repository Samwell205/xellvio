// Blocks the app on next login when the tenant hasn't accepted the current
// ToS version. The dispatcher separately refuses to send for the same reason,
// so a tenant who dismisses via devtools still can't send anything.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { acceptTos, getTosStatus } from "@/lib/tos.functions";
import { TOS_LEGAL_TEXT, TOS_CURRENT_VERSION } from "@/lib/tos";

export function TosReAcceptModal() {
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [locallyAccepted, setLocallyAccepted] = useState(false);

  const statusFn = useServerFn(getTosStatus);
  const statusQ = useQuery({
    queryKey: ["tos-status", TOS_CURRENT_VERSION],
    queryFn: () => statusFn(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const acceptFn = useServerFn(acceptTos);
  const accept = useMutation({
    mutationFn: () => acceptFn({ data: { userAgent: navigator.userAgent.slice(0, 500) } }),
    onSuccess: async () => {
      setLocallyAccepted(true);
      qc.setQueryData(["tos-status", TOS_CURRENT_VERSION], {
        accepted: true,
        currentVersion: TOS_CURRENT_VERSION,
      });
      toast.success("Thank you — you can now send campaigns.");
      await qc.invalidateQueries({ queryKey: ["tos-status", TOS_CURRENT_VERSION] });
    },
    onError: (e: Error) => {
      console.error("[TosReAcceptModal] accept failed", e);
      toast.error(e.message || "Could not record acceptance. Please try again.");
    },
  });

  const open =
    !locallyAccepted && !accept.isPending && !!statusQ.data && !statusQ.data.accepted;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-3xl"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Updated Terms &amp; Acceptable Use Policy (v{TOS_CURRENT_VERSION})</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          We've updated the terms that govern your sending. Please review and accept before continuing.
          Campaign sending is paused until you accept.
        </p>
        <div className="max-h-[45vh] overflow-y-auto rounded-md border bg-muted/30 p-4 text-xs whitespace-pre-wrap font-mono leading-relaxed">
          {TOS_LEGAL_TEXT}
        </div>
        <div className="flex items-start gap-2 mt-2">
          <Checkbox id="tos-accept" checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <label htmlFor="tos-accept" className="text-sm leading-snug">
            I accept the updated Terms of Service, Acceptable Use Policy, and confirm I have valid opt-in
            consent for every recipient I send to. I understand Xellvio may suspend my sending without notice
            for flagged content or complaints.
          </label>
        </div>
        <DialogFooter>
          <Button disabled={!checked || accept.isPending} onClick={() => accept.mutate()}>
            {accept.isPending ? "Recording…" : "I accept and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
