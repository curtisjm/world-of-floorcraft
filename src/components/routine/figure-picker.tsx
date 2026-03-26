"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const LEVEL_ORDER = ["student_teacher", "associate", "licentiate", "fellow"] as const;
const LEVEL_LABELS: Record<string, string> = {
  student_teacher: "Bronze",
  associate: "Silver",
  licentiate: "Gold",
  fellow: "Fellow",
};
const LEVEL_COLORS: Record<string, string> = {
  student_teacher: "text-bronze",
  associate: "text-silver",
  licentiate: "text-gold",
  fellow: "text-foreground",
};

export type PickerFigure = {
  id: number;
  name: string;
  variantName: string | null;
  level: string;
  figureNumber: number | null;
};

export function FigurePicker({
  figures,
  allowedFigureIds,
  showAllFigures,
  onToggleShowAll,
  onSelectFigure,
  title,
  maxLevel,
}: {
  figures: PickerFigure[];
  allowedFigureIds: Set<number> | null;
  showAllFigures: boolean;
  onToggleShowAll: () => void;
  onSelectFigure: (figureId: number) => void;
  title: string;
  maxLevel?: (typeof LEVEL_ORDER)[number] | null;
}) {
  const [search, setSearch] = useState("");

  const displayFigures = useMemo(() => {
    let list = figures;

    // Filter by level ceiling
    if (maxLevel) {
      const maxIdx = LEVEL_ORDER.indexOf(maxLevel);
      list = list.filter(
        (f) => LEVEL_ORDER.indexOf(f.level as (typeof LEVEL_ORDER)[number]) <= maxIdx
      );
    }

    // Filter by allowed figures unless showing all
    if (allowedFigureIds && !showAllFigures) {
      list = list.filter((f) => allowedFigureIds.has(f.id));
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.variantName && f.variantName.toLowerCase().includes(q))
      );
    }

    // Sort by level order then figure number
    return [...list].sort((a, b) => {
      const la = LEVEL_ORDER.indexOf(a.level as (typeof LEVEL_ORDER)[number]);
      const lb = LEVEL_ORDER.indexOf(b.level as (typeof LEVEL_ORDER)[number]);
      if (la !== lb) return la - lb;
      return (a.figureNumber ?? 999) - (b.figureNumber ?? 999);
    });
  }, [figures, allowedFigureIds, showAllFigures, search, maxLevel]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border space-y-3">
        <p className="text-sm font-medium">{title}</p>
        <Input
          placeholder="Search figures..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        {allowedFigureIds && (
          <button
            onClick={onToggleShowAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAllFigures
              ? "Show only allowed figures"
              : `Show all figures (${figures.length})`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {displayFigures.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {search ? "No figures match your search." : "No figures available."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayFigures.map((figure) => {
              const isAllowed =
                !allowedFigureIds || allowedFigureIds.has(figure.id);
              return (
                <button
                  key={figure.id}
                  onClick={() => onSelectFigure(figure.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-accent/50 transition-colors ${
                    !isAllowed ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">
                      {figure.name}
                      {figure.variantName && (
                        <span className="text-muted-foreground">
                          {" "}
                          ({figure.variantName})
                        </span>
                      )}
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${LEVEL_COLORS[figure.level] ?? ""}`}
                    >
                      {LEVEL_LABELS[figure.level] ?? figure.level}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
