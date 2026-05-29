"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import {
  Activity,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Circle,
} from "lucide-react";
import { cn } from "@shared/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────

type EventSummary = {
  id: Id<"competitionEvents">;
  name: string;
  sessionId: Id<"scheduleBlocks"> | undefined;
  position: number | undefined;
  entryCount: number;
  rounds: { id: Id<"rounds">; roundType: string; status: string }[];
};

function deriveEventStatus(rounds: { status: string }[]) {
  if (rounds.length === 0) return "upcoming";
  if (rounds.every((r) => r.status === "completed")) return "completed";
  if (rounds.some((r) => r.status === "in_progress")) return "in_progress";
  if (rounds.some((r) => r.status === "completed")) return "in_progress";
  return "upcoming";
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
      return "default" as const;
    case "in_progress":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function formatTime(date: Date | string | number) {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Page ───────────────────────────────────────────────────────────

export default function CompDayDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });

  const dashboard = useQuery(
    api.competitions.scrutineer.getDashboard,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = dashboard === undefined;

  if (!comp || isLoading) {
    return <DashboardSkeleton />;
  }

  if (!dashboard) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Unable to load dashboard data.
      </div>
    );
  }

  const completedEvents = dashboard.events.filter(
    (e) => deriveEventStatus(e.rounds) === "completed",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="size-5" />
          Comp Day Dashboard
        </h2>
      </div>

      {/* Active Round */}
      <ActiveRoundCard
        activeRound={dashboard.activeRound}
        submissions={dashboard.submissions}
      />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="size-4 text-muted-foreground" />}
          label="Check-In"
          value={`${dashboard.registrations.checkedIn} / ${dashboard.registrations.total}`}
          sub={
            dashboard.registrations.total > 0
              ? `${Math.round((dashboard.registrations.checkedIn / dashboard.registrations.total) * 100)}%`
              : "No registrations"
          }
          progress={
            dashboard.registrations.total > 0
              ? dashboard.registrations.checkedIn / dashboard.registrations.total
              : 0
          }
        />
        <StatCard
          icon={<AlertCircle className="size-4 text-clay" />}
          label="Pending Add/Drops"
          value={String(dashboard.pendingAddDrops)}
          sub={dashboard.pendingAddDrops > 0 ? "Needs attention" : "All clear"}
          highlight={dashboard.pendingAddDrops > 0}
        />
        <StatCard
          icon={<CheckCircle2 className="size-4 text-sage" />}
          label="Events"
          value={`${completedEvents} / ${dashboard.events.length}`}
          sub={
            completedEvents === dashboard.events.length
              ? "All complete"
              : "In progress"
          }
          progress={
            dashboard.events.length > 0
              ? completedEvents / dashboard.events.length
              : 0
          }
        />
      </div>

      {/* Event List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Events
        </h3>
        {dashboard.events.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No events configured.
          </div>
        ) : (
          <div className="space-y-2">
            {dashboard.events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Active Round Card ──────────────────────────────────────────────

function ActiveRoundCard({
  activeRound,
  submissions,
}: {
  activeRound: {
    roundId: Id<"rounds">;
    eventName: string;
    roundType?: string;
    startedAt: number;
  } | null;
  submissions: {
    judgeId: Id<"judges">;
    status: string;
    submittedAt: number | null;
  }[];
}) {
  if (!activeRound) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-muted-foreground">
          <Clock className="size-5 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No active round</p>
        </CardContent>
      </Card>
    );
  }

  const submittedCount = submissions.filter(
    (s) => s.status === "submitted",
  ).length;
  const allSubmitted =
    submissions.length > 0 && submittedCount === submissions.length;

  return (
    <Card className={cn(allSubmitted ? "border-sage/50" : "border-foreground/25")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {activeRound.eventName}
          </CardTitle>
          <Badge variant={allSubmitted ? "default" : "secondary"}>
            {allSubmitted ? "All Submitted" : "Judging"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="capitalize">
            {activeRound.roundType?.replace(/_/g, " ") ?? "Round"}
          </span>
          {" · Started "}
          {formatTime(activeRound.startedAt)}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {submissions.map((sub) => {
            const done = sub.status === "submitted";
            return (
              <div
                key={sub.judgeId}
                className={cn(
                  "flex items-center gap-2 rounded-[2px] border px-3 py-2 text-sm",
                  done ? "border-sage/30 bg-sage/10" : "border-border bg-muted/40",
                )}
              >
                {done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-sage" />
                ) : (
                  <Circle className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">J{sub.judgeId.slice(-4)}</span>
              </div>
            );
          })}
        </div>
        {submissions.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {submittedCount} / {submissions.length} judges submitted
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  progress,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  progress?: number;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-clay/50")}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {progress !== undefined && (
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ── Event Card ─────────────────────────────────────────────────────

function EventCard({ event }: { event: EventSummary }) {
  const [expanded, setExpanded] = useState(false);
  const status = deriveEventStatus(event.rounds);
  const completedRounds = event.rounds.filter(
    (r) => r.status === "completed",
  ).length;

  return (
    <Card>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors rounded-t-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium truncate">{event.name}</span>
          <Badge
            variant={statusBadgeVariant(status)}
            className="text-xs capitalize shrink-0"
          >
            {status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
          <span>{event.entryCount} entries</span>
          <span>
            {completedRounds}/{event.rounds.length} rounds
          </span>
        </div>
      </div>

      {expanded && (
        <EventDetails eventId={event.id} eventRounds={event.rounds} />
      )}
    </Card>
  );
}

// ── Event Details (expanded) ───────────────────────────────────────

function EventDetails({
  eventId,
  eventRounds,
}: {
  eventId: Id<"competitionEvents">;
  eventRounds: { id: Id<"rounds">; roundType: string; status: string }[];
}) {
  const progress = useQuery(
    api.competitions.scrutineer.getEventProgress,
    { eventId },
  );
  const isLoading = progress === undefined;

  const markCompleteMutation = useMutation(
    api.competitions.scrutineer.markEventComplete,
  );
  const [markPending, setMarkPending] = useState(false);

  async function handleMarkComplete() {
    setMarkPending(true);
    try {
      await markCompleteMutation({ eventId });
      toast.success("Event marked as complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark complete");
    } finally {
      setMarkPending(false);
    }
  }

  const allPublished =
    progress?.rounds.length &&
    progress.rounds.every((r) => r.resultStatus === "published");
  const allCompleted =
    eventRounds.length > 0 &&
    eventRounds.every((r) => r.status === "completed");

  return (
    <CardContent className="pt-0 pb-4">
      {isLoading ? (
        <div className="space-y-2 py-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : progress ? (
        <div className="space-y-2">
          {progress.rounds.map((round) => (
            <div
              key={round.id}
              className="flex items-center justify-between p-2.5 rounded-md border text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="capitalize">
                  {round.roundType.replace(/_/g, " ")}
                </span>
                <Badge
                  variant={statusBadgeVariant(round.status)}
                  className="text-xs capitalize"
                >
                  {round.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{round.entryCount} entries</span>
                {round.callbacksRequested && (
                  <span>CB: {round.callbacksRequested}</span>
                )}
                {round.resultStatus && (
                  <Badge
                    variant={
                      round.resultStatus === "published"
                        ? "default"
                        : "outline"
                    }
                    className="text-xs capitalize"
                  >
                    {round.resultStatus}
                  </Badge>
                )}
              </div>
            </div>
          ))}

          {allPublished && !allCompleted && (
            <Button
              size="sm"
              className="mt-2"
              onClick={handleMarkComplete}
              disabled={markPending}
            >
              <CheckCircle2 className="size-4 mr-1" />
              {markPending ? "Marking..." : "Mark Complete"}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2">
          No round data available.
        </p>
      )}
    </CardContent>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-32 rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </div>
  );
}
