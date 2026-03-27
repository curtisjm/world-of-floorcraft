import dagre from "@dagrejs/dagre";

export interface FullLayoutNodeInput {
  id: string;
}

export interface FullLayoutEdgeInput {
  source: string;
  target: string;
}

export interface FullLayoutNodePosition {
  id: string;
  position: { x: number; y: number };
}

interface FullLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  nodesep?: number;
  ranksep?: number;
}

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 56;

export function computeFullGraphLayout(
  nodes: FullLayoutNodeInput[],
  edges: FullLayoutEdgeInput[],
  options?: FullLayoutOptions
): FullLayoutNodePosition[] {
  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const nodesep = options?.nodesep ?? 70;
  const ranksep = options?.ranksep ?? 120;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "TB",
    align: "UL",
    nodesep,
    ranksep,
    marginx: 40,
    marginy: 40,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  return nodes.map((node, index) => {
    const positioned = graph.node(node.id);
    if (!positioned) {
      return {
        id: node.id,
        position: {
          x: index * (nodeWidth + nodesep),
          y: 0,
        },
      };
    }

    return {
      id: node.id,
      position: {
        x: positioned.x - nodeWidth / 2,
        y: positioned.y - nodeHeight / 2,
      },
    };
  });
}
