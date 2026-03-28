"use client";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { Card, CardContent } from "@shared/ui/card";
import { OrgHeader } from "@orgs/components/org-header";
import { MemberList } from "@orgs/components/member-list";

function OrgPosts({ orgId }: { orgId: number }) {
  const { data, isLoading } = trpc.orgPost.listByOrg.useQuery({ orgId, limit: 20 });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading posts...</p>;
  }

  const posts = data?.items ?? [];

  if (posts.length === 0) {
    return <p className="text-muted-foreground text-sm">No posts yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <Card key={post.id}>
          <CardContent className="p-4">
            {post.title && <p className="font-semibold mb-1">{post.title}</p>}
            {post.body && (
              <p className="text-sm text-muted-foreground line-clamp-3">{post.body}</p>
            )}
          </CardContent>
        </Card>
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
            <OrgPosts orgId={org.id} />
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
