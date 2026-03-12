"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

const LEVEL_BORDER_COLORS: Record<string, string> = {
  student_teacher: "#CD7F32",
  associate: "#CD7F32",
  licentiate: "#C0C0C0",
  fellow: "#FFD700",
};

const LEVEL_LABELS: Record<string, string> = {
  student_teacher: "ST",
  associate: "A",
  licentiate: "L",
  fellow: "F",
};

export type FigureNodeData = {
  label: string;
  level: string;
  variantName: string | null;
  figureNumber: number | null;
  danceSlug: string;
  figureId: number;
};

export type FigureNode = Node<FigureNodeData, "figure">;

export function FigureNode({ data }: NodeProps<FigureNode>) {
  const borderColor = LEVEL_BORDER_COLORS[data.level] ?? "#666";

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2 !h-2" />
      <a
        href={`/dances/${data.danceSlug}/figures/${data.figureId}`}
        className="block px-4 py-3 rounded-lg bg-card border-2 hover:brightness-125 transition-all cursor-pointer min-w-[140px] max-w-[220px] text-center"
        style={{ borderColor }}
      >
        <div className="text-sm font-medium leading-tight">{data.label}</div>
        {data.variantName && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {data.variantName}
          </div>
        )}
        <div
          className="text-[10px] font-mono mt-1 opacity-75"
          style={{ color: borderColor }}
        >
          {LEVEL_LABELS[data.level]}
        </div>
      </a>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2 !h-2" />
    </>
  );
}
