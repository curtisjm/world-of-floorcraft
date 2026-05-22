"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { PostCard } from "./post-card";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type FeedCursor = { publishedAt: number; id: Id<"posts"> } | null;

interface FeedPost {
  id: Id<"posts">;
  type: "routine_share" | "article";
  title: string | null;
  body: string | null;
  publishedAt: number | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
}

export function Feed() {
  const [activeTab, setActiveTab] = useState<"following" | "explore">(
    "following",
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as "following" | "explore")}
    >
      <TabsList>
        <TabsTrigger value="following">Following</TabsTrigger>
        <TabsTrigger value="explore">Explore</TabsTrigger>
      </TabsList>

      <TabsContent value="following" className="mt-4">
        <FollowingFeed />
      </TabsContent>

      <TabsContent value="explore" className="mt-4">
        <ExploreFeed />
      </TabsContent>
    </Tabs>
  );
}

function FollowingFeed() {
  const [pages, setPages] = useState<FeedPost[][]>([]);
  const [cursor, setCursor] = useState<FeedCursor>(null);

  const page = useQuery(api.social.posts.followingFeed, {
    limit: 20,
    cursor,
  });

  const allPosts = [...pages.flat(), ...(page?.posts ?? [])];
  const isLoading = page === undefined && pages.length === 0;
  const hasMore = !!page?.nextCursor;

  if (isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (allPosts.length === 0) {
    return (
      <div className="atelier-empty-state">
        <span className="atelier-empty-glyph" aria-hidden="true" />
        <p className="text-sm">
          Follow dancers, studios, or competitors and this becomes your
          floor-side notebook.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {allPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasMore && (
        <Button
          variant="ghost"
          onClick={() => {
            if (page) {
              setPages((prev) => [...prev, page.posts]);
              setCursor(page.nextCursor);
            }
          }}
          className="w-full"
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function ExploreFeed() {
  const [pages, setPages] = useState<FeedPost[][]>([]);
  const [cursor, setCursor] = useState<FeedCursor>(null);

  const page = useQuery(api.social.posts.exploreFeed, {
    limit: 20,
    cursor,
  });

  const allPosts = [...pages.flat(), ...(page?.posts ?? [])];
  const isLoading = page === undefined && pages.length === 0;
  const hasMore = !!page?.nextCursor;

  if (isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (allPosts.length === 0) {
    return (
      <div className="atelier-empty-state">
        <span className="atelier-empty-glyph" aria-hidden="true" />
        <p className="text-sm">No public notes yet. The first one sets the tone.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {allPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {hasMore && (
        <Button
          variant="ghost"
          onClick={() => {
            if (page) {
              setPages((prev) => [...prev, page.posts]);
              setCursor(page.nextCursor);
            }
          }}
          className="w-full"
        >
          Load more
        </Button>
      )}
    </div>
  );
}
