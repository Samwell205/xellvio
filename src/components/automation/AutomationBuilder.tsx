import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Sparkles,
  Undo2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultConfig, isTriggerType, outputsFor, stepDef, type NodeConfig } from "@/lib/automation-catalog";
import {
  canConnect,
  orphanNodeIds,
  simulate,
  validateGraph,
  type GraphEdge,
  type GraphNode,
} from "@/lib/automation-validation";
import { AUTOMATION_TEMPLATES, materialiseTemplate } from "@/lib/automation-templates";
import { deleteAutomation, saveAutomation, setAutomationStatus, type AutomationRecord } from "@/lib/automations.functions";
import { sendFlowTest } from "@/lib/flows.functions";
import { cn } from "@/lib/utils";
import { BuilderContext, type BuilderActions } from "./context";
import { StepNode, type StepNodeData } from "./StepNode";
import { InsertEdge } from "./InsertEdge";
import { StepLibrary } from "./StepLibrary";
import { ConfigPanel, type ConfigTarget } from "./ConfigPanel";
import { AddStepDialog } from "./AddStepDialog";
import { TemplatePicker } from "./TemplatePicker";


type SNode = Node;
type Snapshot = { nodes: SNode[]; edges: Edge[] };

const nodeTypes = { step: StepNode };
const edgeTypes = { insert: InsertEdge };

let keyCounter = 0;
function newKey(prefix = "n") {
  keyCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${keyCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function toGraph(nodes: SNode[], edges: Edge[]): { g: GraphNode[]; e: GraphEdge[] } {
  return {
    g: nodes.map((n) => {
      const d = n.data as unknown as StepNodeData;
      return { id: n.id, type: d.stepType, config: d.config ?? {}, disabled: !!d.disabled };
    }),
    e: edges.map((x) => ({ id: x.id, source: x.source, target: x.target, sourceHandle: x.sourceHandle ?? null })),
  };
}

type Props = {
  automation: AutomationRecord;
  lists: { id: string; name: string }[];
  senders: { value: string; label: string }[];
  contacts: { id: string; label: string; phone: string }[];
};

export function AutomationBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}

function BuilderInner({ automation, lists, senders, contacts }: Props) {
  const navigate = useNavigate();
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const initial = useMemo(() => {
    const nodes: SNode[] = automation.nodes.map((n) => ({
      id: n.node_key,
      type: "step",
      position: n.position,
      data: {
        stepType: n.type,
        label: n.label,
        config: n.configuration ?? {},
        disabled: n.disabled,
      } as unknown as Record<string, unknown>,
    }));
    const edges: Edge[] = automation.connections.map((c) => ({
      id: c.edge_key,
      source: c.source_node_key,
      target: c.target_node_key,
      sourceHandle: c.source_handle ?? undefined,
      targetHandle: c.target_handle ?? undefined,
      type: "insert",
    }));
    return { nodes, edges };
  }, [automation.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState<SNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [name, setName] = useState(automation.name);
  const [status, setStatus] = useState(automation.status);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [triggerPickerOpen, setTriggerPickerOpen] = useState(false);
  const [insertEdgeId, setInsertEdgeId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [activateOpen, setActivateOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testContact, setTestContact] = useState<string>(contacts[0]?.id ?? "");
  const [testLog, setTestLog] = useState<{ nodeId: string; note: string }[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /** Click-to-connect: the branch we are currently linking from. */
  const [connectSource, setConnectSource] = useState<{ nodeId: string; handleId: string } | null>(null);
  /** When set, the next step picked is attached to this branch. */
  const [addAfterTarget, setAddAfterTarget] = useState<{ nodeId: string; handleId: string } | null>(null);


  // ---------- history ----------
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const applyingHistory = useRef(false);
  const clipboard = useRef<{ nodes: SNode[]; edges: Edge[] } | null>(null);

  const snapshot = useCallback(
    (): Snapshot => ({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }),
    [nodes, edges],
  );

  const commit = useCallback(() => {
    past.current = [...past.current.slice(-49), snapshot()];
    future.current = [];
    setHistoryTick((t) => t + 1);
  }, [snapshot]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [...future.current, snapshot()];
    applyingHistory.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryTick((t) => t + 1);
  }, [snapshot, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current, snapshot()];
    applyingHistory.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryTick((t) => t + 1);
  }, [snapshot, setNodes, setEdges]);

  // ---------- persistence ----------
  const save = useServerFn(saveAutomation);
  const setStatusFn = useServerFn(setAutomationStatus);
  const removeFlow = useServerFn(deleteAutomation);
  const smsTest = useServerFn(sendFlowTest);

  const saveMutation = useMutation({
    mutationFn: async (silent: boolean) => {
      setSaveState("saving");
      const viewport = rf.getViewport();
      await save({
        data: {
          id: automation.id,
          name: name.trim() || "Untitled automation",
          viewport,
          nodes: nodes.map((n) => {
            const d = n.data as unknown as StepNodeData;
            return {
              node_key: n.id,
              type: d.stepType,
              label: d.label ?? "",
              position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
              configuration: (d.config ?? {}) as Record<string, unknown>,
              disabled: !!d.disabled,
            };
          }),
          connections: edges.map((e) => ({
            edge_key: e.id,
            source_node_key: e.source,
            target_node_key: e.target,
            source_handle: e.sourceHandle ?? null,
            target_handle: e.targetHandle ?? null,
          })),
        },
      });
      return silent;
    },
    onSuccess: (silent) => {
      setSaveState("saved");
      setLastSavedAt(new Date());
      if (!silent) toast.success("Automation saved");
    },
    onError: (err: Error) => {
      setSaveState("idle");
      toast.error(err.message || "Could not save");
    },
  });

  // autosave
  const dirty = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      // First render just mirrors what was loaded from the server — nothing to save.
      mounted.current = true;
      setSaveState("saved");
      return;
    }
    dirty.current = true;
    setSaveState("idle");
    const t = setTimeout(() => {
      if (dirty.current) {
        dirty.current = false;
        saveMutation.mutate(true);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, name]);

  // ---------- graph helpers ----------
  const issues = useMemo(() => {
    const { g, e } = toGraph(nodes, edges);
    return validateGraph(g, e);
  }, [nodes, edges]);
  const errors = issues.filter((i) => i.severity === "error");

  const patchNode = useCallback(
    (id: string, patch: Partial<StepNodeData>) => {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...(n.data as object), ...patch } as Record<string, unknown> } : n)),
      );
    },
    [setNodes],
  );

  const makeNode = useCallback((type: string, position: { x: number; y: number }): SNode => {
    const def = stepDef(type);
    return {
      id: newKey(),
      type: "step",
      position,
      data: { stepType: type, label: def.label, config: defaultConfig(type), disabled: false } as unknown as Record<string, unknown>,
    };
  }, []);

  /** Free outgoing branches of a step, in order. */
  const freeHandles = useCallback(
    (nodeId: string) => {
      const n = nodes.find((x) => x.id === nodeId);
      if (!n) return [];
      const d = n.data as unknown as StepNodeData;
      const outs = outputsFor(d.stepType, d.config ?? {});
      const taken = new Set(edges.filter((e) => e.source === nodeId).map((e) => e.sourceHandle ?? outs[0]?.id));
      return outs.filter((o) => !taken.has(o.id));
    },
    [nodes, edges],
  );

  const addStep = useCallback(
    (type: string, at?: { x: number; y: number }, attach?: { nodeId: string; handleId: string }) => {
      commit();
      const anchor = attach ? nodes.find((n) => n.id === attach.nodeId) : undefined;
      const fallback = anchor
        ? { x: anchor.position.x, y: anchor.position.y + 190 }
        : nodes.length
          ? { x: nodes[nodes.length - 1]!.position.x, y: Math.max(...nodes.map((n) => n.position.y)) + 190 }
          : { x: 0, y: 0 };
      const node = makeNode(type, at ?? fallback);
      setNodes((ns) => [...ns, node]);

      if (attach) {
        setEdges((es) => [
          ...es,
          { id: newKey("e"), source: attach.nodeId, target: node.id, sourceHandle: attach.handleId, type: "insert" },
        ]);
      } else if (!at && nodes.length) {
        // Auto-continue the chain from the lowest step when it has exactly one free branch.
        const lowest = nodes.reduce((a, b) => (a.position.y >= b.position.y ? a : b));
        const free = freeHandles(lowest.id);
        const outs = outputsFor(
          (lowest.data as unknown as StepNodeData).stepType,
          (lowest.data as unknown as StepNodeData).config ?? {},
        );
        if (outs.length === 1 && free.length === 1 && !isTriggerType(type)) {
          setEdges((es) => [
            ...es,
            { id: newKey("e"), source: lowest.id, target: node.id, sourceHandle: free[0]!.id, type: "insert" },
          ]);
        }
      }
      setConfigId(node.id);
      toast.success(`${stepDef(type).label} added`);
    },
    [commit, nodes, makeNode, setNodes, setEdges, freeHandles],
  );

  const insertBetween = useCallback(
    (edgeId: string, type: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;
      if (isTriggerType(type)) {
        toast.error("A trigger cannot sit in the middle of a journey.");
        return;
      }
      commit();
      const src = nodes.find((n) => n.id === edge.source);
      const tgt = nodes.find((n) => n.id === edge.target);
      const pos =
        src && tgt
          ? { x: (src.position.x + tgt.position.x) / 2, y: (src.position.y + tgt.position.y) / 2 }
          : { x: 0, y: 0 };
      const node = makeNode(type, pos);
      const outs = outputsFor(type, (node.data as unknown as StepNodeData).config);
      setNodes((ns) => [...ns, node]);
      setEdges((es) => [
        ...es.filter((e) => e.id !== edgeId),
        { id: newKey("e"), source: edge.source, target: node.id, sourceHandle: edge.sourceHandle ?? undefined, type: "insert" },
        ...(outs.length
          ? [{ id: newKey("e"), source: node.id, target: edge.target, sourceHandle: outs[0]!.id, type: "insert" } as Edge]
          : []),
      ]);
      setConfigId(node.id);
    },
    [edges, nodes, commit, makeNode, setNodes, setEdges],
  );

  /** Move an existing, unconnected step into the middle of a link. */
  const spliceIntoEdge = useCallback(
    (nodeId: string, edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (!edge || !node) return;
      const d = node.data as unknown as StepNodeData;
      if (isTriggerType(d.stepType)) return;
      const outs = outputsFor(d.stepType, d.config ?? {});
      commit();
      setEdges((es) => [
        ...es.filter((e) => e.id !== edgeId),
        { id: newKey("e"), source: edge.source, target: nodeId, sourceHandle: edge.sourceHandle ?? undefined, type: "insert" },
        ...(outs.length
          ? [{ id: newKey("e"), source: nodeId, target: edge.target, sourceHandle: outs[0]!.id, type: "insert" } as Edge]
          : []),
      ]);
      toast.success("Step inserted into the path");
    },
    [edges, nodes, commit, setEdges],
  );

  /** Nearest link to a canvas point, used when dropping a step on top of a link. */
  const edgeNear = useCallback(
    (pos: { x: number; y: number }, radius = 90) => {
      let best: { id: string; dist: number } | null = null;
      for (const e of edges) {
        const s = nodes.find((n) => n.id === e.source);
        const t = nodes.find((n) => n.id === e.target);
        if (!s || !t) continue;
        const mid = { x: (s.position.x + t.position.x) / 2 + 132, y: (s.position.y + t.position.y) / 2 + 60 };
        const dist = Math.hypot(mid.x - pos.x, mid.y - pos.y);
        if (dist <= radius && (!best || dist < best.dist)) best = { id: e.id, dist };
      }
      return best?.id ?? null;
    },
    [edges, nodes],
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const src = nodes.find((n) => n.id === id);
      if (!src) return;
      commit();
      const copy: SNode = {
        ...src,
        id: newKey(),
        position: { x: src.position.x + 60, y: src.position.y + 60 },
        selected: false,
        data: JSON.parse(JSON.stringify(src.data)),
      };
      setNodes((ns) => [...ns, copy]);
      toast.success("Step duplicated");
    },
    [nodes, commit, setNodes],
  );

  const removeNode = useCallback(
    (id: string) => {
      commit();
      // Heal the journey: reconnect what led in to what led out, so deleting a
      // step in the middle never leaves the rest of the path stranded.
      const incoming = edges.filter((e) => e.target === id);
      const outgoing = edges.filter((e) => e.source === id);
      const healed: Edge[] = [];
      if (incoming.length && outgoing.length) {
        const firstOut = outgoing[0]!;
        for (const inc of incoming) {
          healed.push({
            id: newKey("e"),
            source: inc.source,
            target: firstOut.target,
            sourceHandle: inc.sourceHandle ?? undefined,
            type: "insert",
          });
        }
      }
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => [...es.filter((e) => e.source !== id && e.target !== id), ...healed]);
      if (configId === id) setConfigId(null);
      setConnectSource(null);
      toast.success(healed.length ? "Step deleted and the path reconnected" : "Step deleted");
    },
    [commit, setNodes, setEdges, configId, edges],
  );

  const applyTemplate = useCallback(
    (templateId: string) => {
      const tpl = AUTOMATION_TEMPLATES.find((t) => t.id === templateId);
      if (!tpl) return;
      commit();
      const built = materialiseTemplate(tpl);
      const map = new Map<string, string>();
      const newNodes: SNode[] = built.nodes.map((n) => {
        const id = newKey();
        map.set(n.key, id);
        return {
          id,
          type: "step",
          position: n.position,
          data: {
            stepType: n.type,
            label: stepDef(n.type).label,
            config: n.config as NodeConfig,
            disabled: false,
          } as unknown as Record<string, unknown>,
        };
      });
      const newEdges: Edge[] = built.edges.map((e) => ({
        id: newKey("e"),
        source: map.get(e.source)!,
        target: map.get(e.target)!,
        sourceHandle: e.sourceHandle ?? outputsFor(
          built.nodes.find((n) => n.key === e.source)!.type,
          built.nodes.find((n) => n.key === e.source)!.config as NodeConfig,
        )[0]?.id,
        type: "insert",
      }));
      setNodes(newNodes);
      setEdges(newEdges);
      setName((prev) => (prev.trim().startsWith("Automation —") || !prev.trim() ? tpl.name : prev));
      setTemplatesOpen(false);
      setConfigId(null);
      toast.success(`${tpl.name} template applied — edit any step to make it yours`);
      setTimeout(() => rf.fitView({ padding: 0.25, duration: 400 }), 60);
    },
    [commit, setNodes, setEdges, rf],
  );

  const tryConnect = useCallback(
    (c: { source: string; target: string; sourceHandle?: string | null }) => {
      const { g, e } = toGraph(nodes, edges);
      const check = canConnect(g, e, c);
      if (!check.ok) {
        toast.error(check.reason);
        return false;
      }
      commit();
      setEdges((es) => [
        ...es,
        {
          id: newKey("e"),
          source: c.source,
          target: c.target,
          sourceHandle: c.sourceHandle ?? undefined,
          type: "insert",
        } as Edge,
      ]);

      return true;
    },
    [nodes, edges, commit, setEdges],
  );

  /** Drag an existing link's end onto another step to re-route it. */
  const reconnectEdge = useCallback(
    (oldEdge: Edge, c: Connection) => {
      const remaining = edges.filter((e) => e.id !== oldEdge.id);
      const { g, e } = toGraph(nodes, remaining);
      const check = canConnect(g, e, { source: c.source, target: c.target, sourceHandle: c.sourceHandle });
      if (!check.ok) {
        toast.error(check.reason);
        return;
      }
      commit();
      setEdges([
        ...remaining,
        { id: newKey("e"), source: c.source, target: c.target, sourceHandle: c.sourceHandle ?? undefined, type: "insert" },
      ]);
    },
    [edges, nodes, commit, setEdges],
  );

  const actions: BuilderActions = useMemo(

    () => ({
      openConfig: (id) => setConfigId(id),
      duplicateNode,
      deleteNode: (id) => setPendingDelete(id),
      toggleDisabled: (id) => {
        const n = nodes.find((x) => x.id === id);
        if (!n) return;
        commit();
        patchNode(id, { disabled: !(n.data as unknown as StepNodeData).disabled });
      },
      insertOnEdge: (edgeId) => {
        setInsertEdgeId(edgeId);
        setAddOpen(true);
      },
      testNode: () => setTestOpen(true),
      beginConnect: (nodeId, handleId) => setConnectSource({ nodeId, handleId }),
      cancelConnect: () => setConnectSource(null),
      completeConnect: (nodeId) => {
        if (!connectSource) return;
        const ok = tryConnect({ source: connectSource.nodeId, target: nodeId, sourceHandle: connectSource.handleId });
        if (ok) setConnectSource(null);
      },
      connectSource,
      canAcceptConnect: (nodeId) => {
        if (!connectSource) return false;
        const { g, e } = toGraph(nodes, edges);
        return canConnect(g, e, { source: connectSource.nodeId, target: nodeId, sourceHandle: connectSource.handleId }).ok;
      },
      connectedHandles: (nodeId) => {
        const n = nodes.find((x) => x.id === nodeId);
        const d = n?.data as unknown as StepNodeData | undefined;
        const outs = d ? outputsFor(d.stepType, d.config ?? {}) : [];
        return new Set(
          edges.filter((e) => e.source === nodeId).map((e) => String(e.sourceHandle ?? outs[0]?.id ?? "out")),
        );
      },
      addAfter: (nodeId, handleId) => {
        setAddAfterTarget({ nodeId, handleId });
        setAddOpen(true);
      },
    }),
    [duplicateNode, nodes, edges, commit, patchNode, connectSource, tryConnect],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      tryConnect({ source: c.source, target: c.target, sourceHandle: c.sourceHandle });
    },
    [tryConnect],
  );

  /** Live feedback while dragging a link — invalid targets simply won't accept it. */
  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const { g, e } = toGraph(nodes, edges);
      return canConnect(g, e, {
        source: (c as Connection).source ?? "",
        target: (c as Connection).target ?? "",
        sourceHandle: (c as Connection).sourceHandle ?? null,
      }).ok;
    },
    [nodes, edges],
  );

  // ---------- drag & drop from library ----------
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/xellvio-step");
      if (!type) return;
      const position = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Dropping right on top of a link inserts the step into that path.
      const hit = isTriggerType(type) ? null : edgeNear(position);
      if (hit) {
        insertBetween(hit, type);
        return;
      }
      addStep(type, { x: position.x - 130, y: position.y - 40 });
    },
    [rf, addStep, edgeNear, insertBetween],
  );

  /** Dragging an unconnected step onto a link splices it into the path. */
  const onNodeDragStop = useCallback(
    (_: unknown, node: SNode) => {
      const connected = edges.some((e) => e.source === node.id || e.target === node.id);
      if (connected) return;
      const hit = edgeNear({ x: node.position.x + 132, y: node.position.y + 60 }, 110);
      if (hit) spliceIntoEdge(node.id, hit);
    },
    [edges, edgeNear, spliceIntoEdge],
  );


  // ---------- keyboard ----------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveMutation.mutate(false);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape") {
        setConfigId(null);
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        const sel = nodes.filter((n) => n.selected);
        if (!sel.length) return;
        const ids = new Set(sel.map((n) => n.id));
        clipboard.current = {
          nodes: JSON.parse(JSON.stringify(sel)),
          edges: JSON.parse(JSON.stringify(edges.filter((x) => ids.has(x.source) && ids.has(x.target)))),
        };
        toast.success(`${sel.length} step${sel.length === 1 ? "" : "s"} copied`);
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        const clip = clipboard.current;
        if (!clip?.nodes.length) return;
        commit();
        const map = new Map<string, string>();
        const pasted = clip.nodes.map((n) => {
          const id = newKey();
          map.set(n.id, id);
          return { ...n, id, selected: true, position: { x: n.position.x + 70, y: n.position.y + 70 } };
        });
        const pastedEdges = clip.edges.map((x) => ({
          ...x,
          id: newKey("e"),
          source: map.get(x.source)!,
          target: map.get(x.target)!,
        }));
        setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...pasted]);
        setEdges((es) => [...es, ...pastedEdges]);
        toast.success("Pasted");
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = nodes.filter((n) => n.selected);
        const selEdges = edges.filter((x) => x.selected);
        if (!sel.length && !selEdges.length) return;
        e.preventDefault();
        if (sel.length === 1 && !selEdges.length) {
          setPendingDelete(sel[0]!.id);
          return;
        }
        commit();
        const ids = new Set(sel.map((n) => n.id));
        setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
        setEdges((es) => es.filter((x) => !x.selected && !ids.has(x.source) && !ids.has(x.target)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, undo, redo, commit]);

  // ---------- status ----------
  const changeStatus = async (next: typeof status) => {
    if (next === "active") {
      if (errors.length) {
        toast.error("Fix the highlighted problems before turning this on.");
        return;
      }
      await saveMutation.mutateAsync(true);
    }
    await setStatusFn({ data: { id: automation.id, status: next } });
    setStatus(next);
    toast.success(
      next === "active" ? "Automation is live" : next === "paused" ? "Automation paused" : "Automation set to draft",
    );
  };

  // ---------- test ----------
  const runTest = () => {
    const { g, e } = toGraph(nodes, edges);
    const steps = simulate(g, e);
    if (!steps.length) {
      toast.error("Add a trigger first.");
      return;
    }
    setTestLog(steps);
    const ids = new Set(steps.map((s) => s.nodeId));
    setNodes((ns) =>
      ns.map((n) => ({
        ...n,
        style: ids.has(n.id) ? { ...n.style, outline: "2px solid var(--primary)", borderRadius: 12 } : { ...n.style, outline: undefined },
      })),
    );
  };

  const configTarget: ConfigTarget | null = useMemo(() => {
    const n = nodes.find((x) => x.id === configId);
    if (!n) return null;
    const d = n.data as unknown as StepNodeData;
    return { id: n.id, stepType: d.stepType, label: d.label ?? "", config: d.config ?? {} };
  }, [configId, nodes]);

  const nodesWithFlags = useMemo(() => {
    const { g, e } = toGraph(nodes, edges);
    const orphans = orphanNodeIds(g, e);
    return nodes.map((n) => {
      const hasError = issues.some((i) => i.nodeId === n.id && i.severity === "error");
      const isOrphan = orphans.has(n.id);
      const d = n.data as unknown as StepNodeData;
      if (!!d.hasError === hasError && !!d.isOrphan === isOrphan) return n;
      return { ...n, data: { ...(n.data as object), hasError, isOrphan } as Record<string, unknown> };
    });
  }, [nodes, edges, issues]);


  const statusChip =
    status === "active"
      ? { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
      : status === "paused"
        ? { label: "Paused", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
        : { label: "Draft", cls: "bg-muted text-muted-foreground" };

  return (
    <BuilderContext.Provider value={actions}>
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        {/* ---------- TOOLBAR ---------- */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/automations">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Automations
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 w-[260px] border-transparent bg-transparent px-2 text-sm font-semibold shadow-none hover:border-border focus-visible:border-border"
          />
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", statusChip.cls)}>
            {status === "active" ? "● " : status === "paused" ? "○ " : ""}
            {statusChip.label}
          </span>

          <div className="ml-2 flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={undo} disabled={!past.current.length} aria-label="Undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={!future.current.length} aria-label="Redo">
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          <span className="ml-2 text-xs text-muted-foreground">
            {saveState === "saving" ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving...
              </span>
            ) : saveState === "saved" ? (
              `Saved${lastSavedAt ? " just now" : ""}`
            ) : (
              "Unsaved changes"
            )}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className={errors.length ? "text-destructive" : "text-muted-foreground"}>
                  {errors.length ? <AlertTriangle className="mr-1.5 h-4 w-4" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                  {errors.length ? `${errors.length} to fix` : "Looks good"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b px-3 py-2 text-sm font-semibold">
                  {issues.length ? "Automation checks" : "Everything checks out"}
                </div>
                <div className="max-h-72 overflow-auto p-1.5">
                  {issues.map((i, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (!i.nodeId) return;
                        const n = nodes.find((x) => x.id === i.nodeId);
                        if (!n) return;
                        setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === i.nodeId })));
                        rf.setCenter(n.position.x + 130, n.position.y + 60, { zoom: 1, duration: 400 });
                        setConfigId(i.nodeId);
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent"
                    >
                      <AlertTriangle
                        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", i.severity === "error" ? "text-destructive" : "text-amber-500")}
                      />
                      <span>{i.message}</span>
                    </button>
                  ))}
                  {!issues.length && (
                    <p className="px-2 py-3 text-xs text-muted-foreground">Every step is configured and connected.</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
              <LayoutTemplate className="mr-1.5 h-4 w-4" /> Templates
            </Button>
            <Button variant="outline" size="sm" onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending}>
              <Save className="mr-1.5 h-4 w-4" /> Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setTestLog(null); setTestOpen(true); }}>
              <Sparkles className="mr-1.5 h-4 w-4" /> Test
            </Button>
            {status === "active" ? (
              <Button size="sm" variant="secondary" onClick={() => changeStatus("paused")}>
                <Pause className="mr-1.5 h-4 w-4" /> Pause
              </Button>
            ) : (
              <Button size="sm" onClick={() => setActivateOpen(true)}>
                <Play className="mr-1.5 h-4 w-4" /> {status === "paused" ? "Resume" : "Activate"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => changeStatus("draft")}>Move back to draft</DropdownMenuItem>
                <DropdownMenuItem onClick={() => rf.fitView({ padding: 0.25, duration: 300 })}>Fit to screen</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteFlowOpen(true)}>
                  Delete automation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ---------- BODY ---------- */}
        <div className="flex min-h-0 flex-1">
          <StepLibrary
            collapsed={libraryCollapsed}
            onToggle={() => setLibraryCollapsed((v) => !v)}
            onAdd={(type) => addStep(type)}
          />

          <div ref={wrapper} className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
            <ReactFlow
              nodes={nodesWithFlags}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              connectionRadius={30}
              onNodeDragStart={() => commit()}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={(_, n) => {
                if (connectSource) return;
                setConfigId(n.id);
              }}
              onPaneClick={() => {
                setConfigId(null);
                setConnectSource(null);
              }}
              onEdgesDelete={() => commit()}
              edgesReconnectable

              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: "insert" }}
              defaultViewport={automation.viewport}
              snapToGrid
              snapGrid={[16, 16]}
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              selectionOnDrag
              panOnScroll
              minZoom={0.2}
              maxZoom={2}
              onInit={(inst: ReactFlowInstance) => {
                if (automation.nodes.length) inst.fitView({ padding: 0.25 });
              }}
              proOptions={{ hideAttribution: true }}
              className="bg-muted/20"
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} className="opacity-60" />
              <MiniMap
                pannable
                zoomable
                className="!bottom-4 !right-4 !rounded-lg !border !bg-card"
                nodeColor={() => "var(--primary)"}
                maskColor="color-mix(in oklab, var(--muted) 60%, transparent)"
              />
            </ReactFlow>

            {/* floating canvas controls */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-1 rounded-xl border bg-card/95 p-1 shadow-sm backdrop-blur">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => rf.zoomIn({ duration: 150 })} aria-label="Zoom in">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => rf.zoomOut({ duration: 150 })} aria-label="Zoom out">
                <Minus className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => rf.fitView({ padding: 0.25, duration: 300 })} aria-label="Fit to screen">
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Separator />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} aria-label="Undo" disabled={!past.current.length}>
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} aria-label="Redo" disabled={!future.current.length}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>

            {/* empty state */}
            {!nodes.length && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto max-w-sm rounded-2xl border bg-card/95 p-8 text-center shadow-sm backdrop-blur">
                  <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Zap className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-semibold">Start building your automation</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Choose a trigger to begin.</p>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button onClick={() => setTemplatesOpen(true)}>
                      <LayoutTemplate className="mr-1.5 h-4 w-4" /> Start from a template
                    </Button>
                    <Button variant="outline" onClick={() => setTriggerPickerOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" /> Choose a trigger myself
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* test log overlay */}
            {testLog && (
              <div className="absolute right-4 top-4 w-72 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
                <div className="flex items-center justify-between pb-2">
                  <p className="text-sm font-semibold">Test run</p>
                  <Button variant="ghost" size="sm" onClick={() => setTestLog(null)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <ol className="space-y-1.5">
                  <li className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Contact identified
                  </li>
                  {testLog.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>{s.note}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[11px] text-muted-foreground">Simulation only — no real messages were sent.</p>
              </div>
            )}
          </div>

          <ConfigPanel
            target={configTarget}
            lists={lists}
            senders={senders}
            onClose={() => setConfigId(null)}
            onSave={(id, label, config) => {
              commit();
              patchNode(id, { label, config });
            }}
            onSendTest={async (stepType, config) => {
              const phone = String(config["test_phone"] ?? "").trim();
              const body = String(config["body"] ?? "").trim();
              if (!phone || !body) {
                toast.error("Add a message and a test number first.");
                return;
              }
              try {
                await smsTest({ data: { phone, body } });
                toast.success("Test message sent");
              } catch (err) {
                toast.error((err as Error).message || "Could not send the test");
              }
            }}
          />
        </div>
      </div>

      {/* ---------- DIALOGS ---------- */}
      <AddStepDialog
        open={addOpen}
        hideTriggers={!!insertEdgeId || !!addAfterTarget}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) {
            setInsertEdgeId(null);
            setAddAfterTarget(null);
          }
        }}
        onPick={(type) => {
          if (insertEdgeId) insertBetween(insertEdgeId, type);
          else if (addAfterTarget) addStep(type, undefined, addAfterTarget);
          else addStep(type);
        }}
        title={addAfterTarget ? "What happens next?" : "Add a step here"}
        description="The step you pick is added and connected automatically."
      />

      <TemplatePicker open={templatesOpen} onOpenChange={setTemplatesOpen} onPick={applyTemplate} replacing={nodes.length > 0} />


      <AddStepDialog
        open={triggerPickerOpen}
        onOpenChange={setTriggerPickerOpen}
        onPick={(type) => addStep(type, { x: 0, y: 0 })}
        only="trigger"
        title="Choose a trigger"
        description="Pick what should let someone into this automation."
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this step?</AlertDialogTitle>
            <AlertDialogDescription>
              The step and its links will be removed. You can undo this straight after with Ctrl/Cmd + Z.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) removeNode(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={activateOpen} onOpenChange={setActivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{status === "paused" ? "Resume this automation?" : "Activate automation?"}</AlertDialogTitle>
            <AlertDialogDescription>
              Once activated, contacts can begin entering this workflow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errors.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <p className="font-semibold">This automation has problems:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={errors.length > 0}
              onClick={() => {
                void changeStatus("active");
                setActivateOpen(false);
              }}
            >
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteFlowOpen} onOpenChange={setDeleteFlowOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this automation?</AlertDialogTitle>
            <AlertDialogDescription>Everything in it will be removed. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await removeFlow({ data: { id: automation.id } });
                toast.success("Automation deleted");
                void navigate({ to: "/app/automations" });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test automation</DialogTitle>
            <DialogDescription>
              We walk a contact through your steps and show the path they would take. Nothing is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Test contact</Label>
            {contacts.length ? (
              <Select value={testContact} onValueChange={setTestContact}>
                <SelectTrigger><SelectValue placeholder="Select a contact" /></SelectTrigger>
                <SelectContent>
                  {contacts.slice(0, 100).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                You have no contacts yet — we will run the test with a sample contact.
              </p>
            )}
            {errors.length > 0 && (
              <p className="text-xs text-amber-600">
                Heads up: {errors.length} step{errors.length === 1 ? "" : "s"} still need attention.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                runTest();
                setTestOpen(false);
              }}
            >
              Run test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BuilderContext.Provider>
  );
}
