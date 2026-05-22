"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { trpc } from "@shared/lib/trpc";
import { api } from "../../../../../../../convex/_generated/api";
import { useCompLiveWithInvalidation } from "@competitions/lib/ably-comp-client";
import { cn } from "@shared/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowRight,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";

export default function DeckCaptainPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });

  // TODO Task 10/11: useCompLiveWithInvalidation still expects numeric competitionId
  const { connectionStatus } = useCompLiveWithInvalidation(comp?._id as unknown as number | undefined);

  if (!comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base sm:text-lg font-semibold">Deck Captain</h2>
        <span className={cn(
          "text-xs flex items-center gap-1",
          connectionStatus === "connected" && "text-status-sage",
          connectionStatus === "disconnected" && "text-muted-foreground",
          connectionStatus === "suspended" && "text-status-clay",
          connectionStatus === "failed" && "text-status-wine",
        )}>
          {connectionStatus === "connected" ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {connectionStatus === "connected" && "Live"}
          {connectionStatus === "disconnected" && "Connecting..."}
          {connectionStatus === "suspended" && "Reconnecting..."}
          {connectionStatus === "failed" && "Disconnected"}
        </span>
      </div>

      <Tabs defaultValue="checkin">
        <TabsList>
          <TabsTrigger value="checkin">
            <CheckCircle2 className="size-4 mr-1.5" />
            Check-in
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Calendar className="size-4 mr-1.5" />
            Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checkin">
          <CheckinTab competitionId={comp._id as unknown as number} />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleTab competitionId={comp._id as unknown as number} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Check-in Tab ───────────────────────────────────────────────────

function CheckinTab({ competitionId }: { competitionId: number }) {
  const utils = trpc.useUtils();

  const { data: checkinView, isLoading } =
    trpc.deckCaptain.getCheckinView.useQuery(
      { competitionId },
      { refetchInterval: 5000 },
    );

  const checkin = trpc.deckCaptain.checkin.useMutation({
    onSuccess: () => {
      utils.deckCaptain.getCheckinView.invalidate({ competitionId });
    },
    onError: (err) => toast.error(err.message),
  });

  const scratch = trpc.deckCaptain.scratch.useMutation({
    onSuccess: () => {
      utils.deckCaptain.getCheckinView.invalidate({ competitionId });
    },
    onError: (err) => toast.error(err.message),
  });

  const unscratch = trpc.deckCaptain.unscratch.useMutation({
    onSuccess: () => {
      utils.deckCaptain.getCheckinView.invalidate({ competitionId });
    },
    onError: (err) => toast.error(err.message),
  });

  const isMutating =
    checkin.isPending || scratch.isPending || unscratch.isPending;

  function handleTap(
    entry: NonNullable<typeof checkinView>["entries"][number],
  ) {
    if (isMutating) return;

    const roundId = checkinView?.roundId;
    if (!roundId) return;

    if (entry.status === null) {
      checkin.mutate({ roundId, entryId: entry.entryId });
    } else if (entry.status === "ready") {
      scratch.mutate({ roundId, entryId: entry.entryId });
    } else if (entry.status === "scratched") {
      unscratch.mutate({ roundId, entryId: entry.entryId });
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!checkinView || !checkinView.roundId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Users className="size-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No active round</p>
        <p className="text-sm mt-1">
          Start a round from the scoring dashboard to begin check-in.
        </p>
      </div>
    );
  }

  const readyCount = checkinView.entries.filter(
    (e) => e.status === "ready",
  ).length;
  const scratchedCount = checkinView.entries.filter(
    (e) => e.status === "scratched",
  ).length;
  const pendingCount = checkinView.entries.filter(
    (e) => e.status === null,
  ).length;

  return (
    <div className="space-y-4 pt-4">
      {/* Round header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{checkinView.eventName}</h3>
          <p className="text-sm text-muted-foreground capitalize">
            {checkinView.roundType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="status-sage"
          >
            <CheckCircle2 className="size-3 mr-1" />
            {readyCount} ready
          </Badge>
          {scratchedCount > 0 && (
            <Badge
              variant="secondary"
              className="status-wine"
            >
              <XCircle className="size-3 mr-1" />
              {scratchedCount} scratched
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge variant="outline">
              {pendingCount} pending
            </Badge>
          )}
        </div>
      </div>

      {/* Couple cards grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {checkinView.entries.map((entry) => (
          <button
            key={entry.entryId}
            type="button"
            onClick={() => handleTap(entry)}
            disabled={isMutating}
            className={cn(
              "relative flex min-h-[6rem] sm:min-h-[7rem] flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 sm:p-3 transition-all",
              "active:scale-[0.97] disabled:opacity-70",
              "select-none touch-manipulation",
              // Status-based styles
              entry.status === null &&
                "border-border bg-muted text-muted-foreground hover:border-foreground/20",
              entry.status === "ready" &&
                "status-sage hover:border-sage",
              entry.status === "scratched" &&
                "status-wine hover:border-wine",
            )}
          >
            {/* Stay on floor indicator */}
            {entry.stayOnFloor && (
              <Badge
                variant="secondary"
                className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 px-1 sm:px-1.5 py-0 text-[9px] sm:text-[10px] leading-4 sm:leading-5"
              >
                <ArrowRight className="size-2.5 sm:size-3 mr-0.5" />
                Stay
              </Badge>
            )}

            {/* Couple number */}
            <span className="text-xl sm:text-2xl font-bold leading-none">
              {entry.coupleNumber}
            </span>

            {/* Names */}
            <div
              className={cn(
                "mt-1 w-full space-y-0 text-center",
                entry.status === "scratched" && "line-through opacity-60",
              )}
            >
              <p className="truncate text-xs sm:text-sm leading-tight">
                {entry.leaderName}
              </p>
              <p className="truncate text-xs sm:text-sm leading-tight text-muted-foreground">
                {entry.followerName}
              </p>
            </div>

            {/* Status icon overlay */}
            {entry.status === "ready" && (
              <CheckCircle2 className="absolute bottom-1.5 right-1.5 size-4 text-status-sage" />
            )}
            {entry.status === "scratched" && (
              <XCircle className="absolute bottom-1.5 right-1.5 size-4 text-status-wine" />
            )}
          </button>
        ))}
      </div>

      {/* Tap legend */}
      <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border bg-muted" />
          Tap to check in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="status-sage inline-block size-3 rounded border" />
          Tap to scratch
        </span>
        <span className="flex items-center gap-1.5">
          <span className="status-wine inline-block size-3 rounded border" />
          Tap to unscratch
        </span>
      </div>
    </div>
  );
}

// ── Schedule Tab ───────────────────────────────────────────────────

function ScheduleTab({ competitionId }: { competitionId: number }) {
  const { data: scheduleView, isLoading } =
    trpc.deckCaptain.getScheduleView.useQuery({ competitionId });

  if (isLoading) {
    return (
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!scheduleView?.events?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <Calendar className="size-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No events scheduled</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {scheduleView.events.map((event) => (
        <Card key={event.id}>
          <CardHeader className="py-3 pb-2 px-3 sm:px-6">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium truncate">
                {event.name}
              </CardTitle>
              <Badge variant="outline" className="text-xs shrink-0">
                <Users className="size-3 mr-1" />
                {event.entryCount}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-3 px-3 sm:px-6">
            {event.rounds?.length ? (
              <div className="space-y-1">
                {event.rounds.map((round) => (
                  <div
                    key={round.id}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm",
                      round.status === "in_progress" &&
                        "status-clay border font-medium",
                      round.status === "completed" && "text-muted-foreground",
                      round.status === "pending" && "text-muted-foreground",
                    )}
                  >
                    <span className="capitalize">
                      {round.roundType.replace(/_/g, " ")}
                    </span>
                    <Badge
                      variant={
                        round.status === "in_progress"
                          ? "default"
                          : round.status === "completed"
                            ? "secondary"
                            : "outline"
                      }
                      className="text-xs capitalize"
                    >
                      {round.status === "in_progress" && (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      )}
                      {round.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No rounds generated
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
