"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { PartnerEntriesSheet } from "@competitions/components/partner-entries-sheet";

export default function EntriesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: eventEntries, isLoading } = trpc.entry.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );
  const [sheetRegistrationId, setSheetRegistrationId] = useState<number | null>(null);

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{comp.name}</h1>
        <p className="text-muted-foreground">Entries</p>
      </div>

      {!eventEntries?.length ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No entries yet.
          </CardContent>
        </Card>
      ) : (
        eventEntries.map((event) => (
          <Card key={event.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{event.name}</CardTitle>
                <Badge variant="secondary" className="text-xs capitalize">
                  {event.style}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  {event.level}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {event.entries?.length ?? 0} entries
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!event.entries?.length ? (
                <p className="text-sm text-muted-foreground">No entries</p>
              ) : (
                <div className="space-y-1">
                  {event.entries.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-accent/30"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-6 text-right">{i + 1}.</span>
                        <span>
                          <NameButton
                            name={entry.leaderName}
                            registrationId={entry.leaderRegistrationId}
                            onClick={setSheetRegistrationId}
                          />
                          {" & "}
                          <NameButton
                            name={entry.followerName}
                            registrationId={entry.followerRegistrationId}
                            onClick={setSheetRegistrationId}
                          />
                        </span>
                      </div>
                      {entry.leaderNumber != null && (
                        <span className="text-xs text-muted-foreground">#{entry.leaderNumber}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {sheetRegistrationId && comp && (
        <PartnerEntriesSheet
          competitionId={comp.id}
          registrationId={sheetRegistrationId}
          slug={slug}
          open={!!sheetRegistrationId}
          onOpenChange={(open) => !open && setSheetRegistrationId(null)}
        />
      )}
    </div>
  );
}

function NameButton({
  name,
  registrationId,
  onClick,
}: {
  name: string | null;
  registrationId: number;
  onClick: (id: number) => void;
}) {
  if (!name) return <span>TBA</span>;
  return (
    <button
      type="button"
      className="hover:underline text-left"
      onClick={() => onClick(registrationId)}
    >
      {name}
    </button>
  );
}
