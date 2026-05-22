"use client";

import { useState } from "react";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Skeleton } from "@shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { PostCard } from "./post-card";

export function Feed() {
  const [activeTab, setActiveTab] = useState<"following" | "explore">("following");

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "following" | "explore")}>
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
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.feed.following.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

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
      {hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}

function ExploreFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.feed.explore.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      }
    );

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

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
      {hasNextPage && (
        <Button
          variant="ghost"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full"
        >
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
