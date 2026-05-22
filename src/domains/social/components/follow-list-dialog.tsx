"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@shared/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@shared/ui/avatar";
import { ScrollArea } from "@shared/ui/scroll-area";
import { FollowButton } from "./follow-button";
import { api } from "../../../../convex/_generated/api";

type Tab = "followers" | "following";

interface FollowListDialogProps {
  username: string;
  initialTab: Tab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowListDialog({
  username,
  initialTab,
  open,
  onOpenChange,
}: FollowListDialogProps) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // Reset tab when dialog opens with a different initialTab
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) setTab(initialTab);
    onOpenChange(isOpen);
  };

  const followers = useQuery(
    api.social.profiles.followers,
    open && tab === "followers" ? { username } : "skip",
  );
  const following = useQuery(
    api.social.profiles.following,
    open && tab === "following" ? { username } : "skip",
  );

  const users = tab === "followers" ? followers : following;
  const isLoading = users === undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-0">
          <div className="grid grid-cols-2 border-b">
            <button
              onClick={() => setTab("followers")}
              className={`py-3 text-sm font-semibold text-center transition-colors relative ${
                tab === "followers"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Followers
              {tab === "followers" && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
              )}
            </button>
            <button
              onClick={() => setTab("following")}
              className={`py-3 text-sm font-semibold text-center transition-colors relative ${
                tab === "following"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Following
              {tab === "following" && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
              )}
            </button>
          </div>
          <DialogTitle className="sr-only">
            {tab === "followers" ? "Followers" : "Following"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : !users || users.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {tab === "followers" ? "No followers yet" : "Not following anyone yet"}
            </div>
          ) : (
            <div className="flex flex-col">
              {users.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <Link
                    href={`/users/${user.username}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <Avatar size="lg">
                      {user.avatarUrl && (
                        <AvatarImage src={user.avatarUrl} alt={user.displayName ?? user.username ?? ""} />
                      )}
                      <AvatarFallback>
                        {(user.displayName?.[0] ?? user.username?.[0] ?? "?").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold truncate">
                        {user.username}
                      </span>
                      {user.displayName && (
                        <span className="text-sm text-muted-foreground truncate">
                          {user.displayName}
                        </span>
                      )}
                    </div>
                  </Link>
                  <FollowButton targetUserId={user._id} />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
