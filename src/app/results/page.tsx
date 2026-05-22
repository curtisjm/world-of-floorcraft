"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardContent } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import { Calendar, MapPin, ChevronRight } from "lucide-react";

const STYLES = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);
const PAGE_SIZE = 20;

export default function ResultsBrowsePage() {
  const [year, setYear] = useState<number | undefined>(undefined);
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = trpc.calendar.getPast.useQuery({
    year,
    style: style as (typeof STYLES)[number] | undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const competitions = data?.competitions ?? [];
  const total = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;

  return (
    <div className="atelier-shell">
      <div className="atelier-section flex max-w-4xl flex-col gap-7">
        <div className="max-w-2xl">
          <p className="atelier-eyebrow mb-4">results archive</p>
          <h1 className="atelier-page-title atelier-page-title-wide">Competition Results</h1>
          <p className="mt-3 text-muted-foreground">
            Browse results from past competitions.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={year?.toString() ?? "all"}
            onValueChange={(v) => {
              setYear(v === "all" ? undefined : parseInt(v, 10));
              setOffset(0);
            }}
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
            onValueChange={(v) => {
              setStyle(v === "all" ? undefined : v);
              setOffset(0);
            }}
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
            <span className="self-center text-sm text-muted-foreground sm:ml-auto">
              {total} {total === 1 ? "competition" : "competitions"}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        {!isLoading && competitions.length === 0 && (
          <div className="atelier-empty-state atelier-empty-state-centered px-6 py-12">
            <span className="atelier-empty-glyph" aria-hidden="true" />
            <p className="text-muted-foreground">No results found.</p>
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
                <Card className="atelier-link-card group">
                  <CardContent className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium">{comp.name}</p>
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
                      <ChevronRight className="ml-2 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

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
      </div>
    </div>
  );
}
