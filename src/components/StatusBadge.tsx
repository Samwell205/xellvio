import { CheckCircle2, Clock, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Status =
  | "pending"
  | "approved"
  | "active"
  | "rejected"
  | "failed"
  | "queued"
  | "sent"
  | "delivered"
  | "running"
  | "scheduled"
  | "completed"
  | "draft"
  | "paused_low_balance"
  | "processing";

const map: Record<Status, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Pending verification", cls: "bg-warning/15 text-warning-foreground border-warning/30", Icon: Clock },
  scheduled: { label: "Scheduled", cls: "bg-warning/15 text-warning-foreground border-warning/30", Icon: Clock },
  queued: { label: "Queued", cls: "bg-muted text-muted-foreground border-border", Icon: Clock },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border", Icon: Clock },
  processing: { label: "Processing", cls: "bg-warning/15 text-warning-foreground border-warning/30", Icon: Loader2 },
  paused_low_balance: { label: "Processing", cls: "bg-warning/15 text-warning-foreground border-warning/30", Icon: Loader2 },
  approved: { label: "Approved", cls: "bg-success/15 text-success border-success/30", Icon: CheckCircle2 },
  active: { label: "Active", cls: "bg-success/15 text-success border-success/30", Icon: CheckCircle2 },
  delivered: { label: "Delivered", cls: "bg-success/15 text-success border-success/30", Icon: CheckCircle2 },
  completed: { label: "Completed", cls: "bg-success/15 text-success border-success/30", Icon: CheckCircle2 },
  sent: { label: "Sent", cls: "bg-primary/15 text-primary border-primary/30", Icon: CheckCircle2 },
  running: { label: "Running", cls: "bg-primary/15 text-primary border-primary/30", Icon: Loader2 },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = (status?.toLowerCase() as Status) ?? "pending";
  const cfg = map[key] ?? map.pending;
  const { Icon } = cfg;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", cfg.cls, className)}>
      <Icon className={cn("size-3.5", (key === "running" || key === "processing" || key === "paused_low_balance") && "animate-spin")} />
      {cfg.label}
    </span>
  );
}
