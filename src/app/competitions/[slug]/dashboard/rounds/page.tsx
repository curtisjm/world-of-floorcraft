"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

type CompetitionEvent = FunctionReturnType<
  typeof api.competitions.events.listByCompetition
>[number];
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import { Wand2, ChevronDown, ChevronRight, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@shared/lib/utils";

export default function RoundsPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const events = useQuery(
    api.competitions.events.listByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );

  const generateAllMutation = useMutation(
    api.competitions.rounds.generateForCompetition,
  );
  const [generateAllPending, setGenerateAllPending] = useState(false);

  const [expandedEvent, setExpandedEvent] = useState<Id<"competitionEvents"> | null>(
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

  const handleGenerateAll = async () => {
    setGenerateAllPending(true);
    try {
      const result = await generateAllMutation({ competitionId: comp._id });
      toast.success(
        `Generated ${result.totalRounds} rounds across ${result.events} events`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate rounds");
    } finally {
      setGenerateAllPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rounds</h2>
        <Button onClick={handleGenerateAll} disabled={generateAllPending}>
          <Wand2 className="size-4 mr-2" />
          {generateAllPending ? "Generating..." : "Generate All Rounds"}
        </Button>
      </div>

      {!events?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          No events configured. Add events first.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <EventRoundsCard
              key={event._id}
              event={event}
              expanded={expandedEvent === event._id}
              onToggle={() =>
                setExpandedEvent(
                  expandedEvent === event._id ? null : event._id,
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRoundsCard({
  event,
  expanded,
  onToggle,
}: {
  event: CompetitionEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rounds = useQuery(
    api.competitions.rounds.listByEvent,
    expanded ? { eventId: event._id } : "skip",
  );

  const generateForEventMutation = useMutation(
    api.competitions.rounds.generateForEvent,
  );
  const updateRoundMutation = useMutation(api.competitions.rounds.update);
  const approveHeatsMutation = useMutation(api.competitions.rounds.approveHeats);
  const reassignHeatsMutation = useMutation(api.competitions.rounds.reassignHeats);

  const [generatePending, setGeneratePending] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [reassignPending, setReassignPending] = useState(false);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setGeneratePending(true);
    try {
      const result = await generateForEventMutation({ eventId: event._id });
      toast.success(
        `Generated ${result.rounds} rounds with ${result.heats} heats`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate rounds");
    } finally {
      setGeneratePending(false);
    }
  };

  const handleUpdate = async (
    roundId: Id<"rounds">,
    status: "in_progress" | "completed",
  ) => {
    setUpdatePending(true);
    try {
      await updateRoundMutation({ roundId, status });
      toast.success("Round updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update round");
    } finally {
      setUpdatePending(false);
    }
  };

  const handleApproveHeats = async (roundId: Id<"rounds">) => {
    setApprovePending(true);
    try {
      await approveHeatsMutation({ roundId });
      toast.success("Heats approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve heats");
    } finally {
      setApprovePending(false);
    }
  };

  const handleReassignHeats = async (roundId: Id<"rounds">) => {
    setReassignPending(true);
    try {
      const result = await reassignHeatsMutation({ roundId });
      toast.success(
        `Reassigned ${result.entries} entries across ${result.heats} heats`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign heats");
    } finally {
      setReassignPending(false);
    }
  };

  return (
    <Card>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <div>
            <span className="text-sm font-medium">{event.name}</span>
            <div className="flex gap-1 mt-0.5">
              <Badge variant="secondary" className="text-xs capitalize">{event.style}</Badge>
              <Badge variant="secondary" className="text-xs capitalize">{event.level}</Badge>
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs capitalize">
          {event.eventType}
        </Badge>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4">
          {!rounds?.length ? (
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <span className="text-sm text-muted-foreground">No rounds generated</span>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generatePending}
              >
                Generate
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {rounds.map((round) => (
                <div key={round._id} className="p-3 rounded-md border space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">
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
                        {round.status}
                      </Badge>
                      {round.heats?.length > 0 && (
                        <Badge
                          variant={round.heatsApproved ? "default" : "outline"}
                          className={cn(
                            "text-xs",
                            round.heatsApproved
                              ? "status-sage"
                              : "text-status-clay",
                          )}
                        >
                          {round.heatsApproved ? (
                            <><CheckCircle2 className="size-3 mr-1" /> Heats Approved</>
                          ) : (
                            "Heats Pending Approval"
                          )}
                        </Badge>
                      )}
                    </div>
                    {round.callbacksRequested && (
                      <span className="text-xs text-muted-foreground">
                        Callbacks: {round.callbacksRequested}
                      </span>
                    )}
                  </div>
                  {round.heats?.length > 0 && (
                    <div className="space-y-1">
                      {round.heats.map((heat, i) => (
                        <div key={heat._id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                          <span>Heat {i + 1}</span>
                          <span className="text-muted-foreground">
                            {heat.entries?.length ?? 0} entries
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    {round.heats?.length > 0 && !round.heatsApproved && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReassignHeats(round._id)}
                          disabled={reassignPending}
                        >
                          <ArrowRightLeft className="size-3 mr-1" />
                          Reassign Heats
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApproveHeats(round._id)}
                          disabled={approvePending}
                        >
                          <CheckCircle2 className="size-3 mr-1" />
                          Approve Heats
                        </Button>
                      </>
                    )}
                    {round.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdate(round._id, "in_progress")}
                        disabled={updatePending}
                      >
                        Start
                      </Button>
                    )}
                    {round.status === "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdate(round._id, "completed")}
                        disabled={updatePending}
                      >
                        Complete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
