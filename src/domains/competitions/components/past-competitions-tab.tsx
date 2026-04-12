"use client";

import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Calendar } from "lucide-react";

export function PastCompetitionsTab({ userId }: { userId: string }) {
  const { data: history, isLoading } =
    trpc.results.getCompetitorHistory.useQuery({ userId });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!history || history.competitions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No competition results yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {history.competitions.map((comp) => (
        <Card key={comp.competitionId}>
          <CardContent className="py-4 px-5 space-y-3">
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

            <div className="space-y-1.5">
              {comp.events.map((event) => (
                <div
                  key={event.eventId}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`/competitions/${comp.competitionSlug}/results/${event.eventId}`}
                      className="truncate hover:underline"
                    >
                      {event.eventName}
                    </Link>
                    {event.partnerName && (
                      <span className="text-muted-foreground text-xs shrink-0">
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
      ))}
    </div>
  );
}

function PlacementBadge({ placement }: { placement: number }) {
  const variant =
    placement === 1
      ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
      : placement === 2
        ? "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30"
        : placement === 3
          ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30"
          : "text-muted-foreground bg-muted";

  return (
    <span
      className={`inline-flex items-center justify-center size-7 rounded-full text-xs font-bold tabular-nums shrink-0 ${variant}`}
    >
      {placement}
    </span>
  );
}
