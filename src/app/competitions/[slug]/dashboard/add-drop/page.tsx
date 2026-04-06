"use client";

import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import { Check, X, Zap } from "lucide-react";

export default function AddDropManagementPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const {
    data: requests,
    isLoading,
    refetch,
  } = trpc.addDrop.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const approveMutation = trpc.addDrop.approve.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Request approved");
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.addDrop.reject.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Request rejected");
    },
    onError: (err) => toast.error(err.message),
  });

  const approveAllSafe = trpc.addDrop.approveAllSafe.useMutation({
    onSuccess: (result) => {
      refetch();
      toast.success(`Approved ${result.approved} safe requests`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const { safe = [], needsReview = [], resolved = [] } = requests ?? {};
  const pendingCount = safe.length + needsReview.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Add/Drop Requests{pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
        </h2>
        {safe.length > 0 && (
          <Button
            onClick={() => approveAllSafe.mutate({ competitionId: comp.id })}
            disabled={approveAllSafe.isPending}
          >
            <Zap className="size-4 mr-2" />
            {approveAllSafe.isPending ? "Approving..." : `Approve ${safe.length} Safe`}
          </Button>
        )}
      </div>

      {/* Needs Review */}
      {needsReview.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-yellow-600">
              Needs Review ({needsReview.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These requests affect events that already have rounds generated.
            </p>
          </CardHeader>
          <CardContent>
            <RequestList
              requests={needsReview}
              onApprove={(id) => approveMutation.mutate({ requestId: id })}
              onReject={(id) => rejectMutation.mutate({ requestId: id })}
              isPending={approveMutation.isPending || rejectMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* Safe to approve */}
      {safe.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Safe to Approve ({safe.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These requests don&apos;t affect any existing rounds.
            </p>
          </CardHeader>
          <CardContent>
            <RequestList
              requests={safe}
              onApprove={(id) => approveMutation.mutate({ requestId: id })}
              onReject={(id) => rejectMutation.mutate({ requestId: id })}
              isPending={approveMutation.isPending || rejectMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {pendingCount === 0 && resolved.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No add/drop requests.
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              Resolved ({resolved.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resolved.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-2 rounded-md border opacity-60">
                  <div className="flex items-center gap-2">
                    <Badge variant={req.type === "add" ? "default" : "destructive"} className="text-xs">
                      {req.type}
                    </Badge>
                    <span className="text-sm">{req.eventName ?? `Event #${req.eventId}`}</span>
                    <span className="text-xs text-muted-foreground">
                      — {req.leaderName ?? "Unknown"}
                    </span>
                  </div>
                  <Badge
                    variant={req.status === "approved" ? "default" : "destructive"}
                    className="text-xs capitalize"
                  >
                    {req.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RequestList({
  requests,
  onApprove,
  onReject,
  isPending,
}: {
  requests: any[];
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-2">
      {requests.map((req: any) => (
        <div key={req.id} className="flex items-center justify-between p-3 rounded-md border">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={req.type === "add" ? "default" : "destructive"} className="text-xs">
                {req.type}
              </Badge>
              <span className="text-sm font-medium">{req.eventName ?? `Event #${req.eventId}`}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {req.leaderName ?? "Unknown"} & {req.followerName ?? "Unknown"}
              {req.reason && ` — "${req.reason}"`}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-green-600"
              onClick={() => onApprove(req.id)}
              disabled={isPending}
            >
              <Check className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              onClick={() => onReject(req.id)}
              disabled={isPending}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
