"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { Button } from "@shared/ui/button";
import { convexErrorMessage } from "@social/lib/convex-error";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface MembershipButtonProps {
  orgId: Id<"organizations">;
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
  const [pending, setPending] = useState(false);

  const join = useMutation(api.orgs.join);
  const leave = useMutation(api.orgs.leave);
  const requestJoin = useMutation(api.orgs.requestJoin);

  const runMutation = async (fn: () => Promise<unknown>) => {
    setPending(true);
    try {
      await fn();
    } catch (err) {
      alert(convexErrorMessage(err, "Failed"));
    } finally {
      setPending(false);
    }
  };

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
        onClick={() => runMutation(() => leave({ orgId }))}
        disabled={pending}
      >
        {label}
      </Button>
    );
  }

  if (membershipModel === "open") {
    return (
      <Button
        size="sm"
        onClick={() => runMutation(() => join({ orgId }))}
        disabled={pending}
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
        onClick={() => runMutation(() => requestJoin({ orgId }))}
        disabled={pending}
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
