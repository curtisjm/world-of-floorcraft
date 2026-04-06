"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import { Wand2, ChevronDown, ChevronRight, ArrowRightLeft } from "lucide-react";
import { cn } from "@shared/lib/utils";

export default function RoundsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: events } = trpc.event.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();

  const generateAll = trpc.round.generateForCompetition.useMutation({
    onSuccess: (result) => {
      utils.event.listByCompetition.invalidate({ competitionId: comp!.id });
      toast.success(`Generated ${result.totalRounds} rounds across ${result.events} events`);
    },
    onError: (err) => toast.error(err.message),
  });

  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rounds</h2>
        <Button
          onClick={() => generateAll.mutate({ competitionId: comp.id })}
          disabled={generateAll.isPending}
        >
          <Wand2 className="size-4 mr-2" />
          {generateAll.isPending ? "Generating..." : "Generate All Rounds"}
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
              key={event.id}
              event={event}
              expanded={expandedEvent === event.id}
              onToggle={() =>
                setExpandedEvent(expandedEvent === event.id ? null : event.id)
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
  event: any;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: rounds } = trpc.round.listByEvent.useQuery(
    { eventId: event.id },
    { enabled: expanded },
  );

  const generateForEvent = trpc.round.generateForEvent.useMutation({
    onSuccess: (result) => {
      toast.success(`Generated ${result.rounds} rounds with ${result.heats} heats`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRound = trpc.round.update.useMutation({
    onSuccess: () => toast.success("Round updated"),
    onError: (err) => toast.error(err.message),
  });

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
        <Badge variant="outline" className="text-xs">
          {event.entryCount ?? 0} entries
        </Badge>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4">
          {!rounds?.length ? (
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <span className="text-sm text-muted-foreground">No rounds generated</span>
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  generateForEvent.mutate({ eventId: event.id });
                }}
                disabled={generateForEvent.isPending}
              >
                Generate
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {rounds.map((round: any) => (
                <div key={round.id} className="p-3 rounded-md border space-y-2">
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
                    </div>
                    {round.callbacksRequested && (
                      <span className="text-xs text-muted-foreground">
                        Callbacks: {round.callbacksRequested}
                      </span>
                    )}
                  </div>
                  {round.heats?.length > 0 && (
                    <div className="space-y-1">
                      {round.heats.map((heat: any, i: number) => (
                        <div key={heat.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                          <span>Heat {i + 1}</span>
                          <span className="text-muted-foreground">
                            {heat.entries?.length ?? 0} entries
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    {round.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateRound.mutate({
                            roundId: round.id,
                            status: "in_progress",
                          })
                        }
                      >
                        Start
                      </Button>
                    )}
                    {round.status === "in_progress" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateRound.mutate({
                            roundId: round.id,
                            status: "completed",
                          })
                        }
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
