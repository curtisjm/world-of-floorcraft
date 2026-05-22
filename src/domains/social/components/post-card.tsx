"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Card, CardContent, CardHeader } from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { InteractionBar } from "./interaction-bar";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface PostCardProps {
  post: {
    id: Id<"posts">;
    type: "routine_share" | "article";
    title: string | null;
    body: string | null;
    publishedAt: number | null;
    authorUsername: string | null;
    authorDisplayName: string | null;
    authorAvatarUrl: string | null;
  };
}

export function PostCard({ post }: PostCardProps) {
  const me = useQuery(api.users.me, {});
  const authorName = post.authorDisplayName ?? post.authorUsername ?? "Anonymous";
  const isArticle = post.type === "article";

  const preview = post.body
    ? post.body.replace(/<[^>]*>/g, "").slice(0, 200)
    : null;

  return (
    <Card className="atelier-link-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar className="size-9 border">
            {post.authorAvatarUrl && (
              <AvatarImage src={post.authorAvatarUrl} alt={authorName} />
            )}
            <AvatarFallback className="font-mono text-xs font-medium">
              {authorName[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <Link
              href={`/users/${post.authorUsername}`}
              className="text-sm font-medium hover:underline"
            >
              {authorName}
            </Link>
            {post.publishedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(post.publishedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <Badge variant="secondary" className="text-xs">
            {isArticle ? "Article" : "Routine"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <Link href={`/posts/${post.id}`} className="block">
          {post.title && (
            <h3 className="mb-2 font-heading text-xl font-medium hover:underline">
              {post.title}
            </h3>
          )}
          {preview && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {preview}
            </p>
          )}
        </Link>
        <InteractionBar postId={post.id} userId={me?._id ?? null} />
      </CardContent>
    </Card>
  );
}
