"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@shared/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shared/ui/table";
import { ArrowLeft } from "lucide-react";

export default function EventResultsPage() {
  const { slug, eventId: eventIdParam } = useParams<{
    slug: string;
    eventId: string;
  }>();
  const eventId = parseInt(eventIdParam, 10);

  const { data: results, isLoading } = trpc.results.getEventResults.useQuery(
    { eventId },
    { enabled: !isNaN(eventId) },
  );

  if (isLoading) {
    return <EventResultsSkeleton slug={slug} />;
  }

  if (!results) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <BackLink slug={slug} />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Results not available.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Use the last (most important) round — typically the final
  const round = results.rounds[results.rounds.length - 1];
  if (!round) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <BackLink slug={slug} />
        <p className="text-muted-foreground">No published rounds.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <BackLink slug={slug} />

      {/* Event header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{results.eventName}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="capitalize">
            {results.style}
          </Badge>
          <Badge variant="secondary" className="capitalize">
            {results.level}
          </Badge>
          {results.dances.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {results.dances.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Summary / Marks tabs */}
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="marks">Marks</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummaryView
            summary={round.summary}
            dances={results.dances}
          />
        </TabsContent>

        <TabsContent value="marks">
          <MarksView
            tabulation={round.tabulation}
            judges={round.judges}
            dances={results.dances}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Summary View ──────────────────────────────────────────────

type SummaryEntry = {
  placement: number;
  placementValue: string | null;
  tiebreakRule: string | null;
  coupleNumber: number | null;
  leaderName: string | null;
  followerName: string | null;
  organization: string | null;
  perDancePlacements: { danceName: string; placement: number }[];
};

function SummaryView({
  summary,
  dances,
}: {
  summary: readonly SummaryEntry[];
  dances: string[];
}) {
  const isMultiDance = dances.length > 1;

  return (
    <Card className="mt-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">Place</TableHead>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Couple</TableHead>
              <TableHead>Organization</TableHead>
              {isMultiDance &&
                dances.map((d) => (
                  <TableHead key={d} className="text-center w-16">
                    {d.slice(0, 3)}
                  </TableHead>
                ))}
              {isMultiDance && <TableHead className="text-center w-16">Total</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((entry) => {
              const medalBg =
                entry.placement === 1
                  ? "bg-amber-50 dark:bg-amber-950/20"
                  : entry.placement === 2
                    ? "bg-gray-50 dark:bg-gray-900/20"
                    : entry.placement === 3
                      ? "bg-orange-50 dark:bg-orange-950/20"
                      : "";

              return (
                <TableRow key={entry.placement} className={entry.placement <= 3 ? medalBg : ""}>
                  <TableCell className="text-center font-bold tabular-nums">
                    {entry.placement}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {entry.coupleNumber != null ? `#${entry.coupleNumber}` : "—"}
                  </TableCell>
                  <TableCell>
                    <CoupleNames entry={entry} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {entry.organization ?? "—"}
                  </TableCell>
                  {isMultiDance &&
                    dances.map((d) => {
                      const dp = entry.perDancePlacements.find(
                        (pd) => pd.danceName === d,
                      );
                      return (
                        <TableCell
                          key={d}
                          className="text-center tabular-nums text-sm"
                        >
                          {dp?.placement ?? "—"}
                        </TableCell>
                      );
                    })}
                  {isMultiDance && (
                    <TableCell className="text-center tabular-nums font-medium text-sm">
                      {entry.placementValue ?? "—"}
                      {entry.tiebreakRule && (
                        <span className="text-xs text-muted-foreground ml-0.5">
                          ({entry.tiebreakRule})
                        </span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ── Marks View ────────────────────────────────────────────────

function MarksView({
  tabulation,
  judges,
  dances,
}: {
  tabulation: { entryId: number; danceName: string | null; tableData: unknown }[];
  judges: { id: number; initials: string; name: string }[];
  dances: string[];
}) {
  // Group tabulation by dance
  const byDance = new Map<string | null, typeof tabulation>();
  for (const row of tabulation) {
    const key = row.danceName;
    if (!byDance.has(key)) byDance.set(key, []);
    byDance.get(key)!.push(row);
  }

  if (tabulation.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-8 text-center text-muted-foreground">
          Tabulation data not available.
        </CardContent>
      </Card>
    );
  }

  // Determine dances to show
  const dancesToShow =
    dances.length > 0 ? dances : [null as string | null];

  return (
    <div className="mt-4 space-y-6">
      {dancesToShow.map((danceName) => {
        const rows = byDance.get(danceName) ?? byDance.get(null) ?? [];
        if (rows.length === 0) return null;

        return (
          <Card key={danceName ?? "single"}>
            {danceName && (
              <div className="px-4 pt-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {danceName}
                </h3>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    {judges.map((j) => (
                      <TableHead
                        key={j.id}
                        className="text-center w-12"
                        title={j.name}
                      >
                        {j.initials}
                      </TableHead>
                    ))}
                    <TableHead className="text-center w-16">Place</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const data = row.tableData as Record<string, unknown> | null;

                    return (
                      <TableRow key={row.entryId}>
                        <TableCell className="tabular-nums font-medium">
                          {(data as any)?.coupleNumber ?? row.entryId}
                        </TableCell>
                        {judges.map((j) => {
                          const mark = (data as any)?.marks?.[j.id];
                          return (
                            <TableCell
                              key={j.id}
                              className="text-center tabular-nums text-sm"
                            >
                              {mark ?? "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center tabular-nums font-bold">
                          {(data as any)?.placement ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────

function CoupleNames({ entry }: { entry: SummaryEntry }) {
  const leader = entry.leaderName ?? "TBD";
  const follower = entry.followerName ?? "TBD";

  return (
    <span className="text-sm">
      {leader} & {follower}
    </span>
  );
}

function BackLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/competitions/${slug}/results`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-4" />
      All Results
    </Link>
  );
}

function EventResultsSkeleton({ slug }: { slug: string }) {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <BackLink slug={slug} />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
