"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
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
import { computeFullGraphLayout } from "./full-layout";

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

const LEVEL_LEGEND = [
  { label: "Bronze (Student Teacher + Associate)", color: "#CD7F32" },
  { label: "Silver (Licentiate)", color: "#C0C0C0" },
  { label: "Gold (Fellow)", color: "#FFD700" },
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

  const precedes = figures.filter((f) => precedeIds.has(f.id) && !bothIds.has(f.id));
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
      const nodeId = idSuffix ? `${fig.id}-${idSuffix}` : String(fig.id);
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

  // Remap edges: precede edges use -pre source, follow edges use -fol target
  const remappedEdges = edges.map((e) => {
    if (e.targetFigureId === centerFigureId && precedeIds.has(e.sourceFigureId)) {
      return { ...e, _sourceNode: `${e.sourceFigureId}-pre` };
    }
    if (e.sourceFigureId === centerFigureId && followIds.has(e.targetFigureId)) {
      return { ...e, _targetNode: `${e.targetFigureId}-fol` };
    }
    return e;
  });

  return { nodes, edges: remappedEdges };
}

function layoutFull(
  figures: GraphFigure[],
  edges: GraphEdge[],
  danceSlug: string
): Node<FigureNodeData>[] {
  const positioned = computeFullGraphLayout(
    figures.map((figure) => ({ id: String(figure.id) })),
    edges.map((edge) => ({
      source: String(edge.sourceFigureId),
      target: String(edge.targetFigureId),
    }))
  );

  const positionById = new Map(
    positioned.map((node) => [node.id, node.position])
  );

  return figures.map((fig) => ({
    id: String(fig.id),
    type: "figure",
    position: positionById.get(String(fig.id)) ?? { x: 0, y: 0 },
    data: { ...makeNodeData(fig, danceSlug), handleDirection: "vertical" as const },
  }));
}

type MappedGraphEdge = GraphEdge & { _sourceNode?: string; _targetNode?: string };

function buildEdges(edges: MappedGraphEdge[], opts?: { isFullGraph?: boolean }): Edge[] {
  const isFullGraph = opts?.isFullGraph ?? false;
  return edges.map((edge) => ({
    id: `e${edge.id}${edge._sourceNode ? "-pre" : ""}${edge._targetNode ? "-fol" : ""}`,
    source: edge._sourceNode ?? String(edge.sourceFigureId),
    target: edge._targetNode ?? String(edge.targetFigureId),
    style: {
      stroke: EDGE_COLOR,
      strokeWidth: isFullGraph ? 1 : 1.5,
      opacity: isFullGraph ? 0.6 : 0.4,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: EDGE_COLOR,
      width: isFullGraph ? 10 : 15,
      height: isFullGraph ? 10 : 15,
    },
  }));
}

const nodeTypes: NodeTypes = {
  figure: FigureNode,
};

export function DanceGraph({ danceSlug, figures, edges, centerFigureId }: DanceGraphProps) {
  const isFullGraph = centerFigureId == null;

  const [enabledLevels, setEnabledLevels] = useState<Record<LevelGroup, boolean>>({
    bronze: true,
    silver: true,
    gold: true,
  });

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const toggleLevel = useCallback((group: LevelGroup) => {
    setEnabledLevels((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  const filteredFigures = useMemo(() => {
    const visible = figures.filter(
      (f) => enabledLevels[LEVEL_TO_GROUP[f.level] ?? "bronze"]
    );

    if (!isFullGraph) {
      if (visible.some((f) => f.id === centerFigureId)) {
        return visible;
      }
      const centerFigure = figures.find((f) => f.id === centerFigureId);
      return centerFigure ? [...visible, centerFigure] : visible;
    }

    return visible;
  }, [figures, enabledLevels, centerFigureId, isFullGraph]);

  const visibleIds = useMemo(
    () => new Set(filteredFigures.map((f) => f.id)),
    [filteredFigures]
  );

  const filteredEdges = useMemo(
    () => edges.filter((e) =>
      visibleIds.has(e.sourceFigureId) &&
      visibleIds.has(e.targetFigureId) &&
      enabledLevels[LEVEL_TO_GROUP[e.level] ?? "bronze"]
    ),
    [edges, visibleIds, enabledLevels]
  );

  // Layout is computed from all filtered figures/edges (stable positions)
  const { layoutNodes, layoutEdges } = useMemo(() => {
    if (!isFullGraph) {
      const local = layoutLocal(filteredFigures, filteredEdges, centerFigureId!, danceSlug);
      return { layoutNodes: local.nodes, layoutEdges: local.edges };
    }
    return {
      layoutNodes: layoutFull(filteredFigures, filteredEdges, danceSlug),
      layoutEdges: filteredEdges as MappedGraphEdge[],
    };
  }, [filteredFigures, filteredEdges, centerFigureId, danceSlug, isFullGraph]);

  // For full graph: compute connected node IDs for the hovered node
  const connectedNodeIds = useMemo(() => {
    if (!isFullGraph || !hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    for (const edge of layoutEdges) {
      const src = (edge as MappedGraphEdge)._sourceNode ?? String(edge.sourceFigureId);
      const tgt = (edge as MappedGraphEdge)._targetNode ?? String(edge.targetFigureId);
      if (src === hoveredNodeId || tgt === hoveredNodeId) {
        ids.add(src);
        ids.add(tgt);
      }
    }
    return ids;
  }, [isFullGraph, hoveredNodeId, layoutEdges]);

  // Apply dimming to nodes when hovering in full graph mode
  const displayNodes = useMemo(() => {
    if (!isFullGraph || !connectedNodeIds) return layoutNodes;
    return layoutNodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: connectedNodeIds.has(node.id) ? 1 : 0.25,
        transition: "opacity 0.15s ease",
      },
    }));
  }, [layoutNodes, connectedNodeIds, isFullGraph]);

  // For full graph: only show edges connected to hovered node; local graph shows all
  const displayEdges = useMemo(() => {
    if (!isFullGraph) {
      return buildEdges(layoutEdges);
    }
    if (!hoveredNodeId) {
      return [];
    }
    const hoverEdges = layoutEdges.filter((edge) => {
      const src = (edge as MappedGraphEdge)._sourceNode ?? String(edge.sourceFigureId);
      const tgt = (edge as MappedGraphEdge)._targetNode ?? String(edge.targetFigureId);
      return src === hoveredNodeId || tgt === hoveredNodeId;
    });
    return buildEdges(hoverEdges, { isFullGraph: true });
  }, [layoutEdges, hoveredNodeId, isFullGraph]);

  const [nodes, setNodes, onNodesChange] = useNodesState(displayNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(displayEdges);

  useEffect(() => { setNodes(displayNodes); }, [displayNodes, setNodes]);
  useEffect(() => { setEdges(displayEdges); }, [displayEdges, setEdges]);

  return (
    <div className="h-[calc(100vh-200px)] min-h-[500px] rounded-lg border border-border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
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
        {isFullGraph && (
          <Panel
            position="top-left"
            className="rounded-md border border-border bg-card/90 px-3 py-2 shadow-sm backdrop-blur"
          >
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Levels
            </p>
            <div className="space-y-1.5">
              {LEVEL_LEGEND.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-foreground">{item.label}</span>
                </div>
              ))}
            </div>
            {!hoveredNodeId && (
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                Hover a figure to see transitions
              </p>
            )}
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
