"use client";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/ui/tabs";
import { OrgHeader } from "@orgs/components/org-header";
import { MemberList } from "@orgs/components/member-list";
import { api } from "../../../../convex/_generated/api";

// Org posts (composer, drafts, listing) require Task 7's Convex social-
// content migration, since Convex org ids are opaque rather than serial
// integers. The Posts tab returns once Task 7 ports `orgPost.*` and the
// org-post component family.

export default function OrgProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const org = useQuery(api.orgs.getBySlug, { slug });
  const membershipData = useQuery(
    api.orgs.getMyMembership,
    org ? { orgId: org._id } : "skip",
  );
  const myRequest = useQuery(
    api.orgs.getMyJoinRequest,
    org ? { orgId: org._id } : "skip",
  );

  if (org === undefined) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (org === null) {
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
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="mt-4">
            <MemberList orgId={org._id} />
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
