"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
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
import { PartnerSearch } from "@competitions/components/partner-search";

type PartnerInfo = {
  userId: Id<"users">;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  registrationId: Id<"competitionRegistrations"> | null;
};

export default function AddDropPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const myReg = useQuery(
    api.competitions.registration.getMyRegistration,
    comp ? { competitionId: comp._id } : "skip",
  );
  const myRequests = useQuery(
    api.competitions.addDrop.listByRegistration,
    myReg ? { registrationId: myReg._id } : "skip",
  );
  const isLoading = myRequests === undefined && myReg !== null;
  const events = useQuery(
    api.competitions.events.listByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );

  const submitRequest = useMutation(api.competitions.addDrop.submit);
  const ensurePartnerMutation = useMutation(
    api.competitions.registration.ensurePartnerRegistered,
  );

  const [submitting, setSubmitting] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [requestType, setRequestType] = useState<string>("add");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [myRole, setMyRole] = useState<"leader" | "follower">("leader");
  const [partner, setPartner] = useState<PartnerInfo | null>(null);

  function resetForm() {
    setRequestType("add");
    setSelectedEventId("");
    setReason("");
    setMyRole("leader");
    setPartner(null);
  }

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const canSubmit = comp.status === "entries_closed" || comp.status === "running";

  async function handleSubmit() {
    if (!myReg || !selectedEventId || !partner || !comp) return;

    setSubmitting(true);
    try {
      let partnerRegId = partner.registrationId;

      // Auto-register partner if needed
      if (!partnerRegId) {
        const reg = await ensurePartnerMutation({
          competitionId: comp._id,
          partnerUserId: partner.userId,
        });
        if (!reg) return;
        partnerRegId = reg._id;
      }

      await submitRequest({
        competitionId: comp._id,
        type: requestType as "add" | "drop",
        eventId: selectedEventId as Id<"competitionEvents">,
        leaderRegistrationId: myRole === "leader" ? myReg._id : partnerRegId,
        followerRegistrationId: myRole === "follower" ? myReg._id : partnerRegId,
        reason: reason || undefined,
      });
      toast.success("Request submitted");
      setShowSubmit(false);
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

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
          {myRequests.map((req) => (
            <Card key={req._id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={req.type === "add" ? "default" : "destructive"} className="text-xs">
                        {req.type === "add" ? "Add" : "Drop"}
                      </Badge>
                      <span className="text-sm font-medium">{events?.find((e) => e._id === req.eventId)?.name ?? "Event"}</span>
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
      <Dialog open={showSubmit} onOpenChange={(open) => { setShowSubmit(open); if (!open) resetForm(); }}>
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
                    <SelectItem key={event._id} value={event._id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role selection */}
            <div className="space-y-2">
              <Label>Your Role</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={myRole === "leader" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMyRole("leader")}
                >
                  Leader
                </Button>
                <Button
                  type="button"
                  variant={myRole === "follower" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMyRole("follower")}
                >
                  Follower
                </Button>
              </div>
            </div>

            {/* Partner search */}
            <div className="space-y-2">
              <Label>Partner</Label>
              {partner ? (
                <div className="flex items-center justify-between p-2 rounded-md border">
                  <span className="text-sm">
                    {partner.displayName ?? partner.username}
                    {partner.username && (
                      <span className="text-muted-foreground ml-1">@{partner.username}</span>
                    )}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setPartner(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                comp && (
                  <PartnerSearch
                    competitionId={comp._id}
                    onSelect={setPartner}
                    excludeUserIds={myReg ? [myReg.userId] : []}
                  />
                )
              )}
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
              onClick={handleSubmit}
              disabled={submitting || !selectedEventId || !partner}
            >
              {submitting
                ? "Submitting..."
                : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
