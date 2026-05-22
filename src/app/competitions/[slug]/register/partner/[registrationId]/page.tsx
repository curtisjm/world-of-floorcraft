"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Skeleton } from "@shared/ui/skeleton";
import { ArrowLeft, ExternalLink } from "lucide-react";

export default function PartnerEntriesPage() {
  const { slug, registrationId: regIdParam } = useParams<{
    slug: string;
    registrationId: string;
  }>();
  const registrationId = regIdParam as Id<"competitionRegistrations">;

  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const data = useQuery(
    api.competitions.registration.getPartnerEntries,
    comp ? { competitionId: comp._id, registrationId } : "skip",
  );
  const isLoading = data === undefined;

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <p className="text-muted-foreground">Registration not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/competitions/${slug}/register`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4 mr-1" />
            Back to Registration
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{comp.name}</h1>
        <p className="text-muted-foreground">Partner Entries</p>
      </div>

      {/* Partner profile */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-12">
              <AvatarImage src={data.user?.avatarUrl ?? undefined} />
              <AvatarFallback>
                {(data.user?.displayName ?? data.user?.username ?? "?")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-medium truncate">
                {data.user?.displayName ?? data.user?.username}
              </div>
              {data.user?.username && (
                <div className="text-sm text-muted-foreground">
                  @{data.user.username}
                </div>
              )}
            </div>
            {data.user?.username && (
              <Link href={`/users/${data.user.username}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="size-4 mr-1" />
                  View Profile
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Entries ({data.entries.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No entries yet.
            </p>
          ) : (
            <div className="space-y-2">
              {data.entries.map((entry) => {
                const isLeader = entry.leaderRegistrationId === registrationId;
                const role = isLeader ? "Leader" : "Follower";
                const partnerName = isLeader
                  ? entry.followerDisplayName
                  : entry.leaderDisplayName;

                return (
                  <div
                    key={entry._id}
                    className="flex items-center justify-between p-3 rounded-md border"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {entry.eventName}
                        </span>
                        {entry.scratched && (
                          <Badge variant="destructive" className="text-xs">
                            Scratched
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {role}
                        </Badge>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {entry.eventStyle}
                        </Badge>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {entry.eventLevel}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        w/ {partnerName}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
