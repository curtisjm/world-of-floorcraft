"use client";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { MembershipButton } from "./membership-button";

interface OrgHeaderProps {
  org: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    membershipModel: "open" | "invite" | "request";
    ownerId: string;
    memberCount: number;
  };
  membership: { role: string } | null;
  isOwner: boolean;
  pendingRequest: boolean;
}

export function OrgHeader({ org, membership, isOwner, pendingRequest }: OrgHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
      <Avatar className="h-24 w-24 shrink-0">
        <AvatarImage src={org.avatarUrl ?? undefined} />
        <AvatarFallback className="text-2xl">{org.name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold">{org.name}</h1>
        {org.description && (
          <p className="text-muted-foreground mt-1">{org.description}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {org.memberCount} {org.memberCount === 1 ? "member" : "members"}
        </p>
        <div className="mt-3">
          <MembershipButton
            orgId={org.id}
            orgSlug={org.slug}
            membershipModel={org.membershipModel}
            membership={membership}
            isOwner={isOwner}
            pendingRequest={pendingRequest}
          />
        </div>
      </div>
    </div>
  );
}
