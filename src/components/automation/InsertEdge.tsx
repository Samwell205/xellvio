import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useBuilder } from "./context";

function InsertEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [hover, setHover] = useState(false);
  const actions = useBuilder();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected || hover ? "var(--primary)" : "var(--border)",
          strokeWidth: selected || hover ? 2.5 : 2,
          transition: "stroke 150ms ease, stroke-width 150ms ease",
        }}
      />
      {/* Wide invisible hit area so hovering the line is easy. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <button
            type="button"
            aria-label="Add a step here"
            onClick={() => actions.insertOnEdge(id)}
            className={`flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-all duration-150 hover:scale-110 hover:border-primary hover:text-primary ${
              hover || selected ? "opacity-100" : "opacity-0"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const InsertEdge = memo(InsertEdgeInner);
