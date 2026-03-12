"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type NodeTypes,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FigureNode, type FigureNodeData } from "./figure-node";

const EDGE_COLOR = "#888";

const LEVEL_NODE_COLORS: Record<string, string> = {
  student_teacher: "#CD7F32",
  associate: "#CD7F32",
  licentiate: "#C0C0C0",
  fellow: "#FFD700",
};

type LevelGroup = "bronze" | "silver" | "gold";

const LEVEL_TO_GROUP: Record<string, LevelGroup> = {
  student_teacher: "bronze",
  associate: "bronze",
  licentiate: "silver",
  fellow: "gold",
};

const TOGGLE_CONFIG: { key: LevelGroup; label: string; color: string }[] = [
  { key: "bronze", label: "Bronze", color: "#CD7F32" },
  { key: "silver", label: "Silver", color: "#C0C0C0" },
  { key: "gold", label: "Gold", color: "#FFD700" },
];

export interface GraphFigure {
  id: number;
  name: string;
  variantName: string | null;
  level: string;
  figureNumber: number | null;
}

export interface GraphEdge {
  id: number;
  sourceFigureId: number;
  targetFigureId: number;
  level: string;
  conditions: string | null;
}

interface DanceGraphProps {
  danceSlug: string;
  figures: GraphFigure[];
  edges: GraphEdge[];
  centerFigureId?: number;
}

function makeNodeData(
  fig: GraphFigure,
  danceSlug: string,
  opts?: { isCenterNode?: boolean; linkToGraph?: boolean }
): FigureNodeData {
  const label = fig.variantName
    ? `${fig.name} (${fig.variantName})`
    : fig.name;
  return {
    label,
    level: fig.level,
    danceSlug,
    figureId: fig.id,
    isCenterNode: opts?.isCenterNode,
    linkToGraph: opts?.linkToGraph,
  };
}

function layoutLocal(
  figures: GraphFigure[],
  edges: GraphEdge[],
  centerFigureId: number,
  danceSlug: string
): { nodes: Node<FigureNodeData>[]; edges: GraphEdge[] } {
  const centerFig = figures.find((f) => f.id === centerFigureId);
  if (!centerFig) return { nodes: [], edges: [] };

  const precedeIds = new Set(
    edges
      .filter((e) => e.targetFigureId === centerFigureId)
      .map((e) => e.sourceFigureId)
  );
  const followIds = new Set(
    edges
      .filter((e) => e.sourceFigureId === centerFigureId)
      .map((e) => e.targetFigureId)
  );

  precedeIds.delete(centerFigureId);
  followIds.delete(centerFigureId);

  // Figures that both precede and follow get a node on each side
  const bothIds = new Set([...precedeIds].filter((id) => followIds.has(id)));

  const precedes = figures.filter((f) => precedeIds.has(f.id));
  const follows = figures.filter((f) => followIds.has(f.id) && !bothIds.has(f.id));
  const bothFigures = figures.filter((f) => bothIds.has(f.id));

  const LEVEL_ORDER = ["student_teacher", "associate", "licentiate", "fellow"];
  const yGap = 55;
  const groupGap = 30; // extra gap between level groups
  const nodes: Node<FigureNodeData>[] = [];

  // Sort figures by level order, then by name
  function sortByLevel(figs: GraphFigure[]): GraphFigure[] {
    return [...figs].sort((a, b) => {
      const la = LEVEL_ORDER.indexOf(a.level);
      const lb = LEVEL_ORDER.indexOf(b.level);
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });
  }

  // Stack figures vertically with extra gaps between level groups
  function stackFigures(
    figs: GraphFigure[],
    xPos: number,
    idSuffix?: string,
  ) {
    const sorted = sortByLevel(figs);
    // Calculate total height including group gaps
    let totalHeight = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        totalHeight += yGap;
        if (LEVEL_TO_GROUP[sorted[i].level] !== LEVEL_TO_GROUP[sorted[i - 1].level]) {
          totalHeight += groupGap;
        }
      }
    }

    let y = -totalHeight / 2;
    for (let i = 0; i < sorted.length; i++) {
      const fig = sorted[i];
      if (i > 0) {
        y += yGap;
        if (LEVEL_TO_GROUP[fig.level] !== LEVEL_TO_GROUP[sorted[i - 1].level]) {
          y += groupGap;
        }
      }
      const nodeId = idSuffix
        ? (bothIds.has(fig.id) ? `${fig.id}-${idSuffix}` : String(fig.id))
        : String(fig.id);
      nodes.push({
        id: nodeId,
        type: "figure",
        position: { x: xPos, y },
        data: makeNodeData(fig, danceSlug, { linkToGraph: true }),
      });
    }
  }

  nodes.push({
    id: String(centerFig.id),
    type: "figure",
    position: { x: 0, y: 0 },
    data: makeNodeData(centerFig, danceSlug, { isCenterNode: true, linkToGraph: true }),
  });

  const leftFigures = [...precedes, ...bothFigures];
  const rightFigures = [...follows, ...bothFigures];

  stackFigures(leftFigures, -400, "pre");
  stackFigures(rightFigures, 400, "fol");

  // Remap edges so they point to the correct side's node
  const remappedEdges = edges.map((e) => {
    const newEdge = { ...e };
    // Precede edge: source → center. If source is in both, use the -pre node
    if (e.targetFigureId === centerFigureId && bothIds.has(e.sourceFigureId)) {
      return { ...newEdge, _sourceNode: `${e.sourceFigureId}-pre` };
    }
    // Follow edge: center → target. If target is in both, use the -fol node
    if (e.sourceFigureId === centerFigureId && bothIds.has(e.targetFigureId)) {
      return { ...newEdge, _targetNode: `${e.targetFigureId}-fol` };
    }
    return newEdge;
  });

  return { nodes, edges: remappedEdges };
}

function layoutFull(
  figures: GraphFigure[],
  danceSlug: string
): Node<FigureNodeData>[] {
  const levels = ["student_teacher", "associate", "licentiate", "fellow"];
  const grouped = new Map<string, GraphFigure[]>();
  for (const level of levels) grouped.set(level, []);
  for (const fig of figures) {
    grouped.get(fig.level)?.push(fig);
  }

  const nodes: Node<FigureNodeData>[] = [];
  const xGap = 220;
  const yGap = 150;

  let y = 0;
  for (const level of levels) {
    const group = grouped.get(level) ?? [];
    if (group.length === 0) continue;

    const totalWidth = group.length * xGap;
    let x = -totalWidth / 2;

    for (const fig of group) {
      nodes.push({
        id: String(fig.id),
        type: "figure",
        position: { x, y },
        data: makeNodeData(fig, danceSlug),
      });
      x += xGap;
    }
    y += yGap;
  }

  return nodes;
}

type MappedGraphEdge = GraphEdge & { _sourceNode?: string; _targetNode?: string };

function buildEdges(edges: MappedGraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: `e${edge.id}${edge._sourceNode ? "-pre" : ""}${edge._targetNode ? "-fol" : ""}`,
    source: edge._sourceNode ?? String(edge.sourceFigureId),
    target: edge._targetNode ?? String(edge.targetFigureId),
    style: {
      stroke: EDGE_COLOR,
      strokeWidth: 1.5,
      opacity: 0.4,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: EDGE_COLOR,
      width: 15,
      height: 15,
    },
  }));
}

const nodeTypes: NodeTypes = {
  figure: FigureNode,
};

export function DanceGraph({ danceSlug, figures, edges, centerFigureId }: DanceGraphProps) {
  const [enabledLevels, setEnabledLevels] = useState<Record<LevelGroup, boolean>>({
    bronze: true,
    silver: true,
    gold: true,
  });

  const toggleLevel = useCallback((group: LevelGroup) => {
    setEnabledLevels((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const filteredFigures = useMemo(
    () => figures.filter((f) => enabledLevels[LEVEL_TO_GROUP[f.level] ?? "bronze"]),
    [figures, enabledLevels]
  );

  const visibleIds = useMemo(
    () => new Set(filteredFigures.map((f) => f.id)),
    [filteredFigures]
  );

  const filteredEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.sourceFigureId) && visibleIds.has(e.targetFigureId)),
    [edges, visibleIds]
  );

  const { computedNodes, computedEdges } = useMemo(() => {
    if (centerFigureId != null) {
      const local = layoutLocal(filteredFigures, filteredEdges, centerFigureId, danceSlug);
      return { computedNodes: local.nodes, computedEdges: buildEdges(local.edges) };
    }
    return { computedNodes: layoutFull(filteredFigures, danceSlug), computedEdges: buildEdges(filteredEdges) };
  }, [filteredFigures, filteredEdges, centerFigureId, danceSlug]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  useEffect(() => { setNodes(computedNodes); }, [computedNodes, setNodes]);
  useEffect(() => { setEdges(computedEdges); }, [computedEdges, setEdges]);

  return (
    <div className="h-[calc(100vh-200px)] min-h-[500px] rounded-lg border border-border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
      >
        <Background color="#333" gap={20} />
        <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-secondary" />
        <MiniMap
          nodeColor={(node) => {
            const level = (node.data as FigureNodeData)?.level;
            return LEVEL_NODE_COLORS[level] ?? "#666";
          }}
          className="!bg-card !border-border"
          maskColor="rgba(0,0,0,0.7)"
        />
        <Panel position="top-right" className="flex gap-2">
          {TOGGLE_CONFIG.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleLevel(key)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border-2 transition-all"
              style={{
                borderColor: color,
                backgroundColor: enabledLevels[key] ? color : "transparent",
                color: enabledLevels[key] ? "#000" : color,
                opacity: enabledLevels[key] ? 1 : 0.5,
              }}
            >
              {label}
            </button>
          ))}
        </Panel>
      </ReactFlow>
    </div>
  );
}
