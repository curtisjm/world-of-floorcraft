"use client";

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
import { Progress } from "@shared/ui/progress";
import {
  BarChart3,
  DollarSign,
  Users,
  Calendar,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

export default function AnalyticsDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-5" />
        <h1 className="text-xl font-bold">Analytics</h1>
      </div>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          {comp ? (
            <EntryAnalytics competitionId={comp.id} />
          ) : (
            <AnalyticsSkeleton />
          )}
        </TabsContent>

        <TabsContent value="financials">
          {comp ? (
            <FinancialAnalytics competitionId={comp.id} />
          ) : (
            <AnalyticsSkeleton />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Entry Analytics ───────────────────────────────────────────

function EntryAnalytics({ competitionId }: { competitionId: number }) {
  const { data: stats, isLoading } =
    trpc.stats.getCompetitionStats.useQuery({ competitionId });

  if (isLoading) return <AnalyticsSkeleton />;
  if (!stats) return null;

  const maxEntries = Math.max(
    ...stats.entriesPerEvent.map((e) => e.entryCount),
    1,
  );

  return (
    <div className="mt-4 space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Registrations"
          value={stats.totalRegistrations}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Total Entries"
          value={stats.totalEntries}
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Total Events"
          value={stats.totalEvents}
          icon={<Calendar className="size-4" />}
        />
      </div>

      {/* Entries per event chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries by Event</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.entriesPerEvent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.entriesPerEvent
                .sort((a, b) => b.entryCount - a.entryCount)
                .map((event) => {
                  const pct = (event.entryCount / maxEntries) * 100;
                  return (
                    <div key={event.eventId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate mr-2">{event.eventName}</span>
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          {event.entryCount}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registrations by org */}
      {stats.registrationsByOrg.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrations by Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.registrationsByOrg
                .sort((a, b) => b.count - a.count)
                .map((org) => (
                  <div
                    key={org.orgId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate mr-2">
                      {org.orgId || "Unaffiliated"}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {org.count}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Financial Analytics ───────────────────────────────────────

function FinancialAnalytics({
  competitionId,
}: {
  competitionId: number;
}) {
  const { data: summary, isLoading: summaryLoading } =
    trpc.paymentAnalytics.getSummary.useQuery({ competitionId });

  const { data: outstanding } =
    trpc.paymentAnalytics.getOutstanding.useQuery({ competitionId });

  const { data: paymentLog } =
    trpc.paymentAnalytics.getPaymentLog.useQuery({ competitionId });

  if (summaryLoading) return <AnalyticsSkeleton />;
  if (!summary) return null;

  const collectionRate =
    summary.totalRevenue + summary.outstandingBalance > 0
      ? (summary.totalRevenue /
          (summary.totalRevenue + summary.outstandingBalance)) *
        100
      : 0;

  return (
    <div className="mt-4 space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={`$${summary.totalRevenue.toFixed(2)}`}
          icon={<DollarSign className="size-4" />}
        />
        <StatCard
          label="Outstanding"
          value={`$${summary.outstandingBalance.toFixed(2)}`}
          icon={<AlertCircle className="size-4" />}
        />
        <StatCard
          label="Paid / Registered"
          value={`${summary.paidCount} / ${summary.registrationCount}`}
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Avg per Competitor"
          value={`$${summary.averageRevenuePerCompetitor.toFixed(2)}`}
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      {/* Collection rate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Collection Rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={collectionRate} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {collectionRate.toFixed(0)}% collected
          </p>
        </CardContent>
      </Card>

      {/* Payment method breakdown */}
      {Object.keys(summary.methodBreakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(summary.methodBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([method, amount]) => (
                  <div
                    key={method}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize">{method}</span>
                    <span className="tabular-nums font-medium">
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding balances */}
      {outstanding && outstanding.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Outstanding Balances</CardTitle>
              <Badge variant="destructive" className="text-xs">
                {outstanding.length} unpaid
              </Badge>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Competitor</TableHead>
                  <TableHead className="text-right">Owed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstanding.map((row) => (
                  <TableRow key={row.registrationId}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      #{row.competitorNumber}
                    </TableCell>
                    <TableCell>
                      {row.displayName ?? row.username ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.amountOwed.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${row.amountPaid.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-destructive">
                      ${row.balance.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Recent payment log */}
      {paymentLog && paymentLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Log</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentLog.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      #{p.competitorNumber}
                    </TableCell>
                    <TableCell>{p.competitorName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {p.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      ${p.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
