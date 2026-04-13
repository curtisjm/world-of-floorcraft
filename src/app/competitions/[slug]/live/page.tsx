"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { useCompLive } from "@competitions/lib/ably-comp-client";
import { Card, CardContent } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { Switch } from "@shared/ui/switch";
import { cn } from "@shared/lib/utils";
import {
  Radio,
  Trophy,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Star,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

type ScheduleEvent = {
  id: number;
  name: string;
  sessionId: number | null;
  position: number | null;
  status: "upcoming" | "in_progress" | "completed";
  coupleNumbers: number[];
  entryCount: number;
};

type AnnouncementNote = {
  id: number;
  dayId: number;
  positionAfterEventId: number | null;
  content: string;
  visibleOnProjector: boolean;
};

type Day = { id: number; position: number; label: string | null; date: string | null };

// ── Page ──────────────────────────────────────────────────────────

export default function CompetitorLiveViewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [showMyEvents, setShowMyEvents] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.liveView.getSchedule.invalidate();
    utils.liveView.getPublishedResults.invalidate();
  };

  const { isConnected, connectionStatus } = useCompLive(
    comp?.id,
    {
      "schedule:updated": () => utils.liveView.getSchedule.invalidate(),
      "event:completed": () => utils.liveView.getSchedule.invalidate(),
      "announcement:created": () => utils.liveView.getSchedule.invalidate(),
      "announcement:updated": () => utils.liveView.getSchedule.invalidate(),
      "announcement:deleted": () => utils.liveView.getSchedule.invalidate(),
      "results:published": invalidateAll,
    },
    { onReconnect: invalidateAll },
  );

  const { data: schedule, isLoading: scheduleLoading } =
    trpc.liveView.getSchedule.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp, refetchInterval: 30_000 },
    );

  const { data: myEventsData } = trpc.liveView.getMyEvents.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const myEventIds = new Set(myEventsData?.myEventIds ?? []);
  const hasMyEvents = myEventIds.size > 0;

  const notes = (
    (schedule as Record<string, unknown>)?.notes as AnnouncementNote[] ?? []
  );

  const days: Day[] = schedule?.days ?? [];
  const events: ScheduleEvent[] = schedule?.events ?? [];

  function toggleExpand(eventId: number) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  // Group events by day (using sessionId -> block -> day mapping, or fallback to first day)
  const blocks = schedule?.blocks ?? [];
  const blockDayMap = new Map(blocks.map((b) => [b.id, b.dayId]));

  // Build day -> events mapping
  // Events have sessionId which corresponds to block id
  function getDayForEvent(event: ScheduleEvent): number | null {
    if (event.sessionId != null) {
      return blockDayMap.get(event.sessionId) ?? null;
    }
    return days[0]?.id ?? null;
  }

  const dayEventsMap = new Map<number, ScheduleEvent[]>();
  for (const day of days) {
    dayEventsMap.set(day.id, []);
  }
  for (const event of events) {
    const dayId = getDayForEvent(event);
    if (dayId != null) {
      const arr = dayEventsMap.get(dayId);
      if (arr) arr.push(event);
    }
  }

  // Notes indexed by positionAfterEventId
  const notesAfterEvent = new Map<number | null, AnnouncementNote[]>();
  for (const note of notes) {
    const key = note.positionAfterEventId;
    if (!notesAfterEvent.has(key)) notesAfterEvent.set(key, []);
    notesAfterEvent.get(key)!.push(note);
  }

  if (!comp || scheduleLoading) {
    return <LiveViewSkeleton />;
  }

  // Filter events if "My Events" is toggled on
  function shouldShowEvent(event: ScheduleEvent) {
    if (!hasMyEvents || !showMyEvents) return true;
    return myEventIds.has(event.id);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {schedule?.competition?.name ?? comp.name}
        </h1>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Radio className="size-4" />
            Live Schedule
          </p>
          <p className={cn(
            "text-xs flex items-center gap-1",
            connectionStatus === "connected" && "text-green-600 dark:text-green-400",
            connectionStatus === "disconnected" && "text-muted-foreground",
            connectionStatus === "suspended" && "text-yellow-600 dark:text-yellow-400",
            connectionStatus === "failed" && "text-red-600 dark:text-red-400",
          )}>
            {isConnected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {connectionStatus === "connected" && "Live"}
            {connectionStatus === "disconnected" && "Connecting..."}
            {connectionStatus === "suspended" && "Reconnecting..."}
            {connectionStatus === "failed" && "Disconnected"}
          </p>
        </div>
      </div>

      {/* My Events toggle */}
      {hasMyEvents && (
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div className="flex items-center gap-2">
            <Star className="size-4 text-amber-500" />
            <span className="text-sm font-medium">My Events</span>
          </div>
          <Switch
            checked={showMyEvents}
            onCheckedChange={setShowMyEvents}
          />
        </div>
      )}

      {/* Schedule by day */}
      {days.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No schedule available yet.
          </CardContent>
        </Card>
      ) : (
        days.map((day) => {
          const dayEvents = dayEventsMap.get(day.id) ?? [];
          const visibleEvents = dayEvents.filter(shouldShowEvent);
          // Also gather notes for this day that are before any event (positionAfterEventId === null and dayId matches)
          const dayNotesBefore = (notesAfterEvent.get(null) ?? []).filter(
            (n) => n.dayId === day.id,
          );

          if (
            visibleEvents.length === 0 &&
            dayNotesBefore.length === 0 &&
            hasMyEvents &&
            showMyEvents
          ) {
            return null;
          }

          return (
            <div key={day.id} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {day.label}
                {day.date && (
                  <span className="ml-2 font-normal normal-case">
                    {new Date(day.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </h2>

              {/* Notes before first event */}
              {dayNotesBefore.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}

              {visibleEvents.map((event) => {
                const isMyEvent = myEventIds.has(event.id);
                const isExpanded = expandedEvents.has(event.id);

                // Notes after this event
                const eventNotes = (notesAfterEvent.get(event.id) ?? []).filter(
                  (n) => n.dayId === day.id,
                );

                return (
                  <div key={event.id} className="space-y-3">
                    <EventCard
                      event={event}
                      isMyEvent={isMyEvent && hasMyEvents}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(event.id)}
                    />
                    {eventNotes.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────

function EventCard({
  event,
  isMyEvent,
  isExpanded,
  onToggle,
}: {
  event: ScheduleEvent;
  isMyEvent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-colors",
        isMyEvent && "border-primary/40 bg-primary/5",
      )}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{event.name}</span>
          {isMyEvent && (
            <Star className="size-3.5 text-amber-500 fill-amber-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={event.status} />
          {event.status === "completed" && (
            isExpanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )
          )}
        </div>
      </div>

      <CardContent className="pt-0 pb-3 px-4 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          <span>{event.entryCount} {event.entryCount === 1 ? "entry" : "entries"}</span>
        </div>

        {event.coupleNumbers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.coupleNumbers.map((num) => (
              <Badge
                key={num}
                variant="outline"
                className="text-xs tabular-nums px-2 py-0.5"
              >
                {num}
              </Badge>
            ))}
          </div>
        )}

        {event.status === "completed" && !isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs px-0 h-auto text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <Trophy className="size-3.5 mr-1" />
            View Results
          </Button>
        )}

        {isExpanded && event.status === "completed" && (
          <ResultsSection eventId={event.id} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Status Badge ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: "upcoming" | "in_progress" | "completed" }) {
  switch (status) {
    case "in_progress":
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          <span className="relative flex size-2 mr-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-blue-500" />
          </span>
          In Progress
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          Completed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Upcoming
        </Badge>
      );
  }
}

// ── Results Section ───────────────────────────────────────────────

function ResultsSection({ eventId }: { eventId: number }) {
  const { data: results, isLoading } =
    trpc.liveView.getPublishedResults.useQuery({ eventId });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!results || results.rounds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground pt-2">
        Results not yet published.
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {results.rounds.map((round) => (
        <div key={round.roundId} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {round.roundType.replace(/_/g, " ")}
          </p>
          <div className="space-y-1">
            {round.results.map((r, i) => (
              <PlacementRow
                key={`${round.roundId}-${i}`}
                placement={r.placement}
                coupleNumber={r.coupleNumber}
                leaderName={r.leaderName}
                followerName={r.followerName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Placement Row ─────────────────────────────────────────────────

function PlacementRow({
  placement,
  coupleNumber,
  leaderName,
  followerName,
}: {
  placement: number;
  coupleNumber: number | null;
  leaderName: string | null;
  followerName: string | null;
}) {
  const medalColor =
    placement === 1
      ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
      : placement === 2
        ? "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-600"
        : placement === 3
          ? "bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700"
          : "bg-background text-foreground border-border";

  const isMedal = placement <= 3;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2 text-sm",
        medalColor,
      )}
    >
      <span
        className={cn(
          "font-bold tabular-nums w-6 text-center",
          isMedal && "text-base",
        )}
      >
        {placement}
      </span>
      {coupleNumber != null && (
        <Badge
          variant="outline"
          className={cn(
            "text-xs tabular-nums shrink-0",
            isMedal && "border-current/30",
          )}
        >
          #{coupleNumber}
        </Badge>
      )}
      <span className="truncate">
        {leaderName ?? "TBD"}
        {" & "}
        {followerName ?? "TBD"}
      </span>
    </div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────

function NoteCard({ note }: { note: AnnouncementNote }) {
  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <CardContent className="py-3 px-4 flex items-start gap-2.5">
        <Megaphone className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900 dark:text-amber-200">
          {note.content}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────

function LiveViewSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  );
}
