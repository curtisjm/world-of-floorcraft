"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@shared/ui/badge";

type LevelGroup = "bronze" | "silver" | "gold";

const LEVEL_TO_GROUP: Record<string, LevelGroup> = {
  student_teacher: "bronze",
  associate: "bronze",
  licentiate: "silver",
  fellow: "gold",
};

const TOGGLE_CONFIG: { key: LevelGroup; label: string; color: string }[] = [
  { key: "bronze", label: "Bronze", color: "var(--bronze-base)" },
  { key: "silver", label: "Silver", color: "var(--silver-matte)" },
  { key: "gold", label: "Gold", color: "var(--gold-base)" },
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search figures..."
          className="flex-1 rounded-[2px] border border-input bg-input-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-2">
          {TOGGLE_CONFIG.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleLevel(key)}
              className="rounded-[2px] border px-3 py-1.5 font-mono text-xs font-medium lowercase transition-all"
              style={{
                borderColor: color,
                backgroundColor: enabledLevels[key] ? color : "transparent",
                color: enabledLevels[key] ? "oklch(0.07 0 0)" : color,
                opacity: enabledLevels[key] ? 1 : 0.5,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="font-mono text-xs lowercase text-muted-foreground">
        {filtered.length === figures.length
          ? `${figures.length} figures`
          : `${filtered.length} of ${figures.length} figures`}
      </p>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No figures match your search.
        </p>
      ) : (
        <div className="atelier-panel overflow-hidden">
          {filtered.map((figure) => (
            <Link
              key={figure.id}
              href={`/dances/${danceSlug}/figures/${figure.id}`}
              className="grid gap-4 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-secondary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex items-center gap-4">
                {figure.figureNumber != null && (
                  <span className="text-muted-foreground text-sm font-mono w-6">
                    {figure.figureNumber}
                  </span>
                )}
                <div>
                  <span className="font-heading text-lg font-medium">{figure.name}</span>
                  {figure.variantName && (
                    <span className="ml-2 text-sm text-muted-foreground">
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
