"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Card, CardContent } from "@shared/ui/card";
import { toast } from "sonner";

export function MyInvites() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: invites, isLoading } = trpc.invite.listMyInvites.useQuery();

  const acceptMutation = trpc.invite.accept.useMutation({
    onSuccess: (_data, variables) => {
      toast.success("Invite accepted!");
      utils.invite.listMyInvites.invalidate();
      // Find the invite to get the org slug for navigation
      const invite = invites?.find((i) => i.id === variables.inviteId);
      if (invite?.orgSlug) {
        router.push(`/orgs/${invite.orgSlug}`);
      }
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const declineMutation = trpc.invite.decline.useMutation({
    onSuccess: () => {
      toast.success("Invite declined.");
      utils.invite.listMyInvites.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading invites...</p>;
  }

  if (!invites || invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No pending invites.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {invites.map((invite) => {
        const isExpired = new Date(invite.expiresAt) < new Date();

        return (
          <Card key={invite.id}>
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
                  onClick={() => acceptMutation.mutate({ inviteId: invite.id })}
                  disabled={
                    isExpired ||
                    acceptMutation.isPending ||
                    declineMutation.isPending
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    declineMutation.mutate({ inviteId: invite.id })
                  }
                  disabled={
                    isExpired ||
                    acceptMutation.isPending ||
                    declineMutation.isPending
                  }
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
