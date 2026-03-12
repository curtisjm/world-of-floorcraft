"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

const LEVEL_BORDER_COLORS: Record<string, string> = {
  student_teacher: "#CD7F32",
  associate: "#CD7F32",
  licentiate: "#C0C0C0",
  fellow: "#FFD700",
};

export type FigureNodeData = {
  label: string;
  level: string;
  danceSlug: string;
  figureId: number;
  isCenterNode?: boolean;
  linkToGraph?: boolean;
};

export type FigureNode = Node<FigureNodeData, "figure">;

export function FigureNode({ data }: NodeProps<FigureNode>) {
  const borderColor = LEVEL_BORDER_COLORS[data.level] ?? "#666";
  const href = data.linkToGraph
    ? `/dances/${data.danceSlug}/figures/${data.figureId}/graph`
    : `/dances/${data.danceSlug}/figures/${data.figureId}`;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2 !h-2" />
      <a
        href={href}
        className="block px-4 py-2.5 rounded-lg bg-card border-2 hover:brightness-125 transition-all cursor-pointer text-center"
        style={{
          borderColor,
          boxShadow: data.isCenterNode ? `0 0 12px ${borderColor}` : undefined,
        }}
      >
        <div className="text-sm font-medium leading-tight whitespace-nowrap">
          {data.label}
        </div>
      </a>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2 !h-2" />
    </>
  );
}
