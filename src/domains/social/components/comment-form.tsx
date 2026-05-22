"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface CommentFormProps {
  postId: Id<"posts">;
  parentId?: Id<"comments"> | null;
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
  const [pending, setPending] = useState(false);
  const createComment = useMutation(api.social.comments.create);

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setPending(true);
    try {
      await createComment({ postId, parentId: parentId ?? null, body: trimmed });
      setBody("");
      onSuccess?.();
    } finally {
      setPending(false);
    }
  };

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
        onClick={() => void handleSubmit().catch(() => setPending(false))}
        disabled={!body.trim() || pending}
      >
        {parentId ? "Reply" : "Comment"}
      </Button>
    </div>
  );
}
