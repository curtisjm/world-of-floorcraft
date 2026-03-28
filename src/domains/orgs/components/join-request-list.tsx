"use client";
import { trpc } from "@shared/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/ui/avatar";
import { Button } from "@shared/ui/button";

interface JoinRequestListProps {
  orgId: number;
}

export function JoinRequestList({ orgId }: JoinRequestListProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.joinRequest.listPending.useQuery({ orgId });

  const invalidate = () => utils.joinRequest.listPending.invalidate({ orgId });

  const approveMutation = trpc.joinRequest.approve.useMutation({ onSuccess: invalidate });
  const rejectMutation = trpc.joinRequest.reject.useMutation({ onSuccess: invalidate });

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading requests...</p>;
  }

  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm">No pending join requests.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((request) => (
        <div
          key={request.id}
          className="flex items-center gap-3 p-3 rounded-lg border bg-card"
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
              onClick={() => approveMutation.mutate({ requestId: request.id })}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rejectMutation.mutate({ requestId: request.id })}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
