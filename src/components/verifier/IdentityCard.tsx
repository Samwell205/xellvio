import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getMyIdentity, submitMyIdentity } from "@/lib/verifier-kyc.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

async function toDataUrl(file: File, max = 1400): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export function IdentityCard() {
  const getFn = useServerFn(getMyIdentity);
  const submitFn = useServerFn(submitMyIdentity);
  const qc = useQueryClient();
  const { data: idn, isLoading } = useQuery({ queryKey: ["verifier", "identity"], queryFn: () => getFn() });
  const [nin, setNin] = useState("");
  const [selfie, setSelfie] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => submitFn({ data: { nin, selfie: selfie!, device_id: localStorage.getItem("xv_device_id") ?? undefined } }),
    onSuccess: (r: any) => {
      if (r.status === "approved") toast.success("Identity verified");
      else toast.error(r.note ?? "Verification failed");
      qc.invalidateQueries({ queryKey: ["verifier"] });
    },
    onError: (e: any) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["verifier"] });
    },
  });

  if (isLoading) return null;
  const showForm = !idn || idn.status === "rejected";

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle>Identity verification</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-400">
          One account per person. We check your NIN and a selfie automatically before you can withdraw.
        </p>
        {idn?.status === "approved" && (
          <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle2 className="size-4" /> Approved · NIN ending {idn.nin_last4}</div>
        )}
        {idn?.status === "pending" && (
          <div className="flex items-center gap-2 text-amber-400 text-sm"><Clock className="size-4" /> Checking · NIN ending {idn.nin_last4}</div>
        )}
        {idn?.status === "rejected" && (
          <div className="flex items-start gap-2 text-red-400 text-sm"><XCircle className="size-4 mt-0.5" /> Rejected{idn.admin_note ? `: ${idn.admin_note}` : ""}. Please submit again.</div>
        )}
        {showForm && (
          <>
            <div>
              <Label>NIN (11 digits)</Label>
              <Input inputMode="numeric" value={nin} onChange={(e) => setNin(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            </div>
            <div>
              <Label>Selfie (face only, good light)</Label>
              <Input type="file" accept="image/*" capture="user" onChange={async (e) => {
                const f = e.target.files?.[0]; if (f) setSelfie(await toDataUrl(f));
              }} />
              {selfie && <img src={selfie} alt="Selfie preview" className="mt-2 h-24 rounded border border-slate-700" />}
            </div>
            <Button disabled={mut.isPending || nin.length !== 11 || !selfie} onClick={() => mut.mutate()}>
              {mut.isPending ? "Checking…" : "Verify me"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
