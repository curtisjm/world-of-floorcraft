"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { trpc } from "@shared/lib/trpc";
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

export default function SchedulePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const {
    data: days,
    isLoading,
  } = trpc.schedule.getDays.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();
  const invalidate = () => {
    utils.schedule.getDays.invalidate({ competitionId: comp!.id });
    utils.competition.getForDashboard.invalidate({ competitionId: comp!.id });
  };

  const applyTemplate = trpc.schedule.applyDefaultTemplate.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Default template applied");
    },
    onError: (err) => toast.error(err.message),
  });

  const addDay = trpc.schedule.addDay.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Day added");
      setShowAddDay(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeDay = trpc.schedule.removeDay.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Day removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const addBlock = trpc.schedule.addBlock.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Block added");
      setAddBlockDayId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateBlock = trpc.schedule.updateBlock.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Block updated");
      setEditBlock(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeBlock = trpc.schedule.removeBlock.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Block removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderBlocks = trpc.schedule.reorderBlocks.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err.message),
  });

  // Dialog state
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayDate, setNewDayDate] = useState("");
  const [newDayLabel, setNewDayLabel] = useState("");
  const [addBlockDayId, setAddBlockDayId] = useState<number | null>(null);
  const [newBlockLabel, setNewBlockLabel] = useState("");
  const [newBlockType, setNewBlockType] = useState<"session" | "break">("session");
  const [editBlock, setEditBlock] = useState<{
    id: number;
    label: string;
    type: string;
  } | null>(null);

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const hasDays = days && days.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex gap-2">
          {!hasDays && (
            <Button
              onClick={() => {
                const today = new Date().toISOString().split("T")[0]!;
                applyTemplate.mutate({
                  competitionId: comp.id,
                  date: today,
                });
              }}
              disabled={applyTemplate.isPending}
            >
              <Wand2 className="size-4 mr-2" />
              {applyTemplate.isPending ? "Applying..." : "Apply Default Template"}
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
        <div className="space-y-6">
          {days!.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              onAddBlock={() => setAddBlockDayId(day.id)}
              onEditBlock={(block) => setEditBlock(block)}
              onRemoveBlock={(blockId) => {
                if (confirm("Remove this block? Events will be unlinked.")) {
                  removeBlock.mutate({ blockId });
                }
              }}
              onRemoveDay={() => {
                if (confirm(`Remove ${day.label ?? "this day"}? All blocks will be deleted.`)) {
                  removeDay.mutate({ dayId: day.id });
                }
              }}
              onReorderBlocks={(blockIds) => {
                reorderBlocks.mutate({ dayId: day.id, blockIds });
              }}
            />
          ))}
        </div>
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
              onClick={() => {
                addDay.mutate({
                  competitionId: comp.id,
                  date: newDayDate,
                  label: newDayLabel || undefined,
                });
              }}
              disabled={addDay.isPending || !newDayDate}
            >
              {addDay.isPending ? "Adding..." : "Add Day"}
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
              onClick={() => {
                if (addBlockDayId) {
                  addBlock.mutate({
                    dayId: addBlockDayId,
                    label: newBlockLabel,
                    type: newBlockType,
                  });
                }
              }}
              disabled={addBlock.isPending || !newBlockLabel.trim()}
            >
              {addBlock.isPending ? "Adding..." : "Add Block"}
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
              onClick={() => {
                if (editBlock) {
                  updateBlock.mutate({
                    blockId: editBlock.id,
                    label: editBlock.label,
                  });
                }
              }}
              disabled={updateBlock.isPending}
            >
              {updateBlock.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Day Card with sortable blocks ───────────────────────────────

interface Block {
  id: number;
  label: string;
  type: string;
  position: number;
}

interface DayCardProps {
  day: {
    id: number;
    date: string | null;
    label: string | null;
    blocks: Block[];
  };
  onAddBlock: () => void;
  onEditBlock: (block: { id: number; label: string; type: string }) => void;
  onRemoveBlock: (blockId: number) => void;
  onRemoveDay: () => void;
  onReorderBlocks: (blockIds: number[]) => void;
}

function DayCard({
  day,
  onAddBlock,
  onEditBlock,
  onRemoveBlock,
  onRemoveDay,
  onReorderBlocks,
}: DayCardProps) {
  const [blocks, setBlocks] = useState(day.blocks);

  // Sync with server data
  if (
    day.blocks.length !== blocks.length ||
    day.blocks.some((b, i) => b.id !== blocks[i]?.id)
  ) {
    setBlocks(day.blocks);
  }

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
          <DragDropProvider
            onDragEnd={(event) => {
              if (event.canceled) return;
              const newBlocks = move(blocks, event);
              setBlocks(newBlocks);
              onReorderBlocks(newBlocks.map((b) => b.id));
            }}
          >
            <div className="space-y-1">
              {blocks.map((block, index) => (
                <SortableBlock
                  key={block.id}
                  id={block.id}
                  index={index}
                  block={block}
                  onEdit={() => onEditBlock(block)}
                  onRemove={() => onRemoveBlock(block.id)}
                />
              ))}
            </div>
          </DragDropProvider>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sortable Block Item ─────────────────────────────────────────

function SortableBlock({
  id,
  index,
  block,
  onEdit,
  onRemove,
}: {
  id: number;
  index: number;
  block: Block;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { ref } = useSortable({ id, index });

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
