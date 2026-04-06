"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Checkbox } from "@shared/ui/checkbox";
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
import { UserPlus, Check, Search } from "lucide-react";

export default function RegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp, isLoading: compLoading } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: userOrgs } = trpc.org.listUserOrgs.useQuery();
  const { data: myReg, refetch: refetchReg } = trpc.registration.getMyRegistration.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );
  const { data: events } = trpc.event.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const utils = trpc.useUtils();

  const registerMutation = trpc.registration.register.useMutation({
    onSuccess: () => {
      refetchReg();
      toast.success("Registered successfully");
      setShowRegister(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkCreateEntries = trpc.entry.bulkCreate.useMutation({
    onSuccess: (created) => {
      refetchReg();
      toast.success(`Added ${created.length} entries`);
      setShowAddEntries(false);
      setSelectedEventIds([]);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeEntry = trpc.entry.remove.useMutation({
    onSuccess: () => {
      refetchReg();
      toast.success("Entry removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const scratchEntry = trpc.entry.scratch.useMutation({
    onSuccess: () => {
      refetchReg();
      toast.success("Entry updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const [showRegister, setShowRegister] = useState(false);
  const [partnerUsername, setPartnerUsername] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [showAddEntries, setShowAddEntries] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);

  if (compLoading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!comp) return null;

  const isOpen = comp.status === "accepting_entries";
  const isClosed = comp.status === "entries_closed" || comp.status === "running" || comp.status === "finished";

  // Events the user has already entered
  const enteredEventIds = new Set(myReg?.entries?.map((e: any) => e.eventId) ?? []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{comp.name}</h1>
        <p className="text-muted-foreground">Registration</p>
      </div>

      {!isOpen && !myReg && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {comp.status === "draft" || comp.status === "advertised"
              ? "Registration is not yet open for this competition."
              : "Registration is closed."}
          </CardContent>
        </Card>
      )}

      {isOpen && !myReg && (
        <Card>
          <CardHeader>
            <CardTitle>Register for this Competition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Register yourself and optionally a partner. You can add event entries after registering.
            </p>
            <Button onClick={() => setShowRegister(true)}>
              <UserPlus className="size-4 mr-2" />
              Register
            </Button>
          </CardContent>
        </Card>
      )}

      {myReg && (
        <>
          {/* Registration info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Registration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={myReg.cancelled ? "destructive" : "secondary"}>
                  {myReg.cancelled ? "Cancelled" : myReg.checkedIn ? "Checked In" : "Registered"}
                </Badge>
              </div>
              {myReg.competitorNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Number</span>
                  <span className="font-mono font-bold">{myReg.competitorNumber}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Entries</span>
                <span>{myReg.entries?.length ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Entries */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Your Entries ({myReg.entries?.length ?? 0})
                </CardTitle>
                {isOpen && (
                  <Button size="sm" onClick={() => setShowAddEntries(true)}>
                    Add Entries
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!myReg.entries?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No entries yet. Add events to compete in.
                </p>
              ) : (
                <div className="space-y-2">
                  {myReg.entries.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3 rounded-md border"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{entry.eventName ?? `Event #${entry.eventId}`}</span>
                        {entry.scratched && (
                          <Badge variant="destructive" className="ml-2 text-xs">Scratched</Badge>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => scratchEntry.mutate({ entryId: entry.id })}
                        >
                          {entry.scratched ? "Unscratch" : "Scratch"}
                        </Button>
                        {isOpen && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm("Remove this entry?")) {
                                removeEntry.mutate({ entryId: entry.id });
                              }
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Amount Owed</span>
                <span className="font-medium">${myReg.amountOwed ?? "0.00"}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-muted-foreground">Total Paid</span>
                <span className="font-medium">${myReg.totalPaid ?? "0.00"}</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Register Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Partner Username (optional)</Label>
              <Input
                value={partnerUsername}
                onChange={(e) => setPartnerUsername(e.target.value)}
                placeholder="Enter partner's username"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to register solo. Your partner will be notified.
              </p>
            </div>
            {userOrgs && userOrgs.length > 0 && (
              <div className="space-y-2">
                <Label>Organization Affiliation (optional)</Label>
                <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unaffiliated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unaffiliated</SelectItem>
                    {userOrgs.map((org) => (
                      <SelectItem key={org.id} value={org.id.toString()}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                registerMutation.mutate({
                  competitionId: comp.id,
                  partnerUsername: partnerUsername || undefined,
                  orgId: selectedOrgId && selectedOrgId !== "none" ? Number(selectedOrgId) : undefined,
                });
              }}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? "Registering..." : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Entries Dialog */}
      <Dialog open={showAddEntries} onOpenChange={setShowAddEntries}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Entries</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {events?.map((event) => {
              const alreadyEntered = enteredEventIds.has(event.id);
              return (
                <label
                  key={event.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${
                    alreadyEntered ? "opacity-50" : "hover:bg-accent/50"
                  }`}
                >
                  <Checkbox
                    checked={selectedEventIds.includes(event.id) || alreadyEntered}
                    disabled={alreadyEntered}
                    onCheckedChange={(checked) => {
                      setSelectedEventIds((prev) =>
                        checked
                          ? [...prev, event.id]
                          : prev.filter((id) => id !== event.id),
                      );
                    }}
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{event.name}</span>
                    <div className="flex gap-1 mt-0.5">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {event.style}
                      </Badge>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {event.level}
                      </Badge>
                    </div>
                  </div>
                  {alreadyEntered && (
                    <Check className="size-4 text-green-500 shrink-0 ml-auto" />
                  )}
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!myReg) return;
                // For now, use self as both leader and follower (partner flow TBD)
                bulkCreateEntries.mutate({
                  eventIds: selectedEventIds,
                  leaderRegistrationId: myReg.id,
                  followerRegistrationId: myReg.id,
                });
              }}
              disabled={bulkCreateEntries.isPending || selectedEventIds.length === 0}
            >
              {bulkCreateEntries.isPending
                ? "Adding..."
                : `Add ${selectedEventIds.length} Event${selectedEventIds.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
