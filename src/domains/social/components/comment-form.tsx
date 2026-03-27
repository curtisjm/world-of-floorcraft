"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface CommentFormProps {
  postId: number;
  parentId?: number | null;
  onSuccess?: () => void;
  placeholder?: string;
}

export function CommentForm({
  postId,
  parentId = null,
  onSuccess,
  placeholder = "Write a comment...",
}: CommentFormProps) {
  const [body, setBody] = useState("");
  const utils = trpc.useUtils();

  const createMutation = trpc.comment.create.useMutation({
    onSuccess: () => {
      setBody("");
      utils.comment.listByPost.invalidate({ postId });
      if (parentId) {
        utils.comment.replies.invalidate({ commentId: parentId });
      }
      onSuccess?.();
    },
  });

  return (
    <div className="flex gap-2">
      <textarea
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
      />
      <Button
        size="sm"
        onClick={() =>
          createMutation.mutate({ postId, parentId, body })
        }
        disabled={!body.trim() || createMutation.isPending}
      >
        {parentId ? "Reply" : "Comment"}
      </Button>
    </div>
  );
}
