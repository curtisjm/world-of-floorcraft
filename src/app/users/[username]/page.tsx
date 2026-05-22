import { eq, and, asc, desc, isNotNull, or, sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { getDb } from "@shared/db";
import { users } from "@shared/schema";
import { follows, posts, partnerSearchProfiles } from "@social/schema";
import { routines } from "@routines/schema";
import { ProfileHeader } from "@social/components/profile-header";
import { PartnerSearchCard } from "@social/components/partner-search-card";
import { PastCompetitionsTab } from "@competitions/components/past-competitions-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription } from "@shared/ui/card";
import Link from "next/link";

// During the Convex migration this page is hybrid: the profile header (the
// Task 5 social-identity slice) reads from Convex via `ProfileHeader`, while
// the posts / routines / partner-search / competitions tabs and the private-
// account visibility gate still query Drizzle. Those domains are owned by
// Tasks 4 (routines), 7 (social content, partner search), and 9 (competitions)
// and will migrate this page's data fetches in their own slices.

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const db = getDb();
  const { userId: currentUserId } = await auth();

  // Fetch user by username
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      competitionLevel: users.competitionLevel,
      competitionLevelHigh: users.competitionLevelHigh,
      isPrivate: users.isPrivate,
    })
    .from(users)
    .where(eq(users.username, username));

  if (!user) {
    notFound();
  }

  // Follower / following counts are owned by `ProfileHeader` (Convex).

  // Fetch partner search profile (table may not exist yet if migration hasn't run)
  let partnerSearch: {
    danceStyles: string[];
    height: string | null;
    location: string | null;
    bio: string | null;
    rolePreference: string;
  } | undefined;
  try {
    [partnerSearch] = await db
      .select({
        danceStyles: partnerSearchProfiles.danceStyles,
        height: partnerSearchProfiles.height,
        location: partnerSearchProfiles.location,
        bio: partnerSearchProfiles.bio,
        rolePreference: partnerSearchProfiles.rolePreference,
      })
      .from(partnerSearchProfiles)
      .where(eq(partnerSearchProfiles.userId, user.id));
  } catch {
    // Table doesn't exist yet — skip
  }

  const isOwnProfile = currentUserId === user.id;

  // Check if the current user can view content (private account check)
  let canViewContent = !user.isPrivate || isOwnProfile;

  if (!canViewContent && currentUserId) {
    const [followRecord] = await db
      .select({ status: follows.status })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, currentUserId),
          eq(follows.followingId, user.id),
          eq(follows.status, "active")
        )
      );

    if (followRecord) {
      canViewContent = true;
    }
  }

  // Build post visibility filter based on viewer's relationship to the author
  let postVisibilityFilter;
  if (isOwnProfile) {
    // Author sees all their own published posts regardless of visibility
    postVisibilityFilter = undefined;
  } else if (currentUserId) {
    // Authenticated viewer: public + followers-only (if following) + org-only (if member)
    postVisibilityFilter = or(
      eq(posts.visibility, "public"),
      and(
        eq(posts.visibility, "followers"),
        sql`EXISTS (SELECT 1 FROM follows WHERE follower_id = ${currentUserId} AND following_id = ${user.id} AND status = 'active')`
      ),
      and(
        eq(posts.visibility, "organization"),
        sql`${posts.visibilityOrgId} IN (SELECT org_id FROM memberships WHERE user_id = ${currentUserId})`
      )
    );
  } else {
    // Unauthenticated: only public posts
    postVisibilityFilter = eq(posts.visibility, "public");
  }

  // Fetch published posts if visible, filtered by post-level visibility
  const userPosts = canViewContent
    ? await db
        .select({
          id: posts.id,
          title: posts.title,
          type: posts.type,
          publishedAt: posts.publishedAt,
        })
        .from(posts)
        .where(
          and(
            eq(posts.authorId, user.id),
            isNotNull(posts.publishedAt),
            postVisibilityFilter
          )
        )
        .orderBy(desc(posts.publishedAt))
    : [];

  // Fetch published routines if visible
  const userRoutines = canViewContent
    ? await db
        .select({
          id: routines.id,
          name: routines.name,
          description: routines.description,
          createdAt: routines.createdAt,
        })
        .from(routines)
        .where(and(eq(routines.userId, user.id), eq(routines.isPublished, true)))
        .orderBy(asc(routines.createdAt))
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <ProfileHeader username={username} />

      {partnerSearch && (
        <div className="mt-4">
          <PartnerSearchCard profile={partnerSearch} />
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
              {userPosts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No posts yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {userPosts.map((post) => (
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
              {userRoutines.length === 0 ? (
                <p className="text-muted-foreground text-sm">No routines yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {userRoutines.map((routine) => (
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
              <PastCompetitionsTab userId={user.id} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
