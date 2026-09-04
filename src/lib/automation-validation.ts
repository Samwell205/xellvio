import { isTriggerType, outputsFor, stepDef, type NodeConfig } from "./automation-catalog";

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
      const ok = list.some(
        (c) => c?.field && c?.operator && (String(c.value ?? "").length > 0 || String(c.operator).includes("exist")),
      );
      if (!ok) return true;
      continue;
    }
    if (value === undefined || value === null || String(value).trim() === "") return true;
  }
  if (type === "timing.wait" || type === "timing.wait_for_reply") {
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
  if (type === "trigger.keyword_received") {
    const kw = String(config["keyword"] ?? "").trim().toUpperCase();
    if (RESERVED_KEYWORDS.includes(kw)) return true;
  }
  return false;
}

/** Compliance keywords the carrier handles — never usable as marketing triggers. */
export const RESERVED_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "HELP"];

// ---------------------------------------------------------------------------
// Connection rules
// ---------------------------------------------------------------------------

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

/**
 * The single source of truth for "may these two steps be linked?".
 * Used by the canvas (drag + click to connect) and by validation, so the
 * builder can never create a link the engine could not follow.
 */
export function canConnect(
  nodes: GraphNode[],
  edges: GraphEdge[],
  conn: { source: string; target: string; sourceHandle?: string | null },
): ConnectionCheck {
  if (!conn.source || !conn.target) return { ok: false, reason: "Incomplete connection." };
  if (conn.source === conn.target) return { ok: false, reason: "A step cannot connect to itself." };

  const src = nodes.find((n) => n.id === conn.source);
  const tgt = nodes.find((n) => n.id === conn.target);
  if (!src || !tgt) return { ok: false, reason: "Step not found." };

  if (isTriggerType(tgt.type)) return { ok: false, reason: "Triggers always start the automation — nothing can lead into one." };

  const outs = outputsFor(src.type, src.config);
  if (!outs.length) {
    return {
      ok: false,
      reason: src.type === "logic.exit" ? "Exit Automation ends the journey — nothing can follow it." : "This step has no outgoing branch.",
    };
  }

  const handle = conn.sourceHandle ?? outs[0]!.id;
  if (!outs.some((o) => o.id === handle)) return { ok: false, reason: "That branch no longer exists." };

  if (edges.some((e) => e.source === conn.source && (e.sourceHandle ?? outs[0]!.id) === handle)) {
    const branch = outs.find((o) => o.id === handle)?.label.replace(/ ·.*$/, "");
    return { ok: false, reason: branch ? `The ${branch} branch already leads somewhere. Remove that link first.` : "That branch already leads somewhere. Remove the existing link first." };
  }

  if (edges.some((e) => e.source === conn.source && e.target === conn.target && (e.sourceHandle ?? outs[0]!.id) === handle)) {
    return { ok: false, reason: "These steps are already linked." };
  }

  if (createsCycle(edges, conn.source, conn.target)) {
    return { ok: false, reason: "That link would loop the journey back on itself." };
  }

  return { ok: true };
}

/** Would adding source→target make the graph cyclical? (target already reaches source) */
function createsCycle(edges: GraphEdge[], source: string, target: string): boolean {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Nodes with no incoming link and no outgoing link that are not triggers. */
export function orphanNodeIds(nodes: GraphNode[], edges: GraphEdge[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (isTriggerType(n.type)) {
      if (!edges.some((e) => e.source === n.id)) out.add(n.id);
      continue;
    }
    if (!edges.some((e) => e.target === n.id)) out.add(n.id);
  }
  return out;
}

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[]): Issue[] {
  const issues: Issue[] = [];
  const triggers = nodes.filter((n) => isTriggerType(n.type));
  if (!nodes.length) {
    return [{ message: "This automation is empty. Add a trigger to begin.", severity: "error" }];
  }
  if (!triggers.length) issues.push({ message: "Add a trigger so people can enter this automation.", severity: "error" });
  if (triggers.length > 1) issues.push({ message: "Only one trigger is allowed. Remove the extra trigger.", severity: "error" });

  const label = (n: GraphNode) => stepDef(n.type).label;
  const orphans = orphanNodeIds(nodes, edges);

  for (const n of nodes) {
    if (stepDef(n.type).deprecated) {
      issues.push({
        nodeId: n.id,
        message: `${label(n)} is no longer supported. Replace it with an SMS step.`,
        severity: "error",
      });
    }
    if (n.disabled) continue;
    if (nodeNeedsConfig(n.type, n.config)) {
      issues.push({ nodeId: n.id, message: `${label(n)} needs to be configured.`, severity: "error" });
    }
    const outgoing = edges.filter((e) => e.source === n.id);
    if (orphans.has(n.id)) {
      issues.push({
        nodeId: n.id,
        message: isTriggerType(n.type)
          ? `${label(n)} is not connected to a first step.`
          : `${label(n)} is not connected — nothing leads into it.`,
        severity: "error",
      });
      if (!isTriggerType(n.type)) continue;
    }
    const handles = outputsFor(n.type, n.config);
    for (const h of handles) {
      const has = outgoing.some((e) => (e.sourceHandle ?? handles[0]!.id) === h.id);
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
    // Guard against handles that point nowhere real (e.g. a removed random path).
    for (const e of outgoing) {
      const handle = e.sourceHandle ?? handles[0]?.id;
      if (handle && handles.length && !handles.some((h) => h.id === handle)) {
        issues.push({ nodeId: n.id, message: `${label(n)} has a link on a branch that no longer exists.`, severity: "error" });
      }
    }
  }
  return issues;
}

/** Walks the graph from the trigger, choosing a branch for each split, for the test simulation. */
export function simulate(nodes: GraphNode[], edges: GraphEdge[]): { nodeId: string; note: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => isTriggerType(n.type));
  if (!start) return [];
  const steps: { nodeId: string; note: string }[] = [];
  let current: GraphNode | undefined = start;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const def = stepDef(current.type);
    let note = def.label;
    if (current.type === "action.send_sms") note = "Welcome/marketing SMS would be sent";
    if (current.type === "logic.check_consent") note = "SMS consent checked → Yes branch";
    if (current.type === "timing.wait") note = `Waiting ${current.config["amount"] ?? 1} ${String(current.config["unit"] ?? "days")}`;
    const handles = outputsFor(current.type, current.config);
    let chosen: string = handles[0]?.id ?? "out";
    if (handles.length > 1) {
      if (current.type.startsWith("logic.") && handles[0]!.id === "yes") {
        chosen = "yes";
        note = `${def.label} → Yes branch`;
      } else if (current.type === "timing.wait_for_reply") {
        chosen = "yes";
        note = "Waiting for a reply → Yes branch";
      } else {
        const pick = Math.floor(Math.random() * handles.length);
        chosen = handles[pick]!.id;
        note = `${def.label} → path ${handles[pick]!.label}`;
      }
    }
    steps.push({ nodeId: current.id, note: current.disabled ? `${note} (skipped — switched off)` : note });
    if (!handles.length) break;
    const next = edges.find((e) => e.source === current!.id && (e.sourceHandle ?? handles[0]!.id) === chosen);
    current = next ? byId.get(next.target) : undefined;
  }
  return steps;
}
