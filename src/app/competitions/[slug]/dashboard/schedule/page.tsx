"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Badge } from "@shared/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";
import { toast } from "sonner";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  CalendarPlus,
  Wand2,
} from "lucide-react";
import { cn } from "@shared/lib/utils";

interface Block {
  id: Id<"scheduleBlocks">;
  _id: Id<"scheduleBlocks">;
  label: string;
  type: string;
  position: number;
}

interface Day {
  _id: Id<"competitionDays">;
  date: string;
  label?: string;
}

export default function SchedulePage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });
  const days = useQuery(
    api.competitions.schedule.getDays,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = comp === undefined || days === undefined;

  const applyTemplateMutation = useMutation(api.competitions.schedule.applyDefaultTemplate);
  const addDayMutation = useMutation(api.competitions.schedule.addDay);
  const updateDayMutation = useMutation(api.competitions.schedule.updateDay);
  const removeDayMutation = useMutation(api.competitions.schedule.removeDay);
  const addBlockMutation = useMutation(api.competitions.schedule.addBlock);
  const updateBlockMutation = useMutation(api.competitions.schedule.updateBlock);
  const removeBlockMutation = useMutation(api.competitions.schedule.removeBlock);
  const reorderBlocksMutation = useMutation(api.competitions.schedule.reorderBlocks);
  const moveBlockMutation = useMutation(api.competitions.schedule.moveBlock);

  const [applyTemplatePending, setApplyTemplatePending] = useState(false);
  const [addDayPending, setAddDayPending] = useState(false);
  const [updateDayPending, setUpdateDayPending] = useState(false);
  const [addBlockPending, setAddBlockPending] = useState(false);
  const [updateBlockPending, setUpdateBlockPending] = useState(false);

  // Dialog state
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState("");
  const [newDayLabel, setNewDayLabel] = useState("");
  const [editDay, setEditDay] = useState<{
    id: Id<"competitionDays">;
    date: string;
    label: string;
  } | null>(null);
  const [addBlockDayId, setAddBlockDayId] = useState<Id<"competitionDays"> | null>(null);
  const [newBlockLabel, setNewBlockLabel] = useState("");
  const [newBlockType, setNewBlockType] = useState<"session" | "break">("session");
  const [editBlock, setEditBlock] = useState<{
    id: Id<"scheduleBlocks">;
    label: string;
    type: string;
  } | null>(null);

  // Cross-day drag state
  const [blocksByDay, setBlocksByDay] = useState<Record<string, Block[]>>({});
  const snapshot = useRef<Record<string, Block[]>>({});

  // Sync server data into local drag state
  const serverKey =
    days?.map((d) => `${d._id}:${d.blocks.map((b) => b._id).join(",")}`).join("|") ?? "";
  const [prevServerKey, setPrevServerKey] = useState("");
  if (serverKey !== prevServerKey) {
    setPrevServerKey(serverKey);
    if (days) {
      const next: Record<string, Block[]> = {};
      for (const day of days) {
        next[String(day._id)] = day.blocks.map((b) => ({
          id: b._id,
          _id: b._id,
          label: b.label,
          type: b.type,
          position: b.position,
        }));
      }
      setBlocksByDay(next);
    }
  }

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const hasDays = days && days.length > 0;

  const handleApplyTemplate = async () => {
    const today = new Date().toISOString().split("T")[0]!;
    setApplyTemplatePending(true);
    try {
      await applyTemplateMutation({
        competitionId: comp._id,
        date: today,
      });
      toast.success("Default template applied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setApplyTemplatePending(false);
    }
  };

  const handleAddDay = async () => {
    setAddDayPending(true);
    try {
      await addDayMutation({
        competitionId: comp._id,
        date: newDayDate,
        label: newDayLabel || undefined,
      });
      toast.success("Day added");
      setShowAddDay(false);
      setNewDayDate("");
      setNewDayLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAddDayPending(false);
    }
  };

  const handleUpdateDay = async () => {
    if (!editDay) return;
    setUpdateDayPending(true);
    try {
      await updateDayMutation({
        dayId: editDay.id,
        label: editDay.label || null,
        date: editDay.date || undefined,
      });
      toast.success("Day updated");
      setEditDay(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdateDayPending(false);
    }
  };

  const handleRemoveDay = async (dayId: Id<"competitionDays">, label: string) => {
    if (!confirm(`Remove ${label}? All blocks will be deleted.`)) return;
    try {
      await removeDayMutation({ dayId });
      toast.success("Day removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleAddBlock = async () => {
    if (!addBlockDayId) return;
    setAddBlockPending(true);
    try {
      await addBlockMutation({
        dayId: addBlockDayId,
        label: newBlockLabel,
        type: newBlockType,
      });
      toast.success("Block added");
      setAddBlockDayId(null);
      setNewBlockLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setAddBlockPending(false);
    }
  };

  const handleUpdateBlock = async () => {
    if (!editBlock) return;
    setUpdateBlockPending(true);
    try {
      await updateBlockMutation({
        blockId: editBlock.id,
        label: editBlock.label,
      });
      toast.success("Block updated");
      setEditBlock(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdateBlockPending(false);
    }
  };

  const handleRemoveBlock = async (blockId: Id<"scheduleBlocks">) => {
    if (!confirm("Remove this block? Events will be unlinked.")) return;
    try {
      await removeBlockMutation({ blockId });
      toast.success("Block removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex gap-2">
          {!hasDays && (
            <Button
              onClick={handleApplyTemplate}
              disabled={applyTemplatePending}
            >
              <Wand2 className="size-4 mr-2" />
              {applyTemplatePending ? "Applying..." : "Apply Default Template"}
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowAddDay(true)}>
            <CalendarPlus className="size-4 mr-2" />
            Add Day
          </Button>
        </div>
      </div>

      {!hasDays ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No schedule days yet.</p>
          <p className="text-sm mt-1">
            Apply the default template to get started, or add days manually.
          </p>
        </div>
      ) : (
        <DragDropProvider
          onDragStart={() => {
            snapshot.current = structuredClone(blocksByDay);
          }}
          onDragOver={(event) => {
            setBlocksByDay((prev) => move(prev, event));
          }}
          onDragEnd={(event) => {
            if (event.canceled) {
              setBlocksByDay(snapshot.current);
              return;
            }

            const { source } = event.operation;
            if (!source) return;

            const s = source as unknown as {
              initialGroup?: string;
              group?: string;
              initialIndex?: number;
              index?: number;
              id: Id<"scheduleBlocks">;
            };

            const { initialGroup, group, initialIndex, index } = s;
            if (initialGroup == null || group == null) return;
            if (initialIndex == null || index == null) return;

            if (initialGroup === group) {
              // Same-day reorder
              const dayBlocks = blocksByDay[group];
              if (dayBlocks) {
                reorderBlocksMutation({
                  dayId: group as Id<"competitionDays">,
                  blockIds: dayBlocks.map((b) => b._id),
                }).catch((err) =>
                  toast.error(err instanceof Error ? err.message : "Failed"),
                );
              }
            } else {
              // Cross-day move
              const targetBlocks = blocksByDay[group];
              if (targetBlocks) {
                moveBlockMutation({
                  blockId: s.id,
                  toDayId: group as Id<"competitionDays">,
                  blockIds: targetBlocks.map((b) => b._id),
                }).catch((err) =>
                  toast.error(err instanceof Error ? err.message : "Failed"),
                );
              }
            }
          }}
        >
          <div className="space-y-6">
            {days!.map((day) => (
              <DayCard
                key={day._id}
                day={day}
                blocks={blocksByDay[String(day._id)] ?? []}
                onAddBlock={() => setAddBlockDayId(day._id)}
                onEditDay={() =>
                  setEditDay({
                    id: day._id,
                    date: day.date ?? "",
                    label: day.label ?? "",
                  })
                }
                onEditBlock={(block) => setEditBlock(block)}
                onRemoveBlock={handleRemoveBlock}
                onRemoveDay={() =>
                  handleRemoveDay(day._id, day.label ?? "this day")
                }
              />
            ))}
          </div>
        </DragDropProvider>
      )}

      {/* Add Day Dialog */}
      <Dialog open={showAddDay} onOpenChange={setShowAddDay}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dayDate">Date</Label>
              <Input
                id="dayDate"
                type="date"
                value={newDayDate}
                onChange={(e) => setNewDayDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dayLabel">Label (optional)</Label>
              <Input
                id="dayLabel"
                value={newDayLabel}
                onChange={(e) => setNewDayLabel(e.target.value)}
                placeholder="e.g. Day 2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddDay}
              disabled={addDayPending || !newDayDate}
            >
              {addDayPending ? "Adding..." : "Add Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Day Dialog */}
      <Dialog open={editDay !== null} onOpenChange={() => setEditDay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Day</DialogTitle>
          </DialogHeader>
          {editDay && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editDayLabel">Label</Label>
                <Input
                  id="editDayLabel"
                  value={editDay.label}
                  onChange={(e) =>
                    setEditDay({ ...editDay, label: e.target.value })
                  }
                  placeholder="e.g. Day 1, Finals Day"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDayDate">Date</Label>
                <Input
                  id="editDayDate"
                  type="date"
                  value={editDay.date}
                  onChange={(e) =>
                    setEditDay({ ...editDay, date: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleUpdateDay}
              disabled={updateDayPending}
            >
              {updateDayPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Block Dialog */}
      <Dialog open={addBlockDayId !== null} onOpenChange={() => setAddBlockDayId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Block</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blockLabel">Label</Label>
              <Input
                id="blockLabel"
                value={newBlockLabel}
                onChange={(e) => setNewBlockLabel(e.target.value)}
                placeholder="e.g. Standard, Lunch Break"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(["session", "break"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={newBlockType === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewBlockType(type)}
                  >
                    {type === "session" ? "Session" : "Break"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddBlock}
              disabled={addBlockPending || !newBlockLabel.trim()}
            >
              {addBlockPending ? "Adding..." : "Add Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Block Dialog */}
      <Dialog open={editBlock !== null} onOpenChange={() => setEditBlock(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Block</DialogTitle>
          </DialogHeader>
          {editBlock && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editBlockLabel">Label</Label>
                <Input
                  id="editBlockLabel"
                  value={editBlock.label}
                  onChange={(e) =>
                    setEditBlock({ ...editBlock, label: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={handleUpdateBlock}
              disabled={updateBlockPending}
            >
              {updateBlockPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Day Card with sortable blocks ───────────────────────────────

interface DayCardProps {
  day: Day;
  blocks: Block[];
  onAddBlock: () => void;
  onEditDay: () => void;
  onEditBlock: (block: { id: Id<"scheduleBlocks">; label: string; type: string }) => void;
  onRemoveBlock: (blockId: Id<"scheduleBlocks">) => void;
  onRemoveDay: () => void;
}

function DayCard({
  day,
  blocks,
  onAddBlock,
  onEditDay,
  onEditBlock,
  onRemoveBlock,
  onRemoveDay,
}: DayCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {day.label ?? "Day"}{" "}
            {day.date && (
              <span className="text-muted-foreground font-normal ml-2">
                {day.date}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onAddBlock}>
              <Plus className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onEditDay}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemoveDay}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No blocks. Add sessions or breaks.
          </p>
        ) : (
          <div className="space-y-1">
            {blocks.map((block, index) => (
              <SortableBlock
                key={block._id}
                id={block._id}
                index={index}
                group={String(day._id)}
                block={block}
                onEdit={() => onEditBlock({ id: block._id, label: block.label, type: block.type })}
                onRemove={() => onRemoveBlock(block._id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sortable Block Item ─────────────────────────────────────────

function SortableBlock({
  id,
  index,
  group,
  block,
  onEdit,
  onRemove,
}: {
  id: Id<"scheduleBlocks">;
  index: number;
  group: string;
  block: Block;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { ref } = useSortable({
    id,
    index,
    group,
    type: "item",
    accept: "item",
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md border transition-colors",
        block.type === "break"
          ? "bg-muted/50 border-dashed"
          : "bg-background border-border",
      )}
    >
      <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{block.label}</span>
      </div>
      <Badge variant="secondary" className="text-xs shrink-0">
        {block.type === "session" ? "Session" : "Break"}
      </Badge>
      <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
