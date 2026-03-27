"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";
import { CommentForm } from "./comment-form";
import Link from "next/link";

interface CommentThreadProps {
  postId: number;
}

export function CommentThread({ postId }: CommentThreadProps) {
  const { data: comments, isLoading } = trpc.comment.listByPost.useQuery({ postId });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading comments...</p>;
  }

  return (
    <div className="space-y-4" id="comments">
      <h3 className="font-semibold">
        Comments ({comments?.length ?? 0})
      </h3>

      <CommentForm postId={postId} />

      <div className="space-y-4">
        {comments?.map((comment) => (
          <TopLevelComment
            key={comment.id}
            comment={comment}
            postId={postId}
          />
        ))}
      </div>
    </div>
  );
}

function TopLevelComment({
  comment,
  postId,
}: {
  comment: {
    id: number;
    body: string;
    createdAt: Date;
    replyCount: number;
    authorUsername: string | null;
    authorDisplayName: string | null;
    authorAvatarUrl: string | null;
  };
  postId: number;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const authorName = comment.authorDisplayName ?? comment.authorUsername ?? "Anonymous";

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
          {authorName[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/users/${comment.authorUsername}`}
              className="text-sm font-medium hover:underline"
            >
              {authorName}
            </Link>
            <span className="text-xs text-muted-foreground">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm mt-1">{comment.body}</p>

          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              Reply
            </Button>

            {comment.replyCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => setShowReplies(!showReplies)}
              >
                {showReplies ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {showReplyForm && (
        <div className="ml-10">
          <CommentForm
            postId={postId}
            parentId={comment.id}
            placeholder="Write a reply..."
            onSuccess={() => {
              setShowReplyForm(false);
              setShowReplies(true);
            }}
          />
        </div>
      )}

      {showReplies && <RepliesList commentId={comment.id} />}
    </div>
  );
}

function RepliesList({ commentId }: { commentId: number }) {
  const { data: replies, isLoading } = trpc.comment.replies.useQuery({ commentId });

  if (isLoading) {
    return <p className="ml-10 text-xs text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="ml-10 space-y-3">
      {replies?.map((reply) => {
        const name = reply.authorDisplayName ?? reply.authorUsername ?? "Anonymous";
        return (
          <div key={reply.id} className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
              {name[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/users/${reply.authorUsername}`}
                  className="text-xs font-medium hover:underline"
                >
                  {name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {new Date(reply.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm mt-0.5">{reply.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
