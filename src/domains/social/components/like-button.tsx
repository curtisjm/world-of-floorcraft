"use client";

import { Heart } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface LikeButtonProps {
  postId: Id<"posts">;
  userId: Id<"users"> | null;
}

export function LikeButton({ postId, userId }: LikeButtonProps) {
  const status = useQuery(api.social.likes.postStatus, { postId, userId });
  const togglePost = useMutation(api.social.likes.togglePost);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1"
      onClick={() => void togglePost({ postId }).catch(() => {})}
      disabled={!userId}
    >
      <Heart
        className={`h-4 w-4 ${status?.liked ? "fill-wine text-wine" : ""}`}
      />
      <span className="text-xs">{status?.count ?? 0}</span>
    </Button>
  );
}
