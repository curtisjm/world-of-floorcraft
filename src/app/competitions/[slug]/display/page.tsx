"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { useCompLive } from "@competitions/lib/ably-comp-client";
import { Badge } from "@shared/ui/badge";
import { Megaphone } from "lucide-react";

// ── Projector Display ───────────────────────────────────────────────
// Full-screen, dark-themed, read-only schedule display for venue projection.
// No authentication required — all data comes from public liveView procedures.

export default function ProjectorDisplayPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });

  const { data: schedule } = trpc.liveView.getSchedule.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();
  const invalidateAll = () => utils.liveView.getSchedule.invalidate();
  const { isConnected } = useCompLive(
    schedule?.competition.id,
    {
      "schedule:updated": invalidateAll,
      "event:completed": invalidateAll,
      "announcement:created": invalidateAll,
      "announcement:updated": invalidateAll,
      "announcement:deleted": invalidateAll,
      "results:published": invalidateAll,
    },
    { onReconnect: invalidateAll },
  );

  const activeRef = useRef<HTMLDivElement>(null);
  const activeEventId = schedule?.activeEventId ?? null;

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeEventId]);

  if (!comp || !schedule) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-500 text-2xl animate-pulse">Loading...</div>
      </div>
    );
  }

  const { days, blocks, events } = schedule;

  // Access notes with TS workaround for inference depth limits
  const notes =
    ((schedule as Record<string, unknown>).notes as {
      id: number;
      dayId: number;
      positionAfterEventId: number | null;
      content: string;
      visibleOnProjector: boolean;
    }[]) ?? [];

  const projectorNotes = notes.filter((n) => n.visibleOnProjector);

  // Group blocks by day
  const blocksByDay = new Map<number, typeof blocks>();
  for (const block of blocks) {
    const arr = blocksByDay.get(block.dayId) ?? [];
    arr.push(block);
    blocksByDay.set(block.dayId, arr);
  }

  // Group events by block (sessionId)
  type Event = (typeof events)[number];
  const eventsByBlock = new Map<number, Event[]>();
  for (const evt of events) {
    if (evt.sessionId) {
      const arr = eventsByBlock.get(evt.sessionId) ?? [];
      arr.push(evt);
      eventsByBlock.set(evt.sessionId, arr);
    }
  }

  function getNotesAfterEvent(eventId: number | null, dayId: number) {
    return projectorNotes.filter(
      (n) => n.positionAfterEventId === eventId && n.dayId === dayId,
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-8 py-10 relative">
      {/* Connection status indicator */}
      <div className="absolute top-4 right-4">
        <span className={`inline-block size-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
      </div>

      {/* Competition name */}
      <h1 className="text-4xl font-bold text-center mb-10 tracking-tight">
        {schedule.competition.name}
      </h1>

      {/* Schedule by day */}
      <div className="max-w-4xl mx-auto space-y-10">
        {days.map((day) => {
          const dayBlocks = blocksByDay.get(day.id) ?? [];
          const dayEvents: Event[] = [];
          for (const block of dayBlocks) {
            const blockEvts = eventsByBlock.get(block.id) ?? [];
            dayEvents.push(...blockEvts);
          }

          return (
            <div key={day.id}>
              {days.length > 1 && (
                <h2 className="text-2xl font-semibold text-zinc-400 mb-4 border-b border-zinc-800 pb-2">
                  {day.label ?? `Day ${day.position + 1}`}
                </h2>
              )}

              {/* Notes at start of day */}
              {getNotesAfterEvent(null, day.id).map((note) => (
                <AnnouncementBanner key={note.id} content={note.content} />
              ))}

              {dayEvents.length === 0 && (
                <p className="text-zinc-600 text-xl text-center py-8">
                  No events scheduled.
                </p>
              )}

              <div className="space-y-3">
                {dayEvents.map((evt) => {
                  const isActive = evt.id === activeEventId;
                  const isCompleted = evt.status === "completed";

                  return (
                    <div key={evt.id}>
                      <div
                        ref={isActive ? activeRef : undefined}
                        className={`rounded-lg px-6 py-5 transition-all ${
                          isActive
                            ? "border-l-4 border-yellow-400 bg-zinc-900 shadow-lg shadow-yellow-400/10"
                            : isCompleted
                              ? "opacity-40"
                              : "bg-zinc-950 border-l-4 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {isActive && (
                            <Badge className="bg-yellow-400 text-black font-bold text-sm px-3 py-1 animate-pulse">
                              NOW
                            </Badge>
                          )}
                          <span className="text-2xl font-semibold">
                            {evt.name}
                          </span>
                          {isCompleted && (
                            <span className="text-zinc-500 text-lg ml-auto">
                              Completed
                            </span>
                          )}
                        </div>

                        {evt.coupleNumbers.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {evt.coupleNumbers.map((num) => (
                              <Badge
                                key={num}
                                variant="outline"
                                className="font-mono text-lg px-3 py-1 border-zinc-600 text-zinc-300"
                              >
                                {num}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Notes after this event */}
                      {getNotesAfterEvent(evt.id, day.id).map((note) => (
                        <AnnouncementBanner
                          key={note.id}
                          content={note.content}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Announcement banner ─────────────────────────────────────────────

function AnnouncementBanner({ content }: { content: string }) {
  return (
    <div className="my-3 rounded-lg border border-amber-500 bg-amber-900/30 px-6 py-4 flex items-start gap-4">
      <Megaphone className="h-6 w-6 text-amber-400 mt-0.5 shrink-0" />
      <p className="text-xl text-amber-100 leading-relaxed whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
