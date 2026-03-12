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
): Node<FigureNodeData>[] {
  const centerFig = figures.find((f) => f.id === centerFigureId);
  if (!centerFig) return [];

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

  const precedes = figures.filter((f) => precedeIds.has(f.id));
  const follows = figures.filter((f) => followIds.has(f.id));

  const yGap = 60;
  const nodes: Node<FigureNodeData>[] = [];

  nodes.push({
    id: String(centerFig.id),
    type: "figure",
    position: { x: 0, y: 0 },
    data: makeNodeData(centerFig, danceSlug, { isCenterNode: true, linkToGraph: true }),
  });

  const precedeStartY = -((precedes.length - 1) * yGap) / 2;
  precedes.forEach((fig, i) => {
    nodes.push({
      id: String(fig.id),
      type: "figure",
      position: { x: -350, y: precedeStartY + i * yGap },
      data: makeNodeData(fig, danceSlug, { linkToGraph: true }),
    });
  });

  const followStartY = -((follows.length - 1) * yGap) / 2;
  follows.forEach((fig, i) => {
    nodes.push({
      id: String(fig.id),
      type: "figure",
      position: { x: 350, y: followStartY + i * yGap },
      data: makeNodeData(fig, danceSlug, { linkToGraph: true }),
    });
  });

  return nodes;
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

function buildEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: `e${edge.id}`,
    source: String(edge.sourceFigureId),
    target: String(edge.targetFigureId),
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

  const computedNodes = useMemo(() => {
    if (centerFigureId != null) {
      return layoutLocal(filteredFigures, filteredEdges, centerFigureId, danceSlug);
    }
    return layoutFull(filteredFigures, danceSlug);
  }, [filteredFigures, filteredEdges, centerFigureId, danceSlug]);

  const computedEdges = useMemo(() => buildEdges(filteredEdges), [filteredEdges]);

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
