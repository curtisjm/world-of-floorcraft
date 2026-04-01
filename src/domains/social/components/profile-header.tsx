"use client";

import { useState } from "react";
import { Badge } from "@shared/ui/badge";
import { FollowButton } from "./follow-button";
import { FollowListDialog } from "./follow-list-dialog";

const LEVEL_LABELS: Record<string, string> = {
  newcomer: "Newcomer", bronze: "Bronze", silver: "Silver", gold: "Gold",
  novice: "Novice", prechamp: "Pre-Champ", champ: "Champ", professional: "Professional",
};

interface ProfileHeaderProps {
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    competitionLevel: string | null;
    competitionLevelHigh: string | null;
    isPrivate: boolean;
    followerCount: number;
    followingCount: number;
  };
  isOwnProfile: boolean;
}

export function ProfileHeader({ user, isOwnProfile }: ProfileHeaderProps) {
  const [followListOpen, setFollowListOpen] = useState(false);
  const [followListTab, setFollowListTab] = useState<"followers" | "following">("followers");

  const levelDisplay = user.competitionLevel
    ? user.competitionLevelHigh
      ? `${LEVEL_LABELS[user.competitionLevel]}/${LEVEL_LABELS[user.competitionLevelHigh]}`
      : LEVEL_LABELS[user.competitionLevel]
    : null;

  const openFollowList = (tab: "followers" | "following") => {
    setFollowListTab(tab);
    setFollowListOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-6">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground shrink-0">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName ?? user.username ?? ""} className="w-20 h-20 rounded-full object-cover" />
          ) : (
            (user.displayName?.[0] ?? user.username?.[0] ?? "?").toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold truncate">{user.displayName ?? user.username ?? "Anonymous"}</h1>
            <FollowButton targetUserId={user.id} isOwnProfile={isOwnProfile} />
          </div>
          {user.username && <p className="text-muted-foreground">@{user.username}</p>}
          <div className="flex items-center gap-4 mt-2 text-sm">
            <button
              onClick={() => openFollowList("followers")}
              className="hover:underline cursor-pointer"
            >
              <span className="font-semibold">{user.followerCount}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </button>
            <button
              onClick={() => openFollowList("following")}
              className="hover:underline cursor-pointer"
            >
              <span className="font-semibold">{user.followingCount}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {user.bio && <p className="text-sm">{user.bio}</p>}
        {levelDisplay && <Badge variant="secondary" className="w-fit">{levelDisplay}</Badge>}
      </div>

      {user.username && (
        <FollowListDialog
          username={user.username}
          initialTab={followListTab}
          open={followListOpen}
          onOpenChange={setFollowListOpen}
        />
      )}
    </div>
  );
}
