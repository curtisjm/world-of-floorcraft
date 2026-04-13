"use client";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { OrgHeader } from "@orgs/components/org-header";
import { MemberList } from "@orgs/components/member-list";
import { OrgPostComposer } from "@orgs/components/org-post-composer";
import { OrgPostCard } from "@orgs/components/org-post-card";
import { OrgDraftList } from "@orgs/components/org-draft-list";

function OrgPosts({ orgId, canPost }: { orgId: number; canPost: boolean }) {
  const { data, isLoading } = trpc.orgPost.listByOrg.useQuery({ orgId, limit: 20 });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading posts...</p>;
  }

  const posts = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      {canPost && <OrgPostComposer orgId={orgId} />}
      {canPost && <OrgDraftList orgId={orgId} />}
      {posts.length === 0 && !canPost && (
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

export default function OrgProfilePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: org, isLoading: orgLoading } = trpc.org.getBySlug.useQuery({ slug });

  const { data: membershipData } = trpc.membership.getMyMembership.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org }
  );

  const { data: myRequest } = trpc.joinRequest.getMyRequest.useQuery(
    { orgId: org?.id ?? 0 },
    { enabled: !!org }
  );

  if (orgLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Organization not found.</p>
      </div>
    );
  }

  const isOwner = membershipData?.isOwner ?? false;
  const membership = membershipData?.membership ?? null;
  const pendingRequest = myRequest?.status === "pending";

  const membershipModelLabel =
    org.membershipModel === "open"
      ? "Open — anyone can join"
      : org.membershipModel === "request"
        ? "Request — members must be approved"
        : "Invite — by invitation only";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <OrgHeader
        org={org}
        membership={membership}
        isOwner={isOwner}
        pendingRequest={pendingRequest}
      />

      <div className="mt-8">
        <Tabs defaultValue="posts">
          <TabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-4">
            <OrgPosts orgId={org.id} canPost={isOwner || membership?.role === "admin"} />
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <MemberList orgId={org.id} />
          </TabsContent>

          <TabsContent value="about" className="mt-4">
            <div className="space-y-3">
              {org.description ? (
                <p className="text-muted-foreground">{org.description}</p>
              ) : (
                <p className="text-muted-foreground text-sm">No description.</p>
              )}
              <p className="text-sm">
                <span className="font-medium">Membership: </span>
                <span className="text-muted-foreground">{membershipModelLabel}</span>
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
