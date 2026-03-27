"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "../../../../shared/ui/badge";

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

const LEVEL_COLORS: Record<string, string> = {
  student_teacher: "border-bronze text-bronze",
  associate: "border-bronze text-bronze",
  licentiate: "border-silver text-silver",
  fellow: "border-gold text-gold",
};

const LEVEL_LABELS: Record<string, string> = {
  student_teacher: "Student Teacher",
  associate: "Associate",
  licentiate: "Licentiate",
  fellow: "Fellow",
};

export interface FigureListItem {
  id: number;
  name: string;
  variantName: string | null;
  level: string;
  figureNumber: number | null;
}

interface FigureListFiltersProps {
  danceSlug: string;
  figures: FigureListItem[];
}

export function FigureListFilters({ danceSlug, figures }: FigureListFiltersProps) {
  const [search, setSearch] = useState("");
  const [enabledLevels, setEnabledLevels] = useState<Record<LevelGroup, boolean>>({
    bronze: true,
    silver: true,
    gold: true,
  });

  const toggleLevel = useCallback((group: LevelGroup) => {
    setEnabledLevels((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return figures.filter((f) => {
      const levelGroup = LEVEL_TO_GROUP[f.level] ?? "bronze";
      if (!enabledLevels[levelGroup]) return false;
      if (!query) return true;
      const name = f.name.toLowerCase();
      const variant = f.variantName?.toLowerCase() ?? "";
      return name.includes(query) || variant.includes(query);
    });
  }, [figures, search, enabledLevels]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search figures..."
          className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-2">
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
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length === figures.length
          ? `${figures.length} figures`
          : `${filtered.length} of ${figures.length} figures`}
      </p>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          No figures match your search.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((figure) => (
            <Link
              key={figure.id}
              href={`/dances/${danceSlug}/figures/${figure.id}`}
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-muted-foreground/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                {figure.figureNumber != null && (
                  <span className="text-muted-foreground text-sm font-mono w-6">
                    {figure.figureNumber}
                  </span>
                )}
                <div>
                  <span className="font-medium">{figure.name}</span>
                  {figure.variantName && (
                    <span className="text-muted-foreground ml-2 text-sm">
                      ({figure.variantName})
                    </span>
                  )}
                </div>
              </div>
              <Badge
                variant="outline"
                className={LEVEL_COLORS[figure.level]}
              >
                {LEVEL_LABELS[figure.level]}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
