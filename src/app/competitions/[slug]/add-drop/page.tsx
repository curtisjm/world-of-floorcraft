"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Label } from "@shared/ui/label";
import { Textarea } from "@shared/ui/textarea";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function AddDropPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: myReg } = trpc.registration.getMyRegistration.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );
  const { data: myRequests, isLoading, refetch } = trpc.addDrop.listByRegistration.useQuery(
    { registrationId: myReg?.id ?? 0 },
    { enabled: !!myReg },
  );
  const { data: events } = trpc.event.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const submitRequest = trpc.addDrop.submit.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Request submitted");
      setShowSubmit(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [showSubmit, setShowSubmit] = useState(false);
  const [requestType, setRequestType] = useState<string>("add");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [reason, setReason] = useState("");

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const canSubmit = comp.status === "entries_closed" || comp.status === "running";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{comp.name}</h1>
          <p className="text-muted-foreground">Add/Drop Requests</p>
        </div>
        {canSubmit && myReg && (
          <Button onClick={() => setShowSubmit(true)}>
            <Plus className="size-4 mr-2" />
            New Request
          </Button>
        )}
      </div>

      {!myReg && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You must be registered to submit add/drop requests.
          </CardContent>
        </Card>
      )}

      {myReg && !myRequests?.length && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No add/drop requests submitted.
          </CardContent>
        </Card>
      )}

      {myRequests?.length ? (
        <div className="space-y-2">
          {myRequests.map((req: any) => (
            <Card key={req.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={req.type === "add" ? "default" : "destructive"} className="text-xs">
                        {req.type === "add" ? "Add" : "Drop"}
                      </Badge>
                      <span className="text-sm font-medium">{req.eventName ?? `Event #${req.eventId}`}</span>
                    </div>
                    {req.reason && (
                      <p className="text-xs text-muted-foreground">{req.reason}</p>
                    )}
                  </div>
                  <Badge
                    variant={
                      req.status === "approved"
                        ? "default"
                        : req.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs capitalize"
                  >
                    {req.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Submit Request Dialog */}
      <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Add/Drop Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Event</SelectItem>
                  <SelectItem value="drop">Drop Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select event" />
                </SelectTrigger>
                <SelectContent>
                  {events?.map((event) => (
                    <SelectItem key={event.id} value={event.id.toString()}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why are you requesting this change?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!myReg || !selectedEventId) return;
                submitRequest.mutate({
                  competitionId: comp.id,
                  type: requestType as any,
                  eventId: Number(selectedEventId),
                  leaderRegistrationId: myReg.id,
                  followerRegistrationId: myReg.id,
                  reason: reason || undefined,
                });
              }}
              disabled={submitRequest.isPending || !selectedEventId}
            >
              {submitRequest.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
