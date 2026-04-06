"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Badge } from "@shared/ui/badge";
import { toast } from "sonner";
import { BarChart3, Trophy, Medal, Award } from "lucide-react";

export default function StatsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: stats, isLoading } = trpc.stats.getCompetitionStats.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const [bufferPct, setBufferPct] = useState(10);
  const { data: awards } = trpc.awards.calculate.useQuery(
    { competitionId: comp?.id ?? 0, bufferPercentage: bufferPct },
    { enabled: !!comp },
  );

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Stats & Awards</h2>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Registrations</p>
            <p className="text-2xl font-bold">{stats?.totalRegistrations ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Entries</p>
            <p className="text-2xl font-bold">{stats?.totalEntries ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Events</p>
            <p className="text-2xl font-bold">{stats?.totalEvents ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Collected</p>
            <p className="text-2xl font-bold">${stats?.totalCollected ?? "0.00"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Owed</p>
            <p className="text-2xl font-bold">${stats?.totalOwed ?? "0.00"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Entries per Event */}
      {(stats?.entriesPerEvent?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entries per Event</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats!.entriesPerEvent.map((e: any) => (
                <div key={e.eventId} className="flex items-center justify-between text-sm">
                  <span>{e.eventName}</span>
                  <Badge variant="secondary" className="text-xs">{e.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Registrations by Org */}
      {(stats?.registrationsByOrg?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrations by Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats!.registrationsByOrg.map((o: any) => (
                <div key={o.orgName ?? "unaffiliated"} className="flex items-center justify-between text-sm">
                  <span>{o.orgName ?? "Unaffiliated"}</span>
                  <Badge variant="secondary" className="text-xs">{o.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Awards Calculator */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Medal className="size-5" />
              Awards Calculator
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Buffer %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={bufferPct}
                onChange={(e) => setBufferPct(Number(e.target.value))}
                className="w-20 h-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {awards?.totals ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/10">
                  <p className="text-sm text-muted-foreground">Medals (1st-3rd)</p>
                  <p className="text-xl font-bold">{awards.totals.medalsWithBuffer}</p>
                  <p className="text-xs text-muted-foreground">Base: {awards.totals.medals}</p>
                </div>
                <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/10">
                  <p className="text-sm text-muted-foreground">Ribbons (4th+)</p>
                  <p className="text-xl font-bold">{awards.totals.ribbonsWithBuffer}</p>
                  <p className="text-xs text-muted-foreground">Base: {awards.totals.ribbons}</p>
                </div>
              </div>

              {awards.perEvent?.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Per Event</h4>
                  {awards.perEvent.map((e: any) => (
                    <div key={e.eventId} className="flex items-center justify-between text-xs p-1.5 rounded border">
                      <span>{e.eventName}</span>
                      <div className="flex gap-2">
                        <span>Medals: {e.medals}</span>
                        <span>Ribbons: {e.ribbons}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
