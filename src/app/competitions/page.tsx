"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { CompetitionCard } from "@competitions/components/competition-card";
import { Plus, Calendar, MapPin, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@shared/ui/card";

const statusFilters = [
  { label: "All", value: undefined },
  { label: "Upcoming", value: "accepting_entries" as const },
  { label: "Running", value: "running" as const },
  { label: "Finished", value: "finished" as const },
  { label: "Past", value: "past" as const },
] as const;

type StatusFilter = (typeof statusFilters)[number]["value"];

const STYLES = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);
const PAGE_SIZE = 20;

export default function CompetitionsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(undefined);

  // Past filters
  const [year, setYear] = useState<number | undefined>(undefined);
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  const isPast = statusFilter === "past";

  const activeStatus = statusFilter === "past" ? undefined : statusFilter;

  const listResult = useQuery(
    api.competitions.core.list,
    isPast
      ? "skip"
      : { status: activeStatus, paginationOpts: { numItems: 20, cursor: null } },
  );
  const data = listResult ? { items: listResult.page } : undefined;
  const isLoading = !isPast && listResult === undefined;

  const pastResult = useQuery(
    api.competitions.calendar.getPast,
    isPast
      ? {
          year,
          style: style as (typeof STYLES)[number] | undefined,
          limit: PAGE_SIZE,
          offset,
        }
      : "skip",
  );
  const pastData = pastResult;
  const pastLoading = isPast && pastResult === undefined;

  return (
    <div className="atelier-shell">
      <div className="atelier-section flex max-w-4xl flex-col gap-7">
        <div className="max-w-2xl">
          <p className="atelier-eyebrow mb-4">competition desk</p>
          <h1 className="atelier-page-title">Competitions</h1>
          <p className="mt-3 text-muted-foreground">
            Browse upcoming events, live rounds, and historical results.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-sm border bg-muted p-1">
            {statusFilters.map((filter) => (
              <Button
                key={filter.label}
                type="button"
                variant={statusFilter === filter.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(filter.value)}
                className="min-h-11 min-w-11 sm:h-8 sm:min-h-8"
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <Button asChild>
            <Link href="/competitions/create">
              <Plus data-icon="inline-start" />
              Create competition
            </Link>
          </Button>
        </div>

        {isPast ? (
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
        ) : (
          <ActiveTab
            data={data}
            isLoading={isLoading}
            statusFilter={statusFilter}
          />
        )}
      </div>
    </div>
  );
}

// ── Active Tab ────────────────────────────────────────────────

function ActiveTab({
  data,
  isLoading,
  statusFilter,
}: {
  data:
    | { items: Array<{ _id: string; slug: string; name: string; status: string; description?: string | null; venueName?: string | null; city?: string | null; state?: string | null; orgName: string | null }> }
    | undefined;
  isLoading: boolean;
  statusFilter: StatusFilter;
}) {
  return (
    <>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="gap-3 p-4">
              <div className="flex items-start justify-between">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="atelier-empty-state atelier-empty-state-centered px-6 py-12">
          <span className="atelier-empty-glyph" aria-hidden="true" />
          <p className="text-muted-foreground">
            {statusFilter
              ? "No competitions match this filter."
              : "Create the first competition when the syllabus is ready for the floor."}
          </p>
          {!statusFilter && (
            <Link href="/competitions/create">
              <Button variant="outline">Create competition</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
            {data.items.map((comp) => (
              <CompetitionCard
                key={comp._id}
                competition={comp}
                orgName={comp.orgName ?? undefined}
              />
            ))}
          </div>
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
  data: { competitions: Array<{ id: Id<"competitions">; name: string; slug: string; organizationName: string | null; city: string | null | undefined; state: string | null | undefined; startDate: string | null | undefined; styles: string[] }>; total: number } | undefined;
  isLoading: boolean;
}) {
  const competitions = data?.competitions ?? [];
  const total = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Select
          value={year?.toString() ?? "all"}
          onValueChange={(v) => setYear(v === "all" ? undefined : parseInt(v, 10))}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All years</SelectItem>
              {YEARS.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectGroup>
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
            <SelectGroup>
              <SelectItem value="all">All styles</SelectItem>
              {STYLES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {total > 0 && (
          <span className="text-sm text-muted-foreground self-center ml-auto">
            {total} {total === 1 ? "result" : "results"}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!isLoading && competitions.length === 0 && (
        <div className="atelier-empty-state atelier-empty-state-centered px-6 py-12">
          <span className="atelier-empty-glyph" aria-hidden="true" />
          <p className="text-muted-foreground">No past competitions found.</p>
        </div>
      )}

      {competitions.length > 0 && (
        <div className="flex flex-col gap-2">
          {competitions.map((comp) => (
            <Link
              key={comp.id}
              href={`/competitions/${comp.slug}/results`}
              className="block"
            >
              <Card className="atelier-link-card group">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
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
