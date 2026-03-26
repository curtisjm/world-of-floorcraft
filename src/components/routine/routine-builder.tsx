"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FigurePicker, type PickerFigure } from "./figure-picker";

const LEVEL_ORDER = ["student_teacher", "associate", "licentiate", "fellow"] as const;
type Level = (typeof LEVEL_ORDER)[number];

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

type RoutineEntry = {
  id: number;
  figureId: number;
  position: number;
  figureName: string;
  figureVariantName: string | null;
  figureLevel: string;
  figureNumber: number | null;
};

type InsertTarget =
  | { type: "append" }
  | { type: "before"; position: number }
  | { type: "after"; position: number };

export function RoutineBuilder({
  routineId,
  danceId,
  danceName,
  initialName,
  initialEntries,
}: {
  routineId: number;
  danceId: number;
  danceName: string;
  initialName: string;
  initialEntries: RoutineEntry[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [name, setName] = useState(initialName);
  const [entries, setEntries] = useState<RoutineEntry[]>(initialEntries);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [insertTarget, setInsertTarget] = useState<InsertTarget>({
    type: "append",
  });
  const [showAllFigures, setShowAllFigures] = useState(false);
  const [maxLevel, setMaxLevel] = useState<Level | null>(null);

  // Fetch all figures for this dance
  const { data: allFigures } = trpc.figure.list.useQuery({ danceId });

  // Fetch edges for the context figure (last entry or selected entry)
  const contextFigureId = useMemo(() => {
    if (entries.length === 0) return null;
    if (insertTarget.type === "append") {
      return entries[entries.length - 1].figureId;
    }
    if (insertTarget.type === "after") {
      const entry = entries.find((e) => e.position === insertTarget.position);
      return entry?.figureId ?? null;
    }
    if (insertTarget.type === "before") {
      // For "before", we want the figure before this position
      const idx = entries.findIndex(
        (e) => e.position === insertTarget.position
      );
      if (idx <= 0) return null; // No context — inserting at the very start
      return entries[idx - 1].figureId;
    }
    return null;
  }, [entries, insertTarget]);

  const { data: neighbors } = trpc.figure.neighbors.useQuery(
    { figureId: contextFigureId! },
    { enabled: contextFigureId !== null }
  );

  // Set of allowed following figure IDs
  const allowedFigureIds = useMemo(() => {
    if (!neighbors) return null;
    return new Set(neighbors.follows.map((e) => e.targetFigureId));
  }, [neighbors]);

  const addEntry = trpc.routine.addEntry.useMutation({
    onSuccess: () => {
      utils.routine.get.invalidate({ id: routineId });
    },
  });

  const removeEntry = trpc.routine.removeEntry.useMutation({
    onSuccess: () => {
      utils.routine.get.invalidate({ id: routineId });
    },
  });

  const updateRoutine = trpc.routine.update.useMutation();

  const handleSelectFigure = useCallback(
    async (figureId: number) => {
      const figure = allFigures?.find((f) => f.id === figureId);
      if (!figure) return;

      let position: number;
      if (entries.length === 0 || insertTarget.type === "append") {
        position = entries.length;
      } else if (insertTarget.type === "before") {
        position = insertTarget.position;
      } else {
        position = insertTarget.position + 1;
      }

      const result = await addEntry.mutateAsync({
        routineId,
        figureId,
        position,
      });

      if (result) {
        // Optimistically update local state
        const newEntry: RoutineEntry = {
          id: result.id,
          figureId,
          position,
          figureName: figure.name,
          figureVariantName: figure.variantName,
          figureLevel: figure.level,
          figureNumber: figure.figureNumber,
        };

        setEntries((prev) => {
          const shifted = prev.map((e) =>
            e.position >= position ? { ...e, position: e.position + 1 } : e
          );
          return [...shifted, newEntry].sort((a, b) => a.position - b.position);
        });

        // After adding, set insert target to append after the new entry
        setInsertTarget({ type: "append" });
        setSelectedIndex(null);
        setShowAllFigures(false);
      }
    },
    [allFigures, entries, insertTarget, routineId, addEntry]
  );

  const handleRemoveEntry = useCallback(
    async (entryId: number) => {
      await removeEntry.mutateAsync({ routineId, entryId });
      setEntries((prev) => {
        const removed = prev.find((e) => e.id === entryId);
        if (!removed) return prev;
        return prev
          .filter((e) => e.id !== entryId)
          .map((e) =>
            e.position > removed.position
              ? { ...e, position: e.position - 1 }
              : e
          );
      });
      setSelectedIndex(null);
      setInsertTarget({ type: "append" });
    },
    [routineId, removeEntry]
  );

  const handleSaveName = useCallback(async () => {
    if (name !== initialName) {
      await updateRoutine.mutateAsync({ id: routineId, name });
    }
  }, [name, initialName, routineId, updateRoutine]);

  const pickerTitle = useMemo(() => {
    if (entries.length === 0) return "Select first figure";
    if (insertTarget.type === "append") return "Add next figure";
    if (insertTarget.type === "before") {
      const entry = entries.find((e) => e.position === insertTarget.position);
      return `Insert before ${entry?.figureName ?? "figure"}`;
    }
    if (insertTarget.type === "after") {
      const entry = entries.find((e) => e.position === insertTarget.position);
      return `Insert after ${entry?.figureName ?? "figure"}`;
    }
    return "Select figure";
  }, [entries, insertTarget]);

  const pickerFigures: PickerFigure[] = useMemo(
    () =>
      (allFigures ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        variantName: f.variantName,
        level: f.level,
        figureNumber: f.figureNumber,
      })),
    [allFigures]
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-12rem)]">
      {/* Left: Routine sequence */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveName}
            className="text-lg font-semibold h-10"
            placeholder="Routine name..."
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/routines/dance/${danceName}`)}
          >
            Done
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground mr-1">Level:</span>
          {LEVEL_ORDER.map((level) => (
            <button
              key={level}
              onClick={() => setMaxLevel(maxLevel === level ? null : level)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
                maxLevel === level
                  ? "border-foreground/50 bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              } ${LEVEL_COLORS[level]}`}
            >
              {LEVEL_LABELS[level]}
            </button>
          ))}
          {maxLevel && (
            <button
              onClick={() => setMaxLevel(null)}
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-48 rounded-lg border border-dashed border-border">
              <p className="text-muted-foreground text-sm">
                Select a figure from the picker to start your routine.
              </p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const isSelected = selectedIndex === idx;
              return (
                <div key={entry.id}>
                  {/* Insert-before indicator */}
                  {isSelected && insertTarget.type === "before" && (
                    <div className="h-0.5 bg-primary rounded mx-2 my-1" />
                  )}

                  <Card
                    className={`px-4 py-2.5 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-accent/30"
                        : "hover:bg-accent/20"
                    }`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedIndex(null);
                        setInsertTarget({ type: "append" });
                      } else {
                        setSelectedIndex(idx);
                        setInsertTarget({
                          type: "after",
                          position: entry.position,
                        });
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-muted-foreground tabular-nums w-5 text-right shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-sm truncate">
                          {entry.figureName}
                          {entry.figureVariantName && (
                            <span className="text-muted-foreground">
                              {" "}
                              ({entry.figureVariantName})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-xs ${LEVEL_COLORS[entry.figureLevel] ?? ""}`}
                        >
                          {LEVEL_LABELS[entry.figureLevel] ?? entry.figureLevel}
                        </Badge>
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInsertTarget({
                                  type: "before",
                                  position: entry.position,
                                });
                              }}
                            >
                              +Before
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInsertTarget({
                                  type: "after",
                                  position: entry.position,
                                });
                              }}
                            >
                              +After
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-destructive-foreground hover:text-destructive-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveEntry(entry.id);
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* Insert-after indicator */}
                  {isSelected && insertTarget.type === "after" && (
                    <div className="h-0.5 bg-primary rounded mx-2 my-1" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Figure picker */}
      <Card className="w-80 shrink-0 flex flex-col overflow-hidden">
        <FigurePicker
          figures={pickerFigures}
          allowedFigureIds={
            entries.length === 0 ? null : allowedFigureIds ?? null
          }
          showAllFigures={showAllFigures}
          onToggleShowAll={() => setShowAllFigures((v) => !v)}
          onSelectFigure={handleSelectFigure}
          title={pickerTitle}
          maxLevel={maxLevel}
        />
      </Card>
    </div>
  );
}
