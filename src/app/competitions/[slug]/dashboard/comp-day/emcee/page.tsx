"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { cn } from "@shared/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Skeleton } from "@shared/ui/skeleton";
import { Checkbox } from "@shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { toast } from "sonner";
import {
  Mic,
  Eye,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  Trophy,
  ChevronDown,
  ChevronRight,
  Megaphone,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type EmceeNote = {
  _id: Id<"announcementNotes">;
  competitionId: Id<"competitions">;
  dayId: Id<"competitionDays">;
  positionAfterEventId?: Id<"competitionEvents">;
  type: "text" | "break";
  content: string;
  visibleOnProjector: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: Id<"users">;
};

type EmceeEvent = {
  _id: Id<"competitionEvents">;
  name: string;
  sessionId?: Id<"scheduleBlocks">;
};

type EmceeDay = {
  _id: Id<"competitionDays">;
  label?: string;
  position: number;
};

// ── Main page ────────────────────────────────────────────────────────

export default function EmceePage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });

  const emceeView = useQuery(
    api.competitions.compDay.getEmceeView,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = emceeView === undefined;

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<EmceeNote | null>(null);

  if (!comp || isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!emceeView) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Unable to load emcee view.
      </div>
    );
  }

  const { days, blocks, events, currentEvent, notes } = emceeView;

  // Group events by day via blocks (events have sessionId → block)
  const blocksByDay = new Map<Id<"competitionDays">, typeof blocks>();
  for (const block of blocks) {
    const arr = blocksByDay.get(block.dayId) ?? [];
    arr.push(block);
    blocksByDay.set(block.dayId, arr);
  }

  const eventsByBlock = new Map<Id<"scheduleBlocks">, typeof events>();
  const unassignedEvents: typeof events = [];
  for (const evt of events) {
    if (evt.sessionId) {
      const arr = eventsByBlock.get(evt.sessionId) ?? [];
      arr.push(evt);
      eventsByBlock.set(evt.sessionId, arr);
    } else {
      unassignedEvents.push(evt);
    }
  }

  function getNotesAfterEvent(
    eventId: Id<"competitionEvents"> | null,
    dayId: Id<"competitionDays">,
  ) {
    return notes.filter(
      (n) =>
        (n.positionAfterEventId ?? null) === eventId && n.dayId === dayId,
    );
  }

  function handleEditNote(note: EmceeNote) {
    setEditingNote(note);
    setNoteDialogOpen(true);
  }

  function handleNewNote() {
    setEditingNote(null);
    setNoteDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-3">
            <Mic className="h-6 w-6 text-primary shrink-0" />
            <h2 className="text-xl sm:text-2xl font-bold">Emcee</h2>
          </div>
          {currentEvent && (
            <div className="flex flex-wrap items-center gap-2 text-base sm:text-lg">
              <Badge
                variant="default"
                className="text-sm px-3 py-1 animate-pulse"
              >
                NOW
              </Badge>
              <span className="font-semibold">{currentEvent.eventName}</span>
              <span className="text-muted-foreground">
                &mdash;{" "}
                {formatRoundType(currentEvent.roundType as string)}
              </span>
            </div>
          )}
        </div>
        <Button onClick={handleNewNote} size="lg" className="gap-2 w-full sm:w-auto shrink-0">
          <Plus className="h-4 w-4" />
          Add Announcement
        </Button>
      </div>

      {/* Schedule timeline */}
      {days.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-lg">
          No schedule days configured yet.
        </div>
      ) : (
        days.map((day) => {
          const dayBlocks = blocksByDay.get(day._id) ?? [];
          const dayEvents: typeof events = [];
          for (const block of dayBlocks) {
            const blockEvts = eventsByBlock.get(block._id) ?? [];
            dayEvents.push(...blockEvts);
          }

          return (
            <Card key={day._id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">
                  {day.label ?? `Day ${day.position + 1}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Notes at the start of the day */}
                {getNotesAfterEvent(null, day._id).map((note) => (
                  <NoteCard
                    key={note._id}
                    note={note}
                    onEdit={handleEditNote}
                  />
                ))}

                {dayEvents.length === 0 && (
                  <p className="text-muted-foreground py-4 text-center">
                    No events scheduled for this day.
                  </p>
                )}

                {dayEvents.map((evt) => (
                  <div key={evt._id}>
                    <EventRow
                      event={evt}
                      isCurrent={currentEvent?.eventId === evt._id}
                    />
                    {getNotesAfterEvent(evt._id, day._id).map((note) => (
                      <NoteCard
                        key={note._id}
                        note={note}
                        onEdit={handleEditNote}
                      />
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Unassigned events */}
      {unassignedEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl text-muted-foreground">
              Unscheduled Events
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unassignedEvents.map((evt) => (
              <div key={evt._id}>
                <EventRow
                  event={evt}
                  isCurrent={currentEvent?.eventId === evt._id}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Note dialog */}
      <NoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        competitionId={comp._id}
        days={days}
        events={events}
        editingNote={editingNote}
        onClose={() => {
          setNoteDialogOpen(false);
          setEditingNote(null);
        }}
      />
    </div>
  );
}

// ── Event row ────────────────────────────────────────────────────────

function EventRow({
  event,
  isCurrent,
}: {
  event: EmceeEvent;
  isCurrent: boolean;
}) {
  const [showResults, setShowResults] = useState(false);

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isCurrent
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {isCurrent && (
            <Badge variant="default" className="shrink-0 animate-pulse">
              NOW
            </Badge>
          )}
          <span className="text-base sm:text-xl font-semibold truncate">{event.name}</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 sm:gap-2 shrink-0"
          onClick={() => setShowResults(!showResults)}
        >
          <Trophy className="h-4 w-4" />
          <span className="hidden sm:inline">Results</span>
          {showResults ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {showResults && <ResultsPanel eventId={event._id} />}
    </div>
  );
}

// ── Results panel ────────────────────────────────────────────────────

function ResultsPanel({ eventId }: { eventId: Id<"competitionEvents"> }) {
  const data = useQuery(
    api.competitions.compDay.getEventResultsForEmcee,
    { eventId },
  );
  const isLoading = data === undefined;

  if (isLoading) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!data?.results.length) {
    return (
      <p className="mt-4 text-muted-foreground">
        {data?.status === "none"
          ? "Results have not been calculated yet."
          : data?.status === "reviewed"
            ? "Results are reviewed but not yet published."
            : "No published results."}
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-1">
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
        {data.eventName} &mdash; Final Results
      </p>
      {data.results.map((r) => (
        <div
          key={`${r.placement}-${r.coupleNumber ?? "unk"}`}
          className={cn(
            "flex items-center gap-2 sm:gap-4 rounded-md px-3 sm:px-4 py-2 sm:py-3",
            r.placement <= 3
              ? "placement-gold"
              : "bg-muted/30",
          )}
        >
          <span className="text-lg sm:text-2xl font-bold w-8 sm:w-12 text-right tabular-nums shrink-0">
            {formatPlacement(r.placement)}
          </span>
          {r.coupleNumber != null && (
            <Badge variant="outline" className="text-sm sm:text-base font-mono px-2 sm:px-3 shrink-0">
              #{r.coupleNumber}
            </Badge>
          )}
          <span className="text-sm sm:text-xl font-medium truncate">
            {r.leaderName} &amp; {r.followerName}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Note card ────────────────────────────────────────────────────────

function NoteCard({
  note,
  onEdit,
}: {
  note: EmceeNote;
  onEdit: (note: EmceeNote) => void;
}) {
  const deleteNoteMutation = useMutation(api.competitions.compDay.deleteNote);
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    setPending(true);
    try {
      await deleteNoteMutation({ noteId: note._id });
      toast.success("Announcement deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="my-2 ml-2 flex items-start gap-2 rounded-[2px] border border-clay/40 bg-clay/10 px-3 py-2 sm:ml-6 sm:gap-3 sm:px-4 sm:py-3">
      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-clay" />
      <div className="flex-1 min-w-0">
        <p className="text-base sm:text-lg leading-relaxed whitespace-pre-wrap">
          {note.content}
        </p>
        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          {note.visibleOnProjector ? (
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> Visible on projector
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <EyeOff className="h-3.5 w-3.5" /> Emcee only
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(note)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={pending}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Note dialog (create / edit) ──────────────────────────────────────

function NoteDialog({
  open,
  onOpenChange,
  competitionId,
  days,
  events,
  editingNote,
  onClose,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  competitionId: Id<"competitions">;
  days: EmceeDay[];
  events: EmceeEvent[];
  editingNote: EmceeNote | null;
  onClose: () => void;
}) {
  const createNoteMutation = useMutation(api.competitions.compDay.createNote);
  const updateNoteMutation = useMutation(api.competitions.compDay.updateNote);

  const [content, setContent] = useState("");
  const [dayId, setDayId] = useState<string>("");
  const [positionAfterEventId, setPositionAfterEventId] =
    useState<string>("start");
  const [visibleOnProjector, setVisibleOnProjector] = useState(true);
  const [pending, setPending] = useState(false);

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (editingNote) {
        setContent(editingNote.content);
        setDayId(editingNote.dayId);
        setPositionAfterEventId(
          editingNote.positionAfterEventId ?? "start",
        );
        setVisibleOnProjector(editingNote.visibleOnProjector);
      } else {
        setContent("");
        setDayId(days.length === 1 ? days[0]!._id : "");
        setPositionAfterEventId("start");
        setVisibleOnProjector(true);
      }
    }
    onOpenChange(v);
  };

  async function handleSave() {
    if (!content.trim()) {
      toast.error("Announcement content is required");
      return;
    }

    const afterEventId =
      positionAfterEventId === "start"
        ? null
        : (positionAfterEventId as Id<"competitionEvents">);

    setPending(true);
    try {
      if (editingNote) {
        await updateNoteMutation({
          noteId: editingNote._id,
          content: content.trim(),
          visibleOnProjector,
          positionAfterEventId: afterEventId,
        });
        toast.success("Announcement updated");
      } else {
        if (!dayId) {
          toast.error("Please select a day");
          setPending(false);
          return;
        }
        await createNoteMutation({
          competitionId,
          dayId: dayId as Id<"competitionDays">,
          positionAfterEventId: afterEventId ?? undefined,
          content: content.trim(),
          visibleOnProjector,
        });
        toast.success("Announcement created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingNote ? "Edit Announcement" : "New Announcement"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type the announcement to read aloud..."
              rows={4}
              className="text-base"
            />
          </div>

          {days.length > 1 && (
            <div className="space-y-2">
              <Label>Day</Label>
              <Select
                value={dayId}
                onValueChange={setDayId}
                disabled={!!editingNote}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a day" />
                </SelectTrigger>
                <SelectContent>
                  {days.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.label ?? `Day ${d.position + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Position</Label>
            <Select
              value={positionAfterEventId}
              onValueChange={setPositionAfterEventId}
            >
              <SelectTrigger>
                <SelectValue placeholder="After which event?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">At start of day</SelectItem>
                {events.map((evt) => (
                  <SelectItem key={evt._id} value={evt._id}>
                    After: {evt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="projector-visible"
              checked={visibleOnProjector}
              onCheckedChange={(checked) =>
                setVisibleOnProjector(checked === true)
              }
            />
            <Label htmlFor="projector-visible" className="cursor-pointer">
              Visible on projector
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? "Saving..." : editingNote ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatRoundType(roundType: string): string {
  return roundType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPlacement(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
