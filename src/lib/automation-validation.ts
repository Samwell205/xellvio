import { outputsFor, stepDef, type NodeConfig } from "./automation-catalog";

export type GraphNode = {
  id: string;
  type: string;
  config: NodeConfig;
  disabled: boolean;
};
export type GraphEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

export type Issue = { nodeId?: string; message: string; severity: "error" | "warning" };

/** True when this node still needs configuration. */
export function nodeNeedsConfig(type: string, config: NodeConfig): boolean {
  const def = stepDef(type);
  for (const key of def.required ?? []) {
    const value = config[key];
    if (key === "conditions") {
      const list = Array.isArray(value) ? (value as any[]) : [];
      const ok = list.some((c) => c?.field && c?.operator && (String(c.value ?? "").length > 0 || String(c.operator).includes("exist")));
      if (!ok) return true;
      continue;
    }
    if (value === undefined || value === null || String(value).trim() === "") return true;
  }
  if (type === "timing.wait") {
    const n = Number(config["amount"] ?? 0);
    if (!Number.isFinite(n) || n <= 0) return true;
  }
  if (type === "logic.ab_split") {
    if (Number(config["split_a"] ?? 0) + Number(config["split_b"] ?? 0) !== 100) return true;
  }
  if (type === "logic.random_split") {
    const paths = Array.isArray(config["paths"]) ? (config["paths"] as any[]) : [];
    if (paths.length < 2 || paths.length > 5) return true;
    if (paths.reduce((s, p) => s + Number(p?.percent ?? 0), 0) !== 100) return true;
  }
  return false;
}

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[]): Issue[] {
  const issues: Issue[] = [];
  const triggers = nodes.filter((n) => n.type.startsWith("trigger."));
  if (!nodes.length) {
    return [{ message: "This automation is empty. Add a trigger to begin.", severity: "error" }];
  }
  if (!triggers.length) issues.push({ message: "Add a trigger so people can enter this automation.", severity: "error" });
  if (triggers.length > 1) issues.push({ message: "Only one trigger is allowed. Remove the extra trigger.", severity: "error" });

  const label = (n: GraphNode) => stepDef(n.type).label;

  for (const n of nodes) {
    if (n.disabled) continue;
    if (nodeNeedsConfig(n.type, n.config)) {
      issues.push({ nodeId: n.id, message: `${label(n)} needs to be configured.`, severity: "error" });
    }
    const incoming = edges.filter((e) => e.target === n.id);
    const outgoing = edges.filter((e) => e.source === n.id);
    if (!n.type.startsWith("trigger.") && incoming.length === 0) {
      issues.push({ nodeId: n.id, message: `${label(n)} is not connected to anything before it.`, severity: "error" });
    }
    const handles = outputsFor(n.type, n.config);
    for (const h of handles) {
      const has = outgoing.some((e) => (e.sourceHandle ?? "out") === h.id);
      if (!has) {
        const branchName = h.label ? h.label.replace(/ ·.*$/, "") : "";
        issues.push({
          nodeId: n.id,
          message: branchName
            ? `${label(n)} needs a step on its ${branchName} branch.`
            : `${label(n)} has nothing after it.`,
          severity: handles.length > 1 ? "error" : "warning",
        });
      }
    }
  }
  return issues;
}

/** Walks the graph from the trigger, choosing a branch for each split, for the test simulation. */
export function simulate(nodes: GraphNode[], edges: GraphEdge[]): { nodeId: string; note: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.type.startsWith("trigger."));
  if (!start) return [];
  const steps: { nodeId: string; note: string }[] = [];
  let current: GraphNode | undefined = start;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const def = stepDef(current.type);
    let note = def.label;
    const handles = outputsFor(current.type, current.config);
    let chosen: string = handles[0]?.id ?? "out";
    if (handles.length > 1) {
      if (current.type === "logic.if_else" || current.type === "logic.condition_split") {
        chosen = handles[0]!.id;
        note = `${def.label} → ${handles[0]!.label} branch`;
      } else {
        const pick = Math.floor(Math.random() * handles.length);
        chosen = handles[pick]!.id;
        note = `${def.label} → path ${handles[pick]!.label}`;
      }
    }
    steps.push({ nodeId: current.id, note: current.disabled ? `${note} (skipped — switched off)` : note });
    if (!handles.length) break;
    const next = edges.find((e) => e.source === current!.id && (e.sourceHandle ?? "out") === chosen);
    current = next ? byId.get(next.target) : undefined;
  }
  return steps;
}
