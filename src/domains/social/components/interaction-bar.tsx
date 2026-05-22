"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@shared/ui/button";
import { LikeButton } from "./like-button";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import Link from "next/link";
import type { Id } from "../../../../convex/_generated/dataModel";

interface InteractionBarProps {
  postId: Id<"posts">;
  userId: Id<"users"> | null;
  commentCount?: number;
}

export function InteractionBar({ postId, userId, commentCount }: InteractionBarProps) {
  return (
    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
      <LikeButton postId={postId} userId={userId} />

      <Link href={`/posts/${postId}#comments`}>
        <Button variant="ghost" size="sm" className="gap-1">
          <MessageCircle className="h-4 w-4" />
          {commentCount !== undefined && (
            <span className="text-xs">{commentCount}</span>
          )}
        </Button>
      </Link>

      <div className="flex-1" />

      <ShareButton postId={postId} />
      {userId && <SaveButton postId={postId} />}
    </div>
  );
}
