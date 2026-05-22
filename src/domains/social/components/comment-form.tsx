"use client";

import { useState } from "react";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
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
      <Textarea
        className="flex-1 resize-none"
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
