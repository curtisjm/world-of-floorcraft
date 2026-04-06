"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shared/ui/table";
import {
  ArrowLeft,
  Calendar,
  Users,
  Trophy,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function OrgCompetitionPage() {
  const { slug: orgSlug, compSlug } = useParams<{
    slug: string;
    compSlug: string;
  }>();

  const { data: org } = trpc.org.getBySlug.useQuery({ slug: orgSlug });
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug: compSlug });

  const enabled = !!org && !!comp;

  const { data: schedule, isLoading: schedLoading } =
    trpc.orgCompetition.getOrgSchedule.useQuery(
      { competitionId: comp?.id ?? 0, orgId: org?.id ?? 0 },
      { enabled },
    );

  const { data: entries, isLoading: entriesLoading } =
    trpc.orgCompetition.getOrgEntries.useQuery(
      { competitionId: comp?.id ?? 0, orgId: org?.id ?? 0 },
      { enabled },
    );

  const { data: results, isLoading: resultsLoading } =
    trpc.orgCompetition.getOrgResults.useQuery(
      { competitionId: comp?.id ?? 0, orgId: org?.id ?? 0 },
      { enabled },
    );

  if (!org || !comp) {
    return <OrgCompSkeleton />;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <Link
        href={`/orgs/${orgSlug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        {org.name}
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{comp.name}</h1>
        <p className="text-sm text-muted-foreground">
          {org.name}&apos;s entries and results
        </p>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule">
          {schedLoading ? (
            <Skeleton className="h-64 rounded-lg mt-4" />
          ) : schedule && schedule.events.length > 0 ? (
            <div className="mt-4 space-y-3">
              {schedule.events.map((event) => (
                <Card key={event.eventId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {event.eventName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {event.couples.map((couple) => (
                        <div
                          key={couple.entryId}
                          className="flex items-center gap-3 text-sm"
                        >
                          {couple.coupleNumber != null && (
                            <Badge
                              variant="outline"
                              className="text-xs tabular-nums px-1.5 py-0"
                            >
                              #{couple.coupleNumber}
                            </Badge>
                          )}
                          <span>
                            {couple.leaderName ?? "TBD"} &{" "}
                            {couple.followerName ?? "TBD"}
                          </span>
                        </div>
                      ))}
                      {event.couples.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No entries from {org.name}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Calendar className="size-10" />} message="No schedule data available." />
          )}
        </TabsContent>

        <TabsContent value="entries">
          {entriesLoading ? (
            <Skeleton className="h-64 rounded-lg mt-4" />
          ) : entries && entries.length > 0 ? (
            <Card className="mt-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-center">Events</TableHead>
                      <TableHead className="text-center">Checked In</TableHead>
                      <TableHead className="text-right">Owed</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.registrationId}>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {entry.competitorNumber ?? "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {entry.displayName ?? "Unknown"}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {entry.eventCount}
                        </TableCell>
                        <TableCell className="text-center">
                          {entry.checkedIn ? (
                            <CheckCircle2 className="size-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="size-4 text-muted-foreground/40 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${entry.amountOwed.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${entry.totalPaid.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          ) : (
            <EmptyState icon={<Users className="size-10" />} message="No entries from your organization." />
          )}
        </TabsContent>

        <TabsContent value="results">
          {resultsLoading ? (
            <Skeleton className="h-64 rounded-lg mt-4" />
          ) : results && results.length > 0 ? (
            <div className="mt-4 space-y-4">
              {results.map((event) => (
                <Card key={event.eventId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      <Link
                        href={`/competitions/${compSlug}/results/${event.eventId}`}
                        className="hover:underline"
                      >
                        {event.eventName}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {event.results.map((r) => (
                        <div
                          key={`${r.placement}-${r.coupleNumber}`}
                          className="flex items-center gap-3 text-sm"
                        >
                          <PlacementBadge placement={r.placement} />
                          {r.coupleNumber != null && (
                            <span className="text-muted-foreground tabular-nums">
                              #{r.coupleNumber}
                            </span>
                          )}
                          <span>
                            {r.leaderName ?? "TBD"} &{" "}
                            {r.followerName ?? "TBD"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Trophy className="size-10" />} message="No results published yet." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────

function PlacementBadge({ placement }: { placement: number }) {
  const color =
    placement === 1
      ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
      : placement === 2
        ? "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30"
        : placement === 3
          ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30"
          : "text-muted-foreground bg-muted";

  return (
    <span
      className={`inline-flex items-center justify-center size-6 rounded-full text-xs font-bold tabular-nums shrink-0 ${color}`}
    >
      {placement}
    </span>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <Card className="mt-4">
      <CardContent className="py-12 text-center text-muted-foreground">
        <div className="mx-auto mb-3 opacity-30">{icon}</div>
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}

function OrgCompSkeleton() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
