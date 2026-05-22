"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Card, CardContent } from "@shared/ui/card";
import { toast } from "sonner";
import { convexErrorMessage } from "@social/lib/convex-error";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function MyInvites() {
  const router = useRouter();
  const invites = useQuery(api.orgs.listMyInvites, {});
  const acceptInvite = useMutation(api.orgs.acceptInvite);
  const declineInvite = useMutation(api.orgs.declineInvite);
  const [pendingId, setPendingId] = useState<Id<"orgInvites"> | null>(null);

  if (invites === undefined) {
    return <p className="text-sm text-muted-foreground">Loading invites...</p>;
  }

  if (invites.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending invites.</p>;
  }

  const handleAccept = async (
    inviteId: Id<"orgInvites">,
    orgSlug: string | null,
  ) => {
    setPendingId(inviteId);
    try {
      await acceptInvite({ inviteId });
      toast.success("Invite accepted!");
      if (orgSlug) router.push(`/orgs/${orgSlug}`);
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to accept invite"));
    } finally {
      setPendingId(null);
    }
  };

  const handleDecline = async (inviteId: Id<"orgInvites">) => {
    setPendingId(inviteId);
    try {
      await declineInvite({ inviteId });
      toast.success("Invite declined.");
    } catch (err) {
      toast.error(convexErrorMessage(err, "Failed to decline invite"));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {invites.map((invite) => {
        const isExpired = invite.expiresAt < Date.now();
        const busy = pendingId === invite._id;

        return (
          <Card key={invite._id}>
            <CardContent className="flex items-center gap-4 p-4">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={invite.orgAvatarUrl ?? undefined} />
                <AvatarFallback>
                  {invite.orgName?.[0]?.toUpperCase() ?? "O"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{invite.orgName}</p>
                <p className="text-xs text-muted-foreground">
                  {isExpired
                    ? "Expired"
                    : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleAccept(invite._id, invite.orgSlug)}
                  disabled={isExpired || busy}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDecline(invite._id)}
                  disabled={isExpired || busy}
                >
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
