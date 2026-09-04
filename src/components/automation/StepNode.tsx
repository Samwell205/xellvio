import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Copy, EyeOff, Link2, MoreVertical, Pencil, Plus, PlayCircle, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CATEGORY_META, configSummary, outputsFor, stepDef, type NodeConfig } from "@/lib/automation-catalog";
import { nodeNeedsConfig } from "@/lib/automation-validation";
import { cn } from "@/lib/utils";
import { useBuilder } from "./context";

export type StepNodeData = {
  stepType: string;
  label: string;
  config: NodeConfig;
  disabled: boolean;
  hasError?: boolean;
  isOrphan?: boolean;
};

function StepNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as StepNodeData;
  const def = stepDef(d.stepType);
  const meta = CATEGORY_META[def.category];
  const Icon = def.icon;
  const actions = useBuilder();
  const needsConfig = nodeNeedsConfig(d.stepType, d.config);
  const summary = configSummary(d.stepType, d.config);
  const outputs = outputsFor(d.stepType, d.config);
  const isTrigger = def.category === "trigger";
  const linked = actions.connectedHandles(id);
  const pending = actions.connectSource;
  const isPendingSource = pending?.nodeId === id;
  const canAccept = !!pending && !isPendingSource && actions.canAcceptConnect(id);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "group relative w-[264px] rounded-xl border border-l-4 bg-card text-card-foreground shadow-sm transition-all duration-200",
          meta.accent,
          selected ? "ring-2 ring-ring shadow-lg" : "hover:shadow-md hover:-translate-y-px",
          d.disabled && "opacity-55 saturate-50",
          d.hasError && "border-destructive",
          isPendingSource && "ring-2 ring-primary",
          canAccept && "ring-2 ring-emerald-500",
          !!pending && !canAccept && !isPendingSource && "opacity-45",
        )}
        onDoubleClick={() => actions.openConfig(id)}
        onClick={() => {
          if (canAccept) actions.completeConnect(id);
        }}
      >
        {!isTrigger && (
          <Handle
            type="target"
            position={Position.Top}
            isConnectableStart={false}
            className={cn(
              "!h-3 !w-3 !border-2 !border-background !bg-muted-foreground",
              canAccept && "!h-4 !w-4 !bg-emerald-500",
            )}
          />
        )}

        {canAccept && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.completeConnect(id);
            }}
            className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow"
          >
            Connect here
          </button>
        )}
        {isPendingSource && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actions.cancelConnect();
            }}
            className="absolute -top-8 left-1/2 z-10 -translate-x-1/2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow"
          >
            <X className="h-3 w-3" /> Pick a step to link to
          </button>
        )}

        <div className="flex items-center gap-2 px-3 pt-3">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", meta.soft, meta.text)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{meta.label}</span>
          <span className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label="Step options"
              >
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => actions.openConfig(id)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.duplicateNode(id)}>
                  <Copy className="mr-2 h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.toggleDisabled(id)}>
                  <EyeOff className="mr-2 h-4 w-4" /> {d.disabled ? "Enable" : "Disable"}
                </DropdownMenuItem>
                {d.stepType === "action.send_sms" && (
                  <DropdownMenuItem onClick={() => actions.testNode(id)}>
                    <PlayCircle className="mr-2 h-4 w-4" /> Send a test
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => actions.deleteNode(id)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>

        <div className="px-3 pb-3 pt-1.5">
          <p className="truncate text-sm font-semibold leading-tight">{d.label || def.label}</p>
          <p className={cn("mt-1 line-clamp-2 text-xs leading-relaxed", summary ? "text-muted-foreground" : "text-muted-foreground/70")}>
            {summary || def.description}
          </p>
          {needsConfig && !d.disabled && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" /> Configuration required
            </p>
          )}
          {d.isOrphan && !needsConfig && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Not connected
            </p>
          )}
          {d.disabled && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <EyeOff className="h-3 w-3" /> Switched off
            </p>
          )}
        </div>

        {/* ---------- outgoing branches ---------- */}
        {outputs.length === 1 && (
          <>
            <Handle
              type="source"
              id={outputs[0]!.id}
              position={Position.Bottom}
              className="!h-3 !w-3 !border-2 !border-background !bg-primary"
            />
            {!linked.has(outputs[0]!.id) && !pending && (
              <div className="absolute -bottom-9 left-1/2 flex -translate-x-1/2 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <BranchButton
                  tip="Add the next step"
                  onClick={() => actions.addAfter(id, outputs[0]!.id)}
                  icon={<Plus className="h-3.5 w-3.5" />}
                />
                <BranchButton
                  tip="Link to an existing step"
                  onClick={() => actions.beginConnect(id, outputs[0]!.id)}
                  icon={<Link2 className="h-3.5 w-3.5" />}
                />
              </div>
            )}
          </>
        )}

        {outputs.length > 1 && (
          <div className="relative h-6">
            {outputs.map((h, i) => {
              const left = ((i + 1) / (outputs.length + 1)) * 100;
              const done = linked.has(h.id);
              return (
                <div key={h.id}>
                  <span
                    className={cn(
                      "pointer-events-none absolute -bottom-4 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium",
                      done ? "bg-muted text-muted-foreground" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    )}
                    style={{ left: `${left}%` }}
                  >
                    {h.label}
                  </span>
                  <Handle
                    type="source"
                    id={h.id}
                    position={Position.Bottom}
                    style={{ left: `${left}%` }}
                    className={cn(
                      "!h-3 !w-3 !border-2 !border-background",
                      done ? "!bg-primary" : "!bg-amber-500",
                    )}
                  />
                  {!done && !pending && (
                    <div
                      className="absolute -bottom-14 flex -translate-x-1/2 items-center gap-1 opacity-0 transition group-hover:opacity-100"
                      style={{ left: `${left}%` }}
                    >
                      <BranchButton
                        tip={`Add a step on the ${h.label || "next"} branch`}
                        onClick={() => actions.addAfter(id, h.id)}
                        icon={<Plus className="h-3.5 w-3.5" />}
                      />
                      <BranchButton
                        tip="Link to an existing step"
                        onClick={() => actions.beginConnect(id, h.id)}
                        icon={<Link2 className="h-3.5 w-3.5" />}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function BranchButton({ tip, onClick, icon }: { tip: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition hover:bg-primary hover:text-primary-foreground"
          aria-label={tip}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[11px]">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export const StepNode = memo(StepNodeInner);
