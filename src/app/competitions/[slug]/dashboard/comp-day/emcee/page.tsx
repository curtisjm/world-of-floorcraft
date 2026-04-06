"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { useCompLiveWithInvalidation } from "@competitions/lib/ably-comp-client";
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

// ── Main page ────────────────────────────────────────────────────────

export default function EmceePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });

  useCompLiveWithInvalidation(comp?.id);

  const { data: emceeView, isLoading } = trpc.emcee.getEmceeView.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<
    (typeof notes)[number] | null
  >(null);

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

  const { days, blocks, events, currentEvent } = emceeView;
  // notes may not appear in inferred tRPC type due to TS depth limits, but exists at runtime
  const notes = (emceeView as Record<string, unknown>).notes as {
    id: number;
    competitionId: number;
    dayId: number;
    positionAfterEventId: number | null;
    type: string;
    content: string;
    visibleOnProjector: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
  }[] ?? [];

  // Group events by day via blocks (events have sessionId → block)
  const blocksByDay = new Map<number, typeof blocks>();
  for (const block of blocks) {
    const arr = blocksByDay.get(block.dayId) ?? [];
    arr.push(block);
    blocksByDay.set(block.dayId, arr);
  }

  type Event = (typeof events)[number];
  type Note = (typeof notes)[number];

  const eventsByBlock = new Map<number, Event[]>();
  const unassignedEvents: Event[] = [];
  for (const evt of events) {
    if (evt.sessionId) {
      const arr = eventsByBlock.get(evt.sessionId) ?? [];
      arr.push(evt);
      eventsByBlock.set(evt.sessionId, arr);
    } else {
      unassignedEvents.push(evt);
    }
  }

  function getNotesAfterEvent(eventId: number | null, dayId: number) {
    return notes.filter(
      (n) => n.positionAfterEventId === eventId && n.dayId === dayId,
    );
  }

  function handleEditNote(note: Note) {
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
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Mic className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">Emcee</h2>
          </div>
          {currentEvent && (
            <div className="flex items-center gap-2 text-lg">
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
        <Button onClick={handleNewNote} size="lg" className="gap-2">
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
          const dayBlocks = blocksByDay.get(day.id) ?? [];
          const dayEvents: Event[] = [];
          for (const block of dayBlocks) {
            const blockEvts = eventsByBlock.get(block.id) ?? [];
            dayEvents.push(...blockEvts);
          }

          return (
            <Card key={day.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">
                  {day.label ?? `Day ${day.position + 1}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Notes at the start of the day */}
                {getNotesAfterEvent(null, day.id).map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={handleEditNote}
                    competitionId={comp.id}
                  />
                ))}

                {dayEvents.length === 0 && (
                  <p className="text-muted-foreground py-4 text-center">
                    No events scheduled for this day.
                  </p>
                )}

                {dayEvents.map((evt) => (
                  <div key={evt.id}>
                    <EventRow
                      event={evt}
                      isCurrent={currentEvent?.eventId === evt.id}
                    />
                    {getNotesAfterEvent(evt.id, day.id).map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={handleEditNote}
                        competitionId={comp.id}
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
              <div key={evt.id}>
                <EventRow
                  event={evt}
                  isCurrent={currentEvent?.eventId === evt.id}
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
        competitionId={comp.id}
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
  event: { id: number; name: string };
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {isCurrent && (
            <Badge variant="default" className="shrink-0 animate-pulse">
              NOW
            </Badge>
          )}
          <span className="text-xl font-semibold truncate">{event.name}</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => setShowResults(!showResults)}
        >
          <Trophy className="h-4 w-4" />
          Results
          {showResults ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {showResults && <ResultsPanel eventId={event.id} />}
    </div>
  );
}

// ── Results panel ────────────────────────────────────────────────────

function ResultsPanel({ eventId }: { eventId: number }) {
  const { data, isLoading } = trpc.emcee.getEventResults.useQuery({ eventId });

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
          key={`${r.placement}-${r.coupleNumber}`}
          className={`flex items-center gap-4 rounded-md px-4 py-3 ${
            r.placement <= 3
              ? "bg-amber-50/50 dark:bg-amber-950/20"
              : "bg-muted/30"
          }`}
        >
          <span className="text-2xl font-bold w-12 text-right tabular-nums">
            {formatPlacement(r.placement)}
          </span>
          {r.coupleNumber != null && (
            <Badge variant="outline" className="text-base font-mono px-3">
              #{r.coupleNumber}
            </Badge>
          )}
          <span className="text-xl font-medium">
            {r.leaderName} &amp; {r.followerName}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Note card ────────────────────────────────────────────────────────

function NoteCard<
  T extends {
    id: number;
    content: string;
    visibleOnProjector: boolean;
  },
>({
  note,
  onEdit,
  competitionId,
}: {
  note: T;
  onEdit: (note: T) => void;
  competitionId: number;
}) {
  const utils = trpc.useUtils();
  const deleteNote = trpc.emcee.deleteNote.useMutation({
    onSuccess: () => {
      utils.emcee.getEmceeView.invalidate({ competitionId });
      toast.success("Announcement deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="ml-6 my-2 flex items-start gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50/10 dark:bg-amber-950/10 px-4 py-3">
      <Megaphone className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-lg leading-relaxed whitespace-pre-wrap">
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
          onClick={() => deleteNote.mutate({ noteId: note.id })}
          disabled={deleteNote.isPending}
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
  competitionId: number;
  days: { id: number; label: string | null; position: number }[];
  events: { id: number; name: string }[];
  editingNote: {
    id: number;
    content: string;
    dayId: number;
    positionAfterEventId: number | null;
    visibleOnProjector: boolean;
  } | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();

  const [content, setContent] = useState("");
  const [dayId, setDayId] = useState<string>("");
  const [positionAfterEventId, setPositionAfterEventId] =
    useState<string>("start");
  const [visibleOnProjector, setVisibleOnProjector] = useState(true);

  // Reset form when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (editingNote) {
        setContent(editingNote.content);
        setDayId(String(editingNote.dayId));
        setPositionAfterEventId(
          editingNote.positionAfterEventId != null
            ? String(editingNote.positionAfterEventId)
            : "start",
        );
        setVisibleOnProjector(editingNote.visibleOnProjector);
      } else {
        setContent("");
        setDayId(days.length === 1 ? String(days[0]!.id) : "");
        setPositionAfterEventId("start");
        setVisibleOnProjector(true);
      }
    }
    onOpenChange(v);
  };

  const createNote = trpc.emcee.createNote.useMutation({
    onSuccess: () => {
      utils.emcee.getEmceeView.invalidate({ competitionId });
      toast.success("Announcement created");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateNote = trpc.emcee.updateNote.useMutation({
    onSuccess: () => {
      utils.emcee.getEmceeView.invalidate({ competitionId });
      toast.success("Announcement updated");
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = createNote.isPending || updateNote.isPending;

  function handleSave() {
    if (!content.trim()) {
      toast.error("Announcement content is required");
      return;
    }

    const afterEventId =
      positionAfterEventId === "start"
        ? null
        : Number(positionAfterEventId);

    if (editingNote) {
      updateNote.mutate({
        noteId: editingNote.id,
        content: content.trim(),
        visibleOnProjector,
        positionAfterEventId: afterEventId,
      });
    } else {
      if (!dayId) {
        toast.error("Please select a day");
        return;
      }
      createNote.mutate({
        competitionId,
        dayId: Number(dayId),
        positionAfterEventId: afterEventId,
        content: content.trim(),
        visibleOnProjector,
      });
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
                    <SelectItem key={d.id} value={String(d.id)}>
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
                  <SelectItem key={evt.id} value={String(evt.id)}>
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
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : editingNote ? "Update" : "Create"}
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
