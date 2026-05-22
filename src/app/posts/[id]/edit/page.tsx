"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "convex/react";
import { ArticleEditor } from "@/domains/social/components/article-editor";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const postId = id as Id<"posts">;
  const post = useQuery(api.social.posts.get, { postId });

  if (post === undefined) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (post === null) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-bold mb-4 sm:text-2xl sm:mb-6">Edit Article</h1>
      <ArticleEditor
        existingPost={{
          id: post.id,
          title: post.title,
          body: post.body,
          visibility: post.visibility,
          visibilityOrgId: post.visibilityOrgId,
          publishedAt: post.publishedAt,
        }}
      />
    </div>
  );
}
