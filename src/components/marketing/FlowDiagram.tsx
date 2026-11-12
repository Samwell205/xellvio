import type { AutomationTemplate } from "@/lib/automation-templates";
import { stepLabel } from "@/lib/marketing/automation-step-label";

/* Read-only diagram drawn from a template's real node positions and edges, so
   branches appear side by side (never as a sequence). Pure SVG: no links,
   inputs, editing or requests. Shared by template cards and detail pages. */

const NW = 260, NH = 64, PAD = 40;

function kind(type: string) {
  if (type.startsWith("trigger.")) return "fill-primary/15 stroke-primary";
  if (type.startsWith("logic.")) return "fill-accent stroke-border";
  if (type.startsWith("timing.")) return "fill-muted stroke-border";
  return "fill-card stroke-border";
}

export function FlowDiagram({ flow, className, detail = false }: { flow: AutomationTemplate; className?: string; detail?: boolean }) {
  const xs = flow.nodes.map((n) => n.position.x), ys = flow.nodes.map((n) => n.position.y);
  const minX = Math.min(...xs) - NW / 2 - PAD, maxX = Math.max(...xs) + NW / 2 + PAD;
  const minY = Math.min(...ys) - PAD, maxY = Math.max(...ys) + NH + PAD;
  const byKey = new Map(flow.nodes.map((n) => [n.key, n]));
  const fs = detail ? 20 : 24;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" className={className} aria-hidden focusable="false">
      {flow.edges.map((e, i) => {
        const a = byKey.get(e.source), b = byKey.get(e.target);
        if (!a || !b) return null;
        const x1 = a.position.x, y1 = a.position.y + NH, x2 = b.position.x, y2 = b.position.y;
        const my = (y1 + y2) / 2;
        return (
          <g key={i}>
            <path d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" strokeWidth={3} className="stroke-primary/60" />
            {e.sourceHandle && (
              <text x={(x1 + x2) / 2 + (x2 === x1 ? 14 : 0)} y={my} fontSize={fs - 4} textAnchor="middle" className="fill-muted-foreground font-semibold">
                {e.sourceHandle}
              </text>
            )}
          </g>
        );
      })}
      {flow.nodes.map((n) => {
        const label = stepLabel(n.type);
        return (
          <g key={n.key}>
            <rect x={n.position.x - NW / 2} y={n.position.y} width={NW} height={NH} rx={14} strokeWidth={2} className={kind(n.type)} />
            <text x={n.position.x} y={n.position.y + NH / 2 + fs / 3} fontSize={fs} textAnchor="middle" className="fill-foreground font-semibold">
              {label.length > 22 ? label.slice(0, 21) + "…" : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
