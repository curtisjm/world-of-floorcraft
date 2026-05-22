"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Button } from "@shared/ui/button";
import { convexErrorMessage } from "@social/lib/convex-error";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface JoinRequestListProps {
  orgId: Id<"organizations">;
}

export function JoinRequestList({ orgId }: JoinRequestListProps) {
  const data = useQuery(api.orgs.listPendingJoinRequests, { orgId });
  const approve = useMutation(api.orgs.approveJoinRequest);
  const reject = useMutation(api.orgs.rejectJoinRequest);
  const [pendingId, setPendingId] = useState<Id<"joinRequests"> | null>(null);

  const runMutation = async (
    requestId: Id<"joinRequests">,
    fn: () => Promise<unknown>,
  ) => {
    setPendingId(requestId);
    try {
      await fn();
    } catch (err) {
      alert(convexErrorMessage(err, "Action failed"));
    } finally {
      setPendingId(null);
    }
  };

  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">Loading requests...</p>;
  }

  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending join requests.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((request) => {
        const isPending = pendingId === request._id;
        return (
          <div
            key={request._id}
            className="flex items-center gap-3 border bg-card p-3"
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={request.avatarUrl ?? undefined} />
              <AvatarFallback>
                {(request.displayName ?? request.username ?? "?")[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{request.displayName ?? request.username}</p>
              {request.username && (
                <p className="text-sm text-muted-foreground truncate">@{request.username}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() =>
                  runMutation(request._id, () =>
                    approve({ requestId: request._id }),
                  )
                }
                disabled={isPending}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  runMutation(request._id, () =>
                    reject({ requestId: request._id }),
                  )
                }
                disabled={isPending}
              >
                Reject
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
