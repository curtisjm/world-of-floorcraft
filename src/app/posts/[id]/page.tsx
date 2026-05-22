"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useQuery } from "convex/react";
import { Badge } from "@shared/ui/badge";
import { ArticleRenderer } from "@/domains/social/components/article-renderer";
import { CommentThread } from "@/domains/social/components/comment-thread";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const postId = id as Id<"posts">;
  const post = useQuery(api.social.posts.get, { postId });

  if (post === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (post === null) notFound();

  const isOrgPost = !!post.orgId && !post.authorId;
  const authorName = isOrgPost
    ? post.orgName ?? "Organization"
    : post.authorDisplayName ?? post.authorUsername ?? "Anonymous";
  const authorLink = isOrgPost
    ? `/orgs/${post.orgSlug}`
    : `/users/${post.authorUsername}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <Link
          href={authorLink}
          className="text-sm font-medium hover:underline"
        >
          {authorName}
        </Link>
        {post.publishedAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(post.publishedAt).toLocaleDateString()}
          </span>
        )}
        <Badge variant="secondary" className="text-xs">
          {post.type === "article" ? "Article" : "Routine Share"}
        </Badge>
      </div>

      {post.title && (
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">
          {post.title}
        </h1>
      )}

      {post.body && <ArticleRenderer html={post.body} />}

      <div className="mt-8">
        <CommentThread postId={post.id} />
      </div>
    </div>
  );
}
