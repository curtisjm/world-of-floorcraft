"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent } from "@shared/ui/card";
import { Input } from "@shared/ui/input";
import { Search, Users, Trophy } from "lucide-react";

export default function CompetitorSearchPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const { data: results, isLoading } =
    trpc.results.searchCompetitors.useQuery(
      { query: debouncedQuery },
      { enabled: debouncedQuery.length >= 1 },
    );

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="size-6" />
          Competitor Search
        </h1>
        <p className="text-sm text-muted-foreground">
          Find competitors and view their competition history.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {debouncedQuery.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Search className="size-10 mx-auto mb-3 opacity-30" />
            <p>Type a name to search for competitors.</p>
          </CardContent>
        </Card>
      )}

      {isLoading && debouncedQuery.length >= 1 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Searching...
          </CardContent>
        </Card>
      )}

      {results && results.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No competitors found for &ldquo;{debouncedQuery}&rdquo;.
          </CardContent>
        </Card>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((competitor) => (
            <Link
              key={competitor.userId}
              href={`/competitors/${competitor.userId}`}
              className="block"
            >
              <Card className="hover:bg-accent/30 transition-colors group">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-sm font-medium">
                          {(competitor.displayName ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {competitor.displayName ?? competitor.username}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          @{competitor.username}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      <Trophy className="size-3 mr-1" />
                      {competitor.competitionCount}{" "}
                      {competitor.competitionCount === 1 ? "comp" : "comps"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── useDebounce hook ──────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
