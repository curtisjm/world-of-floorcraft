"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { CompetitionCard } from "@competitions/components/competition-card";
import { cn } from "@shared/lib/utils";
import { Plus, Calendar, MapPin, ChevronRight, Trophy } from "lucide-react";
import { Card, CardContent } from "@shared/ui/card";

const statusFilters = [
  { label: "All", value: undefined },
  { label: "Upcoming", value: "accepting_entries" as const },
  { label: "Running", value: "running" as const },
  { label: "Finished", value: "finished" as const },
] as const;

type StatusFilter = (typeof statusFilters)[number]["value"];

const STYLES = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);
const PAGE_SIZE = 20;

type Tab = "active" | "past";

export default function CompetitionsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(undefined);

  // Past tab filters
  const [year, setYear] = useState<number | undefined>(undefined);
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = trpc.competition.list.useQuery(
    { status: statusFilter, limit: 20 },
    { enabled: tab === "active" },
  );

  const { data: pastData, isLoading: pastLoading } =
    trpc.calendar.getPast.useQuery(
      {
        year,
        style: style as (typeof STYLES)[number] | undefined,
        limit: PAGE_SIZE,
        offset,
      },
      { enabled: tab === "past" },
    );

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Competitions</h1>
        <Link href="/competitions/create">
          <Button>
            <Plus className="size-4 mr-2" />
            Create Competition
          </Button>
        </Link>
      </div>

      {/* Active / Past tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setTab("active")}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
            tab === "active"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Active
        </button>
        <button
          onClick={() => setTab("past")}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
            tab === "past"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Past
        </button>
      </div>

      {tab === "active" && (
        <ActiveTab
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          data={data}
          isLoading={isLoading}
        />
      )}

      {tab === "past" && (
        <PastTab
          year={year}
          setYear={(y) => { setYear(y); setOffset(0); }}
          style={style}
          setStyle={(s) => { setStyle(s); setOffset(0); }}
          offset={offset}
          setOffset={setOffset}
          data={pastData}
          isLoading={pastLoading}
        />
      )}
    </div>
  );
}

// ── Active Tab ────────────────────────────────────────────────

function ActiveTab({
  statusFilter,
  setStatusFilter,
  data,
  isLoading,
}: {
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  data: { items: Array<{ id: number; slug: string; name: string; status: string; description?: string | null; venueName?: string | null; city?: string | null; state?: string | null; orgName: string }>; nextCursor?: number | null } | undefined;
  isLoading: boolean;
}) {
  return (
    <>
      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-muted/50 rounded-lg w-fit">
        {statusFilters.map((filter) => (
          <button
            key={filter.label}
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              statusFilter === filter.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            {statusFilter
              ? "No competitions match this filter."
              : "No competitions yet. Create the first one!"}
          </p>
          {!statusFilter && (
            <Link href="/competitions/create">
              <Button variant="outline">Create Competition</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.items.map((comp) => (
              <CompetitionCard
                key={comp.id}
                competition={comp}
                orgName={comp.orgName}
              />
            ))}
          </div>

          {data.nextCursor && (
            <div className="mt-6 text-center">
              <Button variant="outline" size="sm">
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Past Tab ──────────────────────────────────────────────────

function PastTab({
  year,
  setYear,
  style,
  setStyle,
  offset,
  setOffset,
  data,
  isLoading,
}: {
  year: number | undefined;
  setYear: (v: number | undefined) => void;
  style: string | undefined;
  setStyle: (v: string | undefined) => void;
  offset: number;
  setOffset: (v: number) => void;
  data: { competitions: Array<{ id: number; name: string; slug: string; organizationName: string | null; city: string | null; state: string | null; startDate: string | null; styles: string[] }>; total: number } | undefined;
  isLoading: boolean;
}) {
  const competitions = data?.competitions ?? [];
  const total = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Select
          value={year?.toString() ?? "all"}
          onValueChange={(v) => setYear(v === "all" ? undefined : parseInt(v, 10))}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {YEARS.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={style ?? "all"}
          onValueChange={(v) => setStyle(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Style" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All styles</SelectItem>
            {STYLES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {total > 0 && (
          <span className="text-sm text-muted-foreground self-center ml-auto">
            {total} {total === 1 ? "result" : "results"}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && competitions.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="size-10 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <p className="text-muted-foreground">No past competitions found.</p>
        </div>
      )}

      {competitions.length > 0 && (
        <div className="space-y-2">
          {competitions.map((comp) => (
            <Link
              key={comp.id}
              href={`/competitions/${comp.slug}/results`}
              className="block"
            >
              <Card className="hover:bg-accent/30 transition-colors group">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium truncate">{comp.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {comp.organizationName && (
                          <span>{comp.organizationName}</span>
                        )}
                        {comp.startDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="size-3" />
                            {new Date(comp.startDate).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                        {(comp.city || comp.state) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {[comp.city, comp.state].filter(Boolean).join(", ")}
                          </span>
                        )}
                      </div>
                      {comp.styles.length > 0 && (
                        <div className="flex gap-1">
                          {comp.styles.map((s) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-xs capitalize"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-2" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(hasPrev || hasMore) && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={!hasPrev}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={!hasMore}
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}
