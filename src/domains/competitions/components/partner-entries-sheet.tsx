"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@shared/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@shared/ui/sheet";
import { Button } from "@shared/ui/button";
import { ExternalLink } from "lucide-react";

interface PartnerEntriesSheetProps {
  competitionId: Id<"competitions">;
  registrationId: Id<"competitionRegistrations">;
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PartnerEntriesSheet({
  competitionId,
  registrationId,
  slug,
  open,
  onOpenChange,
}: PartnerEntriesSheetProps) {
  const data = useQuery(
    api.competitions.registration.getPartnerEntries,
    open ? { competitionId, registrationId } : "skip",
  );
  const isLoading = data === undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Partner Entries</SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="space-y-4 mt-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {data && (
          <div className="space-y-6 mt-4 overflow-y-auto flex-1">
            {/* Partner info */}
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={data.user?.avatarUrl ?? undefined} />
                <AvatarFallback>
                  {(data.user?.displayName ?? data.user?.username ?? "?")[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {data.user?.displayName ?? data.user?.username}
                </div>
                {data.user?.username && (
                  <Link
                    href={`/users/${data.user.username}`}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    @{data.user.username}
                  </Link>
                )}
              </div>
              <Link href={`/users/${data.user?.username}`}>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="size-4 mr-1" />
                  Profile
                </Button>
              </Link>
            </div>

            {/* Entries list */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Entries ({data.entries.length})
              </h3>
              {data.entries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No entries yet.
                </p>
              ) : (
                data.entries.map((entry) => {
                  const isLeader =
                    entry.leaderRegistrationId === registrationId;
                  const role = isLeader ? "Leader" : "Follower";
                  const partnerName = isLeader
                    ? entry.followerDisplayName
                    : entry.leaderDisplayName;

                  return (
                    <div
                      key={entry._id}
                      className="p-3 rounded-md border space-y-1"
                    >
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
                        <Badge
                          variant="secondary"
                          className="text-xs capitalize"
                        >
                          {entry.eventStyle}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-xs capitalize"
                        >
                          {entry.eventLevel}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        w/ {partnerName}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Expand button */}
            <Link
              href={`/competitions/${slug}/register/partner/${registrationId}`}
            >
              <Button variant="outline" className="w-full">
                <ExternalLink className="size-4 mr-2" />
                View Full Page
              </Button>
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
