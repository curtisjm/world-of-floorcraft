"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { cn } from "@shared/lib/utils";
import { Trophy, ChevronRight } from "lucide-react";

export default function CompetitionResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });

  const { data: results, isLoading } = trpc.results.getByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  if (!comp || isLoading) {
    return <ResultsSkeleton />;
  }

  if (!results || results.events.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <ResultsHeader compName={comp.name} orgName={null} />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="size-10 mx-auto mb-3 opacity-30" />
            <p>No results published yet.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group events by session/block for display
  const eventsBySession = new Map<number | null, typeof results.events>();
  for (const event of results.events) {
    const key = event.sessionId;
    if (!eventsBySession.has(key)) eventsBySession.set(key, []);
    eventsBySession.get(key)!.push(event);
  }

  // Map session IDs to block labels
  const blockMap = new Map(results.blocks.map((b) => [b.id, b]));

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <ResultsHeader
        compName={results.competition.name}
        orgName={results.competition.organization}
      />

      <div className="space-y-8">
        {[...eventsBySession.entries()].map(([sessionId, events]) => {
          const block = sessionId != null ? blockMap.get(sessionId) : null;

          return (
            <div key={sessionId ?? "unsorted"} className="space-y-3">
              {block && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {block.label}
                </h2>
              )}

              {events.map((event) => (
                <Link
                  key={event.eventId}
                  href={`/competitions/${slug}/results/${event.eventId}`}
                  className="block"
                >
                  <Card className="hover:bg-accent/30 transition-colors group">
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">
                            {event.eventName}
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {event.style}
                            </Badge>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {event.level}
                            </Badge>
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                      </div>

                      {/* Top 3 preview */}
                      <div className="space-y-1">
                        {event.placements.slice(0, 3).map((p) => (
                          <PlacementRow
                            key={p.placement}
                            placement={p.placement}
                            coupleNumber={p.coupleNumber}
                            leaderName={p.leaderName}
                            followerName={p.followerName}
                            organization={p.organization}
                          />
                        ))}
                        {event.placements.length > 3 && (
                          <p className="text-xs text-muted-foreground pl-9 pt-1">
                            +{event.placements.length - 3} more
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────

function ResultsHeader({
  compName,
  orgName,
}: {
  compName: string;
  orgName: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <Trophy className="size-6 text-amber-500" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{compName}</h1>
        <p className="text-sm text-muted-foreground">
          {orgName ? `${orgName} · Results` : "Results"}
        </p>
      </div>
    </div>
  );
}

function PlacementRow({
  placement,
  coupleNumber,
  leaderName,
  followerName,
  organization,
}: {
  placement: number;
  coupleNumber: number | null;
  leaderName: string | null;
  followerName: string | null;
  organization: string | null;
}) {
  const isMedal = placement <= 3;
  const medalColor =
    placement === 1
      ? "text-amber-600 dark:text-amber-400"
      : placement === 2
        ? "text-gray-500 dark:text-gray-400"
        : "text-orange-600 dark:text-orange-400";

  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={cn(
          "w-6 text-right font-bold tabular-nums",
          isMedal ? medalColor : "text-muted-foreground",
        )}
      >
        {placement}
      </span>
      {coupleNumber != null && (
        <Badge variant="outline" className="text-xs tabular-nums px-1.5 py-0 shrink-0">
          #{coupleNumber}
        </Badge>
      )}
      <span className="truncate">
        {leaderName ?? "TBD"} & {followerName ?? "TBD"}
      </span>
      {organization && (
        <span className="text-xs text-muted-foreground shrink-0 ml-auto">
          {organization}
        </span>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────

function ResultsSkeleton() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-6 rounded" />
        <div className="space-y-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}
