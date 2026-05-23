"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@shared/ui/badge";
import { Megaphone } from "lucide-react";

// ── Projector Display ───────────────────────────────────────────────
// Full-screen, dark-themed, read-only schedule display for venue projection.
// No authentication required — all data comes from public liveView procedures.

type AnnouncementNote = {
  _id: Id<"announcementNotes">;
  dayId: Id<"competitionDays">;
  positionAfterEventId: Id<"competitionEvents"> | null | undefined;
  content: string;
  visibleOnProjector: boolean;
};

export default function ProjectorDisplayPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const competitionId = comp?._id;

  const schedule = useQuery(
    api.competitions.liveView.getSchedule,
    competitionId ? { competitionId } : "skip",
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="animate-pulse text-2xl text-[#737373]">Loading...</div>
      </div>
    );
  }

  const { days, blocks, events } = schedule;

  const notes = (schedule.notes ?? []) as AnnouncementNote[];

  const projectorNotes = notes.filter((n) => n.visibleOnProjector);

  // Group blocks by day
  const blocksByDay = new Map<Id<"competitionDays">, typeof blocks>();
  for (const block of blocks) {
    const arr = blocksByDay.get(block.dayId) ?? [];
    arr.push(block);
    blocksByDay.set(block.dayId, arr);
  }

  // Group events by block (sessionId)
  type Event = (typeof events)[number];
  const eventsByBlock = new Map<Id<"scheduleBlocks">, Event[]>();
  for (const evt of events) {
    if (evt.sessionId) {
      const arr = eventsByBlock.get(evt.sessionId) ?? [];
      arr.push(evt);
      eventsByBlock.set(evt.sessionId, arr);
    }
  }

  function getNotesAfterEvent(
    eventId: Id<"competitionEvents"> | null,
    dayId: Id<"competitionDays">,
  ) {
    return projectorNotes.filter(
      (n) =>
        (n.positionAfterEventId ?? null) === eventId && n.dayId === dayId,
    );
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a0a] px-8 py-10 text-[#fafafa]">
      {/* Competition name */}
      <h1 className="text-4xl font-bold text-center mb-10 tracking-tight">
        {schedule.competition.name}
      </h1>

      {/* Schedule by day */}
      <div className="max-w-4xl mx-auto space-y-10">
        {days.map((day) => {
          const dayBlocks = blocksByDay.get(day._id) ?? [];
          const dayEvents: Event[] = [];
          for (const block of dayBlocks) {
            const blockEvts = eventsByBlock.get(block._id) ?? [];
            dayEvents.push(...blockEvts);
          }

          return (
            <div key={day._id}>
              {days.length > 1 && (
                <h2 className="mb-4 border-b border-[#262626] pb-2 text-2xl font-semibold text-[#d4d4d4]">
                  {day.label ?? `Day ${day.position + 1}`}
                </h2>
              )}

              {/* Notes at start of day */}
              {getNotesAfterEvent(null, day._id).map((note) => (
                <AnnouncementBanner key={note._id} content={note.content} />
              ))}

              {dayEvents.length === 0 && (
                <p className="py-8 text-center text-xl text-[#737373]">
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
                        className={`rounded-[2px] border px-6 py-5 transition-colors ${
                          isActive
                            ? "border-gold/60 bg-[#141414]"
                            : isCompleted
                              ? "border-[#262626] bg-[#141414] opacity-40"
                              : "border-[#262626] bg-[#141414]"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {isActive && (
                            <Badge className="animate-pulse bg-gold px-3 py-1 text-sm font-bold text-[#0a0a0a]">
                              NOW
                            </Badge>
                          )}
                          <span className="text-2xl font-semibold">
                            {evt.name}
                          </span>
                          {isCompleted && (
                            <span className="ml-auto text-lg text-[#737373]">
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
                                className="border-[#737373] px-3 py-1 font-mono text-lg text-[#d4d4d4]"
                              >
                                {num}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Notes after this event */}
                      {getNotesAfterEvent(evt.id, day._id).map((note) => (
                        <AnnouncementBanner
                          key={note._id}
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
    <div className="my-3 flex items-start gap-4 rounded-[2px] border border-clay/50 bg-clay/15 px-6 py-4">
      <Megaphone className="mt-0.5 h-6 w-6 shrink-0 text-clay" />
      <p className="whitespace-pre-wrap text-xl leading-relaxed text-[#fafafa]">
        {content}
      </p>
    </div>
  );
}
