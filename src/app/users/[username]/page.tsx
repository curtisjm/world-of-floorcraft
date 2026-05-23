"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { ProfileHeader } from "@social/components/profile-header";
import { PartnerSearchCard } from "@social/components/partner-search-card";
import { PastCompetitionsTab } from "@competitions/components/past-competitions-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import Link from "next/link";

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const user = useQuery(api.social.profiles.getByUsername, { username });
  const me = useQuery(api.users.me, {});

  const partnerSearch = useQuery(
    api.social.partnerSearch.getByUserId,
    user ? { userId: user._id } : "skip",
  );
  const followStatus = useQuery(
    api.social.follows.status,
    user && me && me._id !== user._id ? { targetUserId: user._id } : "skip",
  );

  const isOwnProfile = !!me && !!user && me._id === user._id;
  const canViewContent =
    !!user && (!user.isPrivate || isOwnProfile || followStatus?.status === "active");

  const posts = useQuery(
    api.social.posts.listByAuthor,
    user && canViewContent ? { authorId: user._id } : "skip",
  );
  const routines = useQuery(
    api.routines.listPublishedByUser,
    user && canViewContent ? { userId: user._id } : "skip",
  );

  if (user === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-4">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <ProfileHeader username={username} />

      {partnerSearch && (
        <div className="mt-4">
          <PartnerSearchCard
            profile={{
              danceStyles: partnerSearch.danceStyles,
              height: partnerSearch.height ?? null,
              location: partnerSearch.location ?? null,
              bio: partnerSearch.bio ?? null,
              rolePreference: partnerSearch.rolePreference,
            }}
          />
        </div>
      )}

      <div className="mt-8">
        {!canViewContent ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-semibold">This account is private.</p>
            <p className="text-sm mt-1">Follow this account to see their posts and routines.</p>
          </div>
        ) : (
          <Tabs defaultValue="posts">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="routines">Routines</TabsTrigger>
              <TabsTrigger value="competitions">Competitions</TabsTrigger>
            </TabsList>
            <TabsContent value="posts" className="mt-4">
              {posts === undefined ? (
                <Skeleton className="h-24" />
              ) : posts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No posts yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {posts.map((post) => (
                    <Link key={post.id} href={`/posts/${post.id}`}>
                      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader>
                          <CardTitle className="text-base">
                            {post.title ?? "Untitled"}
                          </CardTitle>
                          <CardDescription>
                            {post.publishedAt
                              ? new Date(post.publishedAt).toLocaleDateString()
                              : "Draft"}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="routines" className="mt-4">
              {routines === undefined ? (
                <Skeleton className="h-24" />
              ) : routines.length === 0 ? (
                <p className="text-muted-foreground text-sm">No routines yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {routines.map((routine) => (
                    <Link key={routine.id} href={`/routines/${routine.id}`}>
                      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                        <CardHeader>
                          <CardTitle className="text-base">{routine.name}</CardTitle>
                          {routine.description && (
                            <CardDescription>{routine.description}</CardDescription>
                          )}
                        </CardHeader>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="competitions" className="mt-4">
              <PastCompetitionsTab userId={user._id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
