"use client";

import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface FollowButtonProps {
  targetUserId: string;
  isOwnProfile: boolean;
}

export function FollowButton({ targetUserId, isOwnProfile }: FollowButtonProps) {
  const utils = trpc.useUtils();

  const { data: followStatus, isLoading } = trpc.follow.status.useQuery(
    { targetUserId },
    { enabled: !isOwnProfile }
  );

  const followMutation = trpc.follow.follow.useMutation({
    onSuccess: () => utils.follow.status.invalidate({ targetUserId }),
  });

  const unfollowMutation = trpc.follow.unfollow.useMutation({
    onSuccess: () => utils.follow.status.invalidate({ targetUserId }),
  });

  if (isOwnProfile || isLoading) return null;

  const currentStatus = followStatus?.status;

  if (currentStatus === "active") {
    return (
      <Button variant="outline" size="sm" onClick={() => unfollowMutation.mutate({ targetUserId })} disabled={unfollowMutation.isPending}>
        Following
      </Button>
    );
  }

  if (currentStatus === "pending") {
    return (
      <Button variant="outline" size="sm" onClick={() => unfollowMutation.mutate({ targetUserId })} disabled={unfollowMutation.isPending}>
        Requested
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={() => followMutation.mutate({ targetUserId })} disabled={followMutation.isPending}>
      Follow
    </Button>
  );
}
