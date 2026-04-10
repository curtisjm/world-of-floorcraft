"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";

const DANCE_STYLES = [
  { value: "standard", label: "Standard" },
  { value: "smooth", label: "Smooth" },
  { value: "latin", label: "Latin" },
  { value: "rhythm", label: "Rhythm" },
  { value: "nightclub", label: "Nightclub" },
] as const;

const ROLE_PREFERENCES = [
  { value: "lead", label: "Lead" },
  { value: "follow", label: "Follow" },
  { value: "both", label: "Both" },
] as const;

type DanceStyle = (typeof DANCE_STYLES)[number]["value"];
type RolePreference = (typeof ROLE_PREFERENCES)[number]["value"];

const STYLE_LABELS: Record<string, string> = {
  standard: "Standard",
  smooth: "Smooth",
  latin: "Latin",
  rhythm: "Rhythm",
  nightclub: "Nightclub",
};

const ROLE_LABELS: Record<string, string> = {
  lead: "Lead",
  follow: "Follow",
  both: "Lead or Follow",
};

const LEVEL_LABELS: Record<string, string> = {
  newcomer: "Newcomer", bronze: "Bronze", silver: "Silver", gold: "Gold",
  novice: "Novice", prechamp: "Pre-Champ", champ: "Champ", professional: "Professional",
};

export default function PartnersPage() {
  const [styleFilter, setStyleFilter] = useState<DanceStyle | "">("");
  const [roleFilter, setRoleFilter] = useState<RolePreference | "">("");
  const [locationFilter, setLocationFilter] = useState("");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.partnerSearch.discover.useInfiniteQuery(
      {
        limit: 20,
        style: styleFilter || undefined,
        rolePreference: roleFilter || undefined,
        location: locationFilter || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Find a Partner</h1>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={styleFilter}
          onChange={(e) => setStyleFilter(e.target.value as DanceStyle | "")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All styles</option>
          {DANCE_STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RolePreference | "")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All roles</option>
          {ROLE_PREFERENCES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <Input
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          placeholder="Filter by location..."
          className="h-9 w-48"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No one is currently searching for a partner
          {styleFilter || roleFilter || locationFilter ? " with those filters" : ""}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Link key={item.userId} href={`/users/${item.username}`}>
              <div className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground shrink-0">
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt={item.displayName ?? item.username ?? ""}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      (item.displayName?.[0] ?? item.username?.[0] ?? "?").toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">
                        {item.displayName ?? item.username ?? "Anonymous"}
                      </span>
                      {item.username && (
                        <span className="text-xs text-muted-foreground">@{item.username}</span>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {ROLE_LABELS[item.rolePreference] ?? item.rolePreference}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.danceStyles.map((style) => (
                        <Badge key={style} variant="outline" className="text-xs">
                          {STYLE_LABELS[style] ?? style}
                        </Badge>
                      ))}
                      {item.competitionLevel && (
                        <Badge variant="outline" className="text-xs">
                          {item.competitionLevelHigh
                            ? `${LEVEL_LABELS[item.competitionLevel]}/${LEVEL_LABELS[item.competitionLevelHigh]}`
                            : LEVEL_LABELS[item.competitionLevel]}
                        </Badge>
                      )}
                    </div>

                    {(item.height || item.location) && (
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        {item.height && <span>{item.height}</span>}
                        {item.height && item.location && <span>·</span>}
                        {item.location && <span>{item.location}</span>}
                      </div>
                    )}

                    {item.bio && (
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                        {item.bio}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {hasNextPage && (
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full"
            >
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
