"use client";

import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface FollowButtonProps {
  targetUserId: Id<"users">;
}

/**
 * Follow / unfollow control. Resolves the viewer through `users.me` and hides
 * itself on the viewer's own profile, so callers only pass the target id.
 * Follow state updates reactively — no manual cache invalidation.
 */
export function FollowButton({ targetUserId }: FollowButtonProps) {
  const me = useQuery(api.users.me, {});
  const isOwnProfile = me?._id === targetUserId;

  const followStatus = useQuery(
    api.social.follows.status,
    isOwnProfile ? "skip" : { targetUserId },
  );
  const follow = useMutation(api.social.follows.follow);
  const unfollow = useMutation(api.social.follows.unfollow);

  if (isOwnProfile || followStatus === undefined) return null;

  const status = followStatus.status;

  if (status === "active" || status === "pending") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void unfollow({ targetUserId }).catch(() => {})}
      >
        {status === "active" ? "Following" : "Requested"}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => void follow({ targetUserId }).catch(() => {})}
    >
      Follow
    </Button>
  );
}
