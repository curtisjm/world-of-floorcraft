"use client";

import { useQuery } from "convex/react";
import { OrgPostComposer } from "./org-post-composer";
import { OrgDraftList } from "./org-draft-list";
import { OrgPostCard } from "./org-post-card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface OrgPostListProps {
  orgId: Id<"organizations">;
  isAdmin: boolean;
}

/**
 * Posts tab for the org profile page. Composer + drafts are gated on
 * admin/owner role; the listing is public-only (org-only posts surface
 * elsewhere via the following feed).
 */
export function OrgPostList({ orgId, isAdmin }: OrgPostListProps) {
  const page = useQuery(api.social.posts.listByOrg, { orgId, limit: 20 });

  if (page === undefined) {
    return <p className="text-muted-foreground text-sm">Loading posts...</p>;
  }

  const posts = page.items;

  return (
    <div className="flex flex-col gap-3">
      {isAdmin && <OrgPostComposer orgId={orgId} />}
      {isAdmin && <OrgDraftList orgId={orgId} />}
      {posts.length === 0 && !isAdmin && (
        <p className="text-muted-foreground text-sm">No posts yet.</p>
      )}
      {posts.map((post) => (
        <OrgPostCard
          key={post.id}
          post={{
            id: post.id,
            type: post.type,
            title: post.title,
            body: post.body,
            publishedAt: post.publishedAt,
            orgName: post.orgName,
            orgSlug: post.orgSlug,
            orgAvatarUrl: post.orgAvatarUrl,
          }}
        />
      ))}
    </div>
  );
}
