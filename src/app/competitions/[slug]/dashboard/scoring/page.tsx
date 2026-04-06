"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
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
  Unlock,
  History,
  Radio,
  Loader2,
  SkipForward,
} from "lucide-react";

export default function ScoringPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: events } = trpc.event.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null);

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
      <ScrutineerPanel competitionId={comp.id} />

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
              key={event.id}
              event={event}
              onSelectRound={setSelectedRoundId}
            />
          ))}
        </div>
      )}

      {selectedRoundId && (
        <RoundDetailDialog
          roundId={selectedRoundId}
          competitionId={comp.id}
          onClose={() => setSelectedRoundId(null)}
        />
      )}
    </div>
  );
}

// ── Scrutineer Panel ────────────────────────────────────────────────

function ScrutineerPanel({ competitionId }: { competitionId: number }) {
  const utils = trpc.useUtils();
  const { data: status, refetch } = trpc.scrutineer.getSubmissionStatus.useQuery(
    { competitionId },
    { refetchInterval: 3000 },
  );
  const { data: nextRound } = trpc.scrutineer.getNextRound.useQuery(
    { competitionId },
  );

  const startRound = trpc.scrutineer.startRound.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Round started");
    },
    onError: (err) => toast.error(err.message),
  });

  const stopRound = trpc.scrutineer.stopRound.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Round stopped");
    },
    onError: (err) => toast.error(err.message),
  });

  const allSubmitted = status?.submissions.length
    ? status.submissions.every((s) => s.status === "submitted")
    : false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="size-4 text-green-500" />
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
                onClick={() => stopRound.mutate({ competitionId })}
                disabled={stopRound.isPending}
              >
                <Square className="size-4 mr-1" />
                Stop Round
              </Button>
              {allSubmitted && (
                <Button
                  size="sm"
                  onClick={() => startRound.mutate({ competitionId })}
                  disabled={startRound.isPending}
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
                  onClick={() => startRound.mutate({ competitionId })}
                  disabled={startRound.isPending}
                >
                  {startRound.isPending ? (
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
  event: any;
  onSelectRound: (roundId: number) => void;
}) {
  const { data: rounds } = trpc.round.listByEvent.useQuery({ eventId: event.id });

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
            {rounds.map((round: any) => (
              <div
                key={round.id}
                className="flex items-center justify-between p-2 rounded-md border hover:bg-accent/30 cursor-pointer transition-colors"
                onClick={() => onSelectRound(round.id)}
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
  competitionId,
  onClose,
}: {
  roundId: number;
  competitionId: number;
  onClose: () => void;
}) {
  const [showCorrections, setShowCorrections] = useState(false);

  const { data: results, refetch: refetchResults } = trpc.scrutineer.getResults.useQuery({ roundId });
  const { data: corrections } = trpc.scrutineer.getCorrectionHistory.useQuery(
    { roundId },
    { enabled: showCorrections },
  );

  const computeCallback = trpc.scoring.computeCallbackResults.useMutation({
    onSuccess: (result) => {
      refetchResults();
      toast.success(`${result.advanced} of ${result.couples} couples advanced`);
    },
    onError: (err) => toast.error(err.message),
  });

  const computeFinal = trpc.scoring.computeFinalResults.useMutation({
    onSuccess: () => {
      refetchResults();
      toast.success("Final results computed");
    },
    onError: (err) => toast.error(err.message),
  });

  const reviewMutation = trpc.scrutineer.reviewResults.useMutation({
    onSuccess: () => {
      refetchResults();
      toast.success("Results marked as reviewed");
    },
    onError: (err) => toast.error(err.message),
  });

  const publishMutation = trpc.scrutineer.publishResults.useMutation({
    onSuccess: () => {
      refetchResults();
      toast.success("Results published!");
    },
    onError: (err) => toast.error(err.message),
  });

  const recomputeMutation = trpc.scrutineer.recomputeResults.useMutation({
    onSuccess: () => {
      refetchResults();
      toast.success("Results recomputed");
    },
    onError: (err) => toast.error(err.message),
  });

  const resultStatus = results?.meta?.status;

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
            onClick={() => computeCallback.mutate({ roundId })}
            disabled={computeCallback.isPending}
          >
            <Calculator className="size-4 mr-1" />
            Compute Callbacks
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => computeFinal.mutate({ roundId })}
            disabled={computeFinal.isPending}
          >
            <Calculator className="size-4 mr-1" />
            Compute Final
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => recomputeMutation.mutate({ roundId })}
            disabled={recomputeMutation.isPending}
          >
            <Calculator className="size-4 mr-1" />
            Recompute
          </Button>
          {resultStatus === "computed" && (
            <Button
              size="sm"
              onClick={() => reviewMutation.mutate({ roundId })}
              disabled={reviewMutation.isPending}
            >
              <CheckCircle2 className="size-4 mr-1" />
              Review
            </Button>
          )}
          {resultStatus === "reviewed" && (
            <Button
              size="sm"
              onClick={() => publishMutation.mutate({ roundId })}
              disabled={publishMutation.isPending}
            >
              <Send className="size-4 mr-1" />
              Publish
            </Button>
          )}
        </div>

        {/* Callback results */}
        {results?.callbacks?.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Callback Results</h3>
            {results.callbacks.map((r: any) => (
              <div
                key={r.entryId}
                className={`flex items-center justify-between text-sm p-2 rounded-md ${
                  r.advanced ? "bg-green-500/10" : "bg-muted/30"
                }`}
              >
                <span>Entry #{r.entryId}</span>
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
              .filter((r: any) => !r.danceName) // Overall results
              .map((r: any) => (
                <div
                  key={r.entryId}
                  className={`flex items-center justify-between text-sm p-2 rounded-md ${
                    r.placement <= 3 ? "bg-yellow-500/10" : "bg-muted/30"
                  }`}
                >
                  <span className="font-medium">#{r.placement}</span>
                  <span>Entry #{r.entryId}</span>
                  {r.tiebreakRule && (
                    <Badge variant="outline" className="text-xs">
                      {r.tiebreakRule}
                    </Badge>
                  )}
                </div>
              ))}
            {/* Per-dance results if multi-dance */}
            {results.results.some((r: any) => r.danceName) && (
              <>
                <Separator />
                <h4 className="text-xs font-medium text-muted-foreground">Per-Dance Breakdown</h4>
                {results.results
                  .filter((r: any) => r.danceName)
                  .map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/20">
                      <span>{r.danceName}</span>
                      <span>Entry #{r.entryId}: {r.placement}</span>
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
                  {results.tabulation.map((row: any, i: number) => (
                    <tr key={i} className="border-b">
                      <td className="p-1">#{row.entryId}</td>
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
              corrections.map((c: any) => (
                <div key={c.id} className="text-xs p-2 rounded bg-muted/30 space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-medium">{c.judgeName}</span>
                    <Badge variant="outline" className="text-xs">{c.source}</Badge>
                  </div>
                  <p>
                    Entry #{c.entryId}
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
