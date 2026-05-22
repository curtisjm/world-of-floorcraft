"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Textarea } from "@shared/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@shared/ui/dialog";
import { ArrowLeft, Trophy, Calendar, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export default function CompetitorHistoryPage() {
  const { userId: profileUserId } = useParams<{ userId: string }>();
  const { user: currentUser } = useUser();
  const isOwnProfile = currentUser?.id === profileUserId;

  const { data: history, isLoading } =
    trpc.results.getCompetitorHistory.useQuery({ userId: profileUserId });

  const { data: myRemovalRequests } =
    trpc.recordRemoval.getMyRequests.useQuery(undefined, {
      enabled: isOwnProfile,
    });

  if (isLoading) {
    return <HistorySkeleton />;
  }

  if (!history) {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4 sm:py-8 space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Competitor not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build a set of competition IDs that have pending/approved removal requests
  const removalsByComp = new Map(
    (myRemovalRequests ?? []).map((r) => [r.competitionId, r.status]),
  );

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 sm:py-8 space-y-6">
      <BackLink />

      {/* Profile header */}
      <div className="flex items-center gap-3">
        <div className="size-10 sm:size-12 rounded-full bg-muted flex items-center justify-center shrink-0">
          <span className="text-base sm:text-lg font-medium">
            {(history.user.displayName ?? "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            {history.user.displayName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {history.competitions.length}{" "}
            {history.competitions.length === 1 ? "competition" : "competitions"}
          </p>
        </div>
      </div>

      {history.competitions.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="size-10 mx-auto mb-3 opacity-30" />
            <p>No competition results yet.</p>
          </CardContent>
        </Card>
      )}

      {/* Competition history */}
      <div className="space-y-4">
        {history.competitions.map((comp) => {
          const removalStatus = removalsByComp.get(comp.competitionId);

          return (
            <Card key={comp.competitionId}>
              <CardContent className="py-4 px-5 space-y-3">
                {/* Competition header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/competitions/${comp.competitionSlug}/results`}
                      className="font-medium hover:underline"
                    >
                      {comp.competitionName}
                    </Link>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      {comp.organizationName && (
                        <span>{comp.organizationName}</span>
                      )}
                      {comp.date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(comp.date).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Record removal status/action */}
                  {isOwnProfile && removalStatus === "pending" && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      Removal pending
                    </Badge>
                  )}
                  {isOwnProfile && removalStatus === "approved" && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      Removed
                    </Badge>
                  )}
                  {isOwnProfile && !removalStatus && (
                    <RemovalDialog competitionId={comp.competitionId} />
                  )}
                </div>

                {/* Event placements */}
                <div className="space-y-1.5">
                  {comp.events.map((event) => (
                    <div
                      key={event.eventId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/competitions/${comp.competitionSlug}/results/${event.eventId}`}
                          className="truncate block hover:underline"
                        >
                          {event.eventName}
                        </Link>
                        {event.partnerName && (
                          <span className="text-muted-foreground text-xs">
                            w/ {event.partnerName}
                          </span>
                        )}
                      </div>
                      {event.placement != null && (
                        <PlacementBadge placement={event.placement} />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Record Removal Dialog ─────────────────────────────────────

function RemovalDialog({ competitionId }: { competitionId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const submit = trpc.recordRemoval.submit.useMutation({
    onSuccess: () => {
      toast.success("Removal request submitted");
      utils.recordRemoval.getMyRequests.invalidate();
      setOpen(false);
      setReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground shrink-0">
          <ShieldAlert className="size-3 mr-1" />
          Request Removal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Record Removal</DialogTitle>
          <DialogDescription>
            Request to have your results removed from this competition&apos;s
            public records. The organizer will review your request.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Reason for removal request..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate({ competitionId, reason })}
            disabled={reason.trim().length === 0 || submit.isPending}
          >
            {submit.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared Components ─────────────────────────────────────────

function PlacementBadge({ placement }: { placement: number }) {
  const variant =
    placement === 1
      ? "border-gold/50 bg-card text-gold"
      : placement === 2
        ? "border-silver/50 bg-card text-silver"
        : placement === 3
          ? "border-bronze/50 bg-card text-bronze"
          : "border-border bg-secondary text-muted-foreground";

  return (
    <span
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${variant}`}
    >
      {placement}
    </span>
  );
}

function BackLink() {
  return (
    <Link
      href="/competitors"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-4" />
      Competitor Search
    </Link>
  );
}

function HistorySkeleton() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 sm:py-8 space-y-6">
      <BackLink />
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 sm:size-12 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-none" />
      ))}
    </div>
  );
}
