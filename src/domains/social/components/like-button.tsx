"use client";

import { Heart } from "lucide-react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface LikeButtonProps {
  postId: number;
  userId: string | null;
}

export function LikeButton({ postId, userId }: LikeButtonProps) {
  const utils = trpc.useUtils();
  const { data } = trpc.like.postStatus.useQuery({ postId, userId });

  const toggleMutation = trpc.like.togglePost.useMutation({
    onSuccess: () => {
      utils.like.postStatus.invalidate({ postId, userId });
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1"
      onClick={() => toggleMutation.mutate({ postId })}
      disabled={!userId || toggleMutation.isPending}
    >
      <Heart
        className={`h-4 w-4 ${data?.liked ? "fill-wine text-wine" : ""}`}
      />
      <span className="text-xs">{data?.count ?? 0}</span>
    </Button>
  );
}
