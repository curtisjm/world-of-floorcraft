"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import { Check, X, Zap } from "lucide-react";

type AddDropRequest = {
  _id: Id<"addDropRequests">;
  competitionId: Id<"competitions">;
  type: "add" | "drop";
  eventId: Id<"competitionEvents">;
  leaderRegistrationId: Id<"competitionRegistrations">;
  followerRegistrationId: Id<"competitionRegistrations">;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  affectsRounds?: boolean;
};

export default function AddDropManagementPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });
  const requests = useQuery(
    api.competitions.addDrop.listByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = comp === undefined || requests === undefined;

  const approveMutation = useMutation(api.competitions.addDrop.approve);
  const rejectMutation = useMutation(api.competitions.addDrop.reject);
  const approveAllSafeMutation = useMutation(
    api.competitions.addDrop.approveAllSafe,
  );
  const [pending, setPending] = useState(false);
  const [approveAllPending, setApproveAllPending] = useState(false);

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

  const handleApprove = async (requestId: Id<"addDropRequests">) => {
    setPending(true);
    try {
      await approveMutation({ requestId });
      toast.success("Request approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  };

  const handleReject = async (requestId: Id<"addDropRequests">) => {
    setPending(true);
    try {
      await rejectMutation({ requestId });
      toast.success("Request rejected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  };

  const handleApproveAllSafe = async () => {
    setApproveAllPending(true);
    try {
      const result = await approveAllSafeMutation({ competitionId: comp._id });
      toast.success(`Approved ${result.approved} safe requests`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setApproveAllPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Add/Drop Requests{pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
        </h2>
        {safe.length > 0 && (
          <Button
            onClick={handleApproveAllSafe}
            disabled={approveAllPending}
          >
            <Zap className="size-4 mr-2" />
            {approveAllPending ? "Approving..." : `Approve ${safe.length} Safe`}
          </Button>
        )}
      </div>

      {/* Needs Review */}
      {needsReview.length > 0 && (
        <Card className="status-clay">
          <CardHeader className="pb-3">
            <CardTitle className="text-status-clay text-base">
              Needs Review ({needsReview.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              These requests affect events that already have rounds generated.
            </p>
          </CardHeader>
          <CardContent>
            <RequestList
              requests={needsReview}
              onApprove={handleApprove}
              onReject={handleReject}
              isPending={pending}
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
              onApprove={handleApprove}
              onReject={handleReject}
              isPending={pending}
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
              {resolved.map((req) => (
                <div key={req._id} className="flex items-center justify-between p-2 rounded-md border opacity-60">
                  <div className="flex items-center gap-2">
                    <Badge variant={req.type === "add" ? "default" : "destructive"} className="text-xs">
                      {req.type}
                    </Badge>
                    <span className="text-sm">{`Event #${req.eventId}`}</span>
                    <span className="text-xs text-muted-foreground">
                      Reg #{req.leaderRegistrationId}
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
  requests: AddDropRequest[];
  onApprove: (id: Id<"addDropRequests">) => void;
  onReject: (id: Id<"addDropRequests">) => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-2">
      {requests.map((req) => (
        <div key={req._id} className="flex items-center justify-between p-3 rounded-md border">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={req.type === "add" ? "default" : "destructive"} className="text-xs">
                {req.type}
              </Badge>
              <span className="text-sm font-medium">{`Event #${req.eventId}`}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reg #{req.leaderRegistrationId} & #{req.followerRegistrationId}
              {req.reason && ` — "${req.reason}"`}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-status-sage"
              onClick={() => onApprove(req._id)}
              disabled={isPending}
            >
              <Check className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              onClick={() => onReject(req._id)}
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
