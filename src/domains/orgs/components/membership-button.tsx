"use client";
import { useRouter } from "next/navigation";
import { Button } from "@shared/ui/button";
import { trpc } from "@shared/lib/trpc";

interface MembershipButtonProps {
  orgId: number;
  orgSlug: string;
  membershipModel: "open" | "invite" | "request";
  membership: { role: string } | null;
  isOwner: boolean;
  pendingRequest: boolean;
}

export function MembershipButton({
  orgId,
  orgSlug,
  membershipModel,
  membership,
  isOwner,
  pendingRequest,
}: MembershipButtonProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const invalidate = () => {
    utils.membership.getMyMembership.invalidate({ orgId });
    utils.joinRequest.getMyRequest.invalidate({ orgId });
    utils.org.getBySlug.invalidate({ slug: orgSlug });
  };

  const joinMutation = trpc.membership.join.useMutation({ onSuccess: invalidate });
  const leaveMutation = trpc.membership.leave.useMutation({ onSuccess: invalidate });
  const requestMutation = trpc.joinRequest.request.useMutation({ onSuccess: invalidate });

  if (isOwner) {
    return (
      <Button size="sm" onClick={() => router.push(`/orgs/${orgSlug}/settings`)}>
        Manage Organization
      </Button>
    );
  }

  if (membership) {
    const label = membership.role === "admin" ? "Admin · Leave" : "Member · Leave";
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => leaveMutation.mutate({ orgId })}
        disabled={leaveMutation.isPending}
      >
        {label}
      </Button>
    );
  }

  if (membershipModel === "open") {
    return (
      <Button
        size="sm"
        onClick={() => joinMutation.mutate({ orgId })}
        disabled={joinMutation.isPending}
      >
        Join
      </Button>
    );
  }

  if (membershipModel === "request") {
    if (pendingRequest) {
      return (
        <Button variant="outline" size="sm" disabled>
          Request Pending
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        onClick={() => requestMutation.mutate({ orgId })}
        disabled={requestMutation.isPending}
      >
        Request to Join
      </Button>
    );
  }

  // invite only
  return (
    <Button variant="outline" size="sm" disabled>
      Invite Only
    </Button>
  );
}
