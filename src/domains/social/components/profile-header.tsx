"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";
import { FollowButton } from "./follow-button";
import { FollowListDialog } from "./follow-list-dialog";
import { api } from "../../../../convex/_generated/api";

const LEVEL_LABELS: Record<string, string> = {
  newcomer: "Newcomer", bronze: "Bronze", silver: "Silver", gold: "Gold",
  novice: "Novice", prechamp: "Pre-Champ", champ: "Champ", professional: "Professional",
};

interface ProfileHeaderProps {
  username: string;
}

export function ProfileHeader({ username }: ProfileHeaderProps) {
  const profile = useQuery(api.social.profiles.getByUsername, { username });
  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListTab, setFollowListTab] = useState<"followers" | "following">("followers");

  if (profile === undefined) {
    return (
      <div className="flex items-start gap-4 sm:gap-6">
        <Skeleton className="w-16 h-16 sm:w-20 sm:h-20 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    );
  }

  if (profile === null) {
    return (
      <p className="text-sm text-muted-foreground">Profile unavailable.</p>
    );
  }

  const levelDisplay = profile.competitionLevel
    ? profile.competitionLevelHigh
      ? `${LEVEL_LABELS[profile.competitionLevel]}/${LEVEL_LABELS[profile.competitionLevelHigh]}`
      : LEVEL_LABELS[profile.competitionLevel]
    : null;

  const openFollowList = (tab: "followers" | "following") => {
    setFollowListTab(tab);
    setFollowListOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4 sm:gap-6">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted flex items-center justify-center text-xl sm:text-2xl font-bold text-muted-foreground shrink-0">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.displayName ?? profile.username ?? ""} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover" />
          ) : (
            (profile.displayName?.[0] ?? profile.username?.[0] ?? "?").toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{profile.displayName ?? profile.username ?? "Anonymous"}</h1>
            <FollowButton targetUserId={profile._id} />
          </div>
          {profile.username && <p className="text-muted-foreground">@{profile.username}</p>}
          <div className="flex items-center gap-4 mt-2 text-sm">
            <button
              onClick={() => openFollowList("followers")}
              className="hover:underline cursor-pointer"
            >
              <span className="font-semibold">{profile.followerCount}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </button>
            <button
              onClick={() => openFollowList("following")}
              className="hover:underline cursor-pointer"
            >
              <span className="font-semibold">{profile.followingCount}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {profile.bio && <p className="text-sm">{profile.bio}</p>}
        {levelDisplay && <Badge variant="secondary" className="w-fit">{levelDisplay}</Badge>}
      </div>

      {profile.username && (
        <FollowListDialog
          username={profile.username}
          initialTab={followListTab}
          open={followListOpen}
          onOpenChange={setFollowListOpen}
        />
      )}
    </div>
  );
}
