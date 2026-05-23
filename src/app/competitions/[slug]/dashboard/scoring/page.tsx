"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Separator } from "@shared/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { toast } from "sonner";
import {
  Calculator,
  Eye,
  CheckCircle2,
  Send,
  Play,
  Square,
  History,
  Radio,
  Loader2,
  SkipForward,
} from "lucide-react";

type CompetitionEvent = FunctionReturnType<
  typeof api.competitions.events.listByCompetition
>[number];

export default function ScoringPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const events = useQuery(
    api.competitions.events.listByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );

  const [selectedRoundId, setSelectedRoundId] = useState<Id<"rounds"> | null>(
    null,
  );

  if (!comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Scoring & Results</h2>

      {/* Live scrutineer panel */}
      <ScrutineerPanel competitionId={comp._id} />

      <Separator />

      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Events & Rounds
      </h3>

      {!events?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          No events configured.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <EventScoringCard
              key={event._id}
              event={event}
              onSelectRound={setSelectedRoundId}
            />
          ))}
        </div>
      )}

      {selectedRoundId && (
        <RoundDetailDialog
          roundId={selectedRoundId}
          onClose={() => setSelectedRoundId(null)}
        />
      )}
    </div>
  );
}

// ── Scrutineer Panel ────────────────────────────────────────────────

function ScrutineerPanel({
  competitionId,
}: {
  competitionId: Id<"competitions">;
}) {
  const status = useQuery(api.competitions.scrutineer.getSubmissionStatus, {
    competitionId,
  });
  const nextRound = useQuery(api.competitions.scrutineer.getNextRound, {
    competitionId,
  });

  const startRoundMutation = useMutation(api.competitions.scrutineer.startRound);
  const stopRoundMutation = useMutation(api.competitions.scrutineer.stopRound);
  const [startPending, setStartPending] = useState(false);
  const [stopPending, setStopPending] = useState(false);

  const allSubmitted = status?.submissions.length
    ? status.submissions.every((s) => s.status === "submitted")
    : false;

  const handleStart = async () => {
    setStartPending(true);
    try {
      await startRoundMutation({ competitionId });
      toast.success("Round started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start round");
    } finally {
      setStartPending(false);
    }
  };

  const handleStop = async () => {
    setStopPending(true);
    try {
      await stopRoundMutation({ competitionId });
      toast.success("Round stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop round");
    } finally {
      setStopPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="size-4 text-status-sage" />
          Live Scrutineer Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.activeRound ? (
          <>
            {/* Active round info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{status.activeRound.eventName}</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {status.activeRound.roundType?.replace(/_/g, " ")}
                </p>
              </div>
              <Badge variant={allSubmitted ? "default" : "secondary"}>
                {allSubmitted ? "All Submitted" : "In Progress"}
              </Badge>
            </div>

            {/* Judge submissions */}
            <div className="space-y-1">
              {status.submissions.map((sub) => (
                <div
                  key={sub.judgeId}
                  className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30"
                >
                  <span>{sub.judgeName}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={sub.status === "submitted" ? "default" : "outline"}
                      className="text-xs"
                    >
                      {sub.status}
                    </Badge>
                    {sub.submittedAt && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(sub.submittedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Round controls */}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                disabled={stopPending}
              >
                <Square className="size-4 mr-1" />
                Stop Round
              </Button>
              {allSubmitted && (
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={startPending}
                >
                  <SkipForward className="size-4 mr-1" />
                  Advance
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No round currently active.</p>
            {nextRound ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Next: {nextRound.eventName}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {nextRound.roundType.replace(/_/g, " ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={startPending}
                >
                  {startPending ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="size-4 mr-1" />
                  )}
                  Start
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                All rounds completed, or no rounds generated.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Event Scoring Card ──────────────────────────────────────────────

function EventScoringCard({
  event,
  onSelectRound,
}: {
  event: CompetitionEvent;
  onSelectRound: (roundId: Id<"rounds">) => void;
}) {
  const rounds = useQuery(api.competitions.rounds.listByEvent, {
    eventId: event._id,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{event.name}</CardTitle>
          <Badge variant="secondary" className="text-xs capitalize">
            {event.style}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!rounds?.length ? (
          <p className="text-sm text-muted-foreground">No rounds generated</p>
        ) : (
          <div className="space-y-1">
            {rounds.map((round) => (
              <div
                key={round._id}
                className="flex items-center justify-between p-2 rounded-md border hover:bg-accent/30 cursor-pointer transition-colors"
                onClick={() => onSelectRound(round._id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm capitalize">
                    {round.roundType.replace(/_/g, " ")}
                  </span>
                  <Badge
                    variant={
                      round.status === "completed"
                        ? "default"
                        : round.status === "in_progress"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-xs capitalize"
                  >
                    {round.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <Eye className="size-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Round Detail Dialog ─────────────────────────────────────────────

function RoundDetailDialog({
  roundId,
  onClose,
}: {
  roundId: Id<"rounds">;
  onClose: () => void;
}) {
  const [showCorrections, setShowCorrections] = useState(false);

  const results = useQuery(api.competitions.scrutineer.getResults, { roundId });
  const corrections = useQuery(
    api.competitions.scrutineer.getCorrectionHistory,
    showCorrections ? { roundId } : "skip",
  );

  const computeCallbackMutation = useMutation(
    api.competitions.scoring.computeCallbackResults,
  );
  const computeFinalMutation = useMutation(
    api.competitions.scoring.computeFinalResults,
  );
  const reviewMutation = useMutation(api.competitions.scrutineer.reviewResults);
  const publishMutation = useMutation(api.competitions.scrutineer.publishResults);
  const recomputeMutation = useMutation(
    api.competitions.scrutineer.recomputeResults,
  );

  const [computeCallbackPending, setComputeCallbackPending] = useState(false);
  const [computeFinalPending, setComputeFinalPending] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [publishPending, setPublishPending] = useState(false);
  const [recomputePending, setRecomputePending] = useState(false);

  const resultStatus = results?.meta?.status;

  const handleComputeCallback = async () => {
    setComputeCallbackPending(true);
    try {
      const result = await computeCallbackMutation({ roundId });
      toast.success(`${result.advanced} of ${result.couples} couples advanced`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to compute callbacks",
      );
    } finally {
      setComputeCallbackPending(false);
    }
  };

  const handleComputeFinal = async () => {
    setComputeFinalPending(true);
    try {
      await computeFinalMutation({ roundId });
      toast.success("Final results computed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to compute final");
    } finally {
      setComputeFinalPending(false);
    }
  };

  const handleReview = async () => {
    setReviewPending(true);
    try {
      await reviewMutation({ roundId });
      toast.success("Results marked as reviewed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to review results");
    } finally {
      setReviewPending(false);
    }
  };

  const handlePublish = async () => {
    setPublishPending(true);
    try {
      await publishMutation({ roundId });
      toast.success("Results published!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishPending(false);
    }
  };

  const handleRecompute = async () => {
    setRecomputePending(true);
    try {
      await recomputeMutation({ roundId });
      toast.success("Results recomputed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to recompute");
    } finally {
      setRecomputePending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Round Details</DialogTitle>
        </DialogHeader>

        {/* Result status */}
        {resultStatus && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge
              variant={
                resultStatus === "published"
                  ? "default"
                  : resultStatus === "reviewed"
                    ? "secondary"
                    : "outline"
              }
            >
              {resultStatus}
            </Badge>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleComputeCallback}
            disabled={computeCallbackPending}
          >
            <Calculator className="size-4 mr-1" />
            Compute Callbacks
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleComputeFinal}
            disabled={computeFinalPending}
          >
            <Calculator className="size-4 mr-1" />
            Compute Final
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecompute}
            disabled={recomputePending}
          >
            <Calculator className="size-4 mr-1" />
            Recompute
          </Button>
          {resultStatus === "computed" && (
            <Button size="sm" onClick={handleReview} disabled={reviewPending}>
              <CheckCircle2 className="size-4 mr-1" />
              Review
            </Button>
          )}
          {resultStatus === "reviewed" && (
            <Button size="sm" onClick={handlePublish} disabled={publishPending}>
              <Send className="size-4 mr-1" />
              Publish
            </Button>
          )}
        </div>

        {/* Callback results */}
        {results?.callbacks?.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Callback Results</h3>
            {results.callbacks.map((r) => (
              <div
                key={r._id}
                className={`flex items-center justify-between text-sm p-2 rounded-md ${
                  r.advanced ? "status-sage" : "bg-muted/30"
                }`}
              >
                <span>Entry {r.entryId}</span>
                <div className="flex items-center gap-2">
                  <span>{r.totalMarks} marks</span>
                  {r.advanced && <Badge className="text-xs">Advanced</Badge>}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Final results */}
        {results?.results?.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Final Placements</h3>
            {results.results
              .filter((r) => !r.danceName) // Overall results
              .map((r) => (
                <div
                  key={r._id}
                  className={`flex items-center justify-between text-sm p-2 rounded-md ${
                    r.placement <= 3 ? "placement-gold" : "bg-muted/30"
                  }`}
                >
                  <span className="font-medium">#{r.placement}</span>
                  <span>Entry {r.entryId}</span>
                  {r.tiebreakRule && (
                    <Badge variant="outline" className="text-xs">
                      {r.tiebreakRule}
                    </Badge>
                  )}
                </div>
              ))}
            {/* Per-dance results if multi-dance */}
            {results.results.some((r) => r.danceName) && (
              <>
                <Separator />
                <h4 className="text-xs font-medium text-muted-foreground">Per-Dance Breakdown</h4>
                {results.results
                  .filter((r) => r.danceName)
                  .map((r) => (
                    <div key={r._id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/20">
                      <span>{r.danceName}</span>
                      <span>Entry {r.entryId}: {r.placement}</span>
                    </div>
                  ))}
              </>
            )}
          </div>
        ) : null}

        {/* Tabulation */}
        {results?.tabulation?.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Tabulation</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="p-1 text-left">Entry</th>
                    <th className="p-1 text-left">Dance</th>
                    <th className="p-1 text-left">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {results.tabulation.map((row) => (
                    <tr key={row._id} className="border-b">
                      <td className="p-1">{row.entryId}</td>
                      <td className="p-1 text-muted-foreground">{row.danceName ?? "Overall"}</td>
                      <td className="p-1 font-mono">
                        {JSON.stringify(row.tableData).slice(0, 80)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Correction history toggle */}
        <Separator />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCorrections(!showCorrections)}
        >
          <History className="size-4 mr-1" />
          {showCorrections ? "Hide" : "Show"} Correction History
        </Button>

        {showCorrections && corrections && (
          <div className="space-y-1">
            {corrections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No corrections recorded</p>
            ) : (
              corrections.map((c) => (
                <div key={c._id} className="text-xs p-2 rounded bg-muted/30 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-medium">{c.judgeName}</span>
                    <Badge variant="outline" className="text-xs">{c.source}</Badge>
                  </div>
                  <p>
                    Entry {c.entryId}
                    {c.danceName && ` (${c.danceName})`}: {c.oldValue} → {c.newValue}
                  </p>
                  {c.reason && <p className="text-muted-foreground">{c.reason}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
