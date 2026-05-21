"use client";

import Link from "next/link";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

const LEVEL_BORDER_COLORS: Record<string, string> = {
  student_teacher: "var(--bronze-base)",
  associate: "var(--bronze-base)",
  licentiate: "var(--silver-base)",
  fellow: "var(--gold-base)",
};

export type FigureNodeData = {
  label: string;
  level: string;
  danceSlug: string;
  figureId: number;
  isCenterNode?: boolean;
  linkToGraph?: boolean;
  handleDirection?: "horizontal" | "vertical";
};

export type FigureNode = Node<FigureNodeData, "figure">;

export function FigureNode({ data }: NodeProps<FigureNode>) {
  const borderColor = LEVEL_BORDER_COLORS[data.level] ?? "var(--border)";
  const href = data.linkToGraph
    ? `/dances/${data.danceSlug}/figures/${data.figureId}/graph`
    : `/dances/${data.danceSlug}/figures/${data.figureId}`;

  const isVertical = data.handleDirection === "vertical";
  const targetPos = isVertical ? Position.Top : Position.Left;
  const sourcePos = isVertical ? Position.Bottom : Position.Right;

  return (
    <>
      <Handle type="target" position={targetPos} className="!bg-muted-foreground !w-2 !h-2" />
      <Link
        href={href}
        className="block cursor-pointer rounded-[2px] border-2 bg-card px-4 py-2.5 text-center transition-[background-color,border-color,color] hover:bg-secondary"
        style={{
          borderColor,
          outline: data.isCenterNode ? "1px solid var(--foreground)" : undefined,
          outlineOffset: data.isCenterNode ? "2px" : undefined,
        }}
      >
        <div className="text-sm font-medium leading-tight whitespace-nowrap">
          {data.label}
        </div>
      </Link>
      <Handle type="source" position={sourcePos} className="!bg-muted-foreground !w-2 !h-2" />
    </>
  );
}
