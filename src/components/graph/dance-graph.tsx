"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
  type NodeTypes,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FigureNode, type FigureNodeData } from "./figure-node";

const LEVEL_EDGE_COLORS: Record<string, string> = {
  student_teacher: "#CD7F32",
  associate: "#CD7F32",
  licentiate: "#C0C0C0",
  fellow: "#FFD700",
};

const LEVEL_ORDER: Record<string, number> = {
  student_teacher: 0,
  associate: 1,
  licentiate: 2,
  fellow: 3,
};

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
}

/**
 * Simple layered layout: group figures by level, arrange in rows.
 */
function layoutNodes(
  figures: GraphFigure[],
  danceSlug: string
): Node<FigureNodeData>[] {
  const levels = ["student_teacher", "associate", "licentiate", "fellow"];
  const grouped = new Map<string, GraphFigure[]>();

  for (const level of levels) {
    grouped.set(level, []);
  }
  for (const fig of figures) {
    const group = grouped.get(fig.level);
    if (group) group.push(fig);
  }

  const nodes: Node<FigureNodeData>[] = [];
  const xGap = 220;
  const yGap = 150;

  let y = 0;
  for (const level of levels) {
    const group = grouped.get(level) ?? [];
    if (group.length === 0) continue;

    // Center the row
    const totalWidth = group.length * xGap;
    let x = -totalWidth / 2;

    for (const fig of group) {
      nodes.push({
        id: String(fig.id),
        type: "figure",
        position: { x, y },
        data: {
          label: fig.name,
          level: fig.level,
          variantName: fig.variantName,
          figureNumber: fig.figureNumber,
          danceSlug,
          figureId: fig.id,
        },
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
      stroke: LEVEL_EDGE_COLORS[edge.level] ?? "#666",
      strokeWidth: 1.5,
      opacity: 0.6,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: LEVEL_EDGE_COLORS[edge.level] ?? "#666",
      width: 15,
      height: 15,
    },
    label: edge.conditions ?? undefined,
    labelStyle: { fontSize: 10, fill: "#888" },
    animated: false,
  }));
}

const nodeTypes: NodeTypes = {
  figure: FigureNode,
};

export function DanceGraph({ danceSlug, figures, edges }: DanceGraphProps) {
  const initialNodes = useMemo(
    () => layoutNodes(figures, danceSlug),
    [figures, danceSlug]
  );
  const initialEdges = useMemo(() => buildEdges(edges), [edges]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-[calc(100vh-200px)] min-h-[500px] rounded-lg border border-border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
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
            return LEVEL_EDGE_COLORS[level] ?? "#666";
          }}
          className="!bg-card !border-border"
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
