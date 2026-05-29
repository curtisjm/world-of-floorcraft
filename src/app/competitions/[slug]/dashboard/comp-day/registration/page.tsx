"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { cn } from "@shared/lib/utils";
import { Button } from "@shared/ui/button";
import { Input } from "@shared/ui/input";
import { Label } from "@shared/ui/label";
import { Badge } from "@shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Checkbox } from "@shared/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shared/ui/table";
import { toast } from "sonner";
import {
  Search,
  DollarSign,
  CheckCircle2,
  XCircle,
  Users,
  FileText,
} from "lucide-react";

type RegRow = {
  id: Id<"competitionRegistrations">;
  displayName: string | undefined;
  competitorNumber: number | undefined;
  balance: number; // cents
  checkedIn: boolean;
  entryCount: number;
};

export default function RegistrationTablePage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug, includeArchived: true });

  const orgGroups = useQuery(
    api.competitions.compDay.getRegistrationTable,
    comp ? { competitionId: comp._id } : "skip",
  );
  const pendingAddDrops = useQuery(
    api.competitions.compDay.getPendingAddDrops,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = orgGroups === undefined;

  // State
  const [search, setSearch] = useState("");
  const [addDropOpen, setAddDropOpen] = useState(false);
  const [paymentReg, setPaymentReg] = useState<RegRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "check" | "other">(
    "cash",
  );
  const [payNote, setPayNote] = useState("");
  const [detailRegId, setDetailRegId] =
    useState<Id<"competitionRegistrations"> | null>(null);

  // Detail query
  const regDetail = useQuery(
    api.competitions.compDay.getRegistrationDetail,
    detailRegId ? { registrationId: detailRegId } : "skip",
  );
  const detailLoading = detailRegId !== null && regDetail === undefined;

  // Mutations
  const checkinMutation = useMutation(
    api.competitions.compDay.checkinRegistration,
  );
  const undoCheckinMutation = useMutation(
    api.competitions.compDay.undoCheckin,
  );
  const recordPaymentMutation = useMutation(
    api.competitions.compDay.recordOfflinePayment,
  );
  const approveAddDropMutation = useMutation(
    api.competitions.compDay.approveAddDrop,
  );
  const rejectAddDropMutation = useMutation(
    api.competitions.compDay.rejectAddDrop,
  );

  const [actionPending, setActionPending] = useState(false);

  async function handleCheckin(registrationId: Id<"competitionRegistrations">) {
    setActionPending(true);
    try {
      await checkinMutation({ registrationId });
      toast.success("Checked in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleUndoCheckin(
    registrationId: Id<"competitionRegistrations">,
  ) {
    setActionPending(true);
    try {
      await undoCheckinMutation({ registrationId });
      toast.success("Check-in undone");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleRecordPayment() {
    if (!paymentReg) return;
    setActionPending(true);
    try {
      await recordPaymentMutation({
        registrationId: paymentReg.id,
        amount: payAmount,
        method: payMethod,
        note: payNote || undefined,
      });
      toast.success("Payment recorded");
      setPaymentReg(null);
      setPayAmount("");
      setPayNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleApprove(requestId: Id<"addDropRequests">) {
    setActionPending(true);
    try {
      await approveAddDropMutation({ requestId });
      toast.success("Request approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setActionPending(false);
    }
  }

  async function handleReject(requestId: Id<"addDropRequests">) {
    setActionPending(true);
    try {
      await rejectAddDropMutation({ requestId });
      toast.success("Request rejected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActionPending(false);
    }
  }

  // Computed stats
  const stats = useMemo(() => {
    if (!orgGroups) return { total: 0, checkedIn: 0, outstanding: 0 };
    let total = 0;
    let checkedIn = 0;
    let outstanding = 0;
    for (const group of orgGroups) {
      for (const reg of group.registrations) {
        total++;
        if (reg.checkedIn) checkedIn++;
        if (reg.balance > 0) outstanding += reg.balance;
      }
    }
    return { total, checkedIn, outstanding };
  }, [orgGroups]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!orgGroups) return [];
    const q = search.toLowerCase().trim();
    if (!q) return orgGroups;
    return orgGroups
      .map((group) => ({
        ...group,
        registrations: group.registrations.filter((r) =>
          r.displayName?.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.registrations.length > 0);
  }, [orgGroups, search]);

  const pendingCount =
    (pendingAddDrops?.safe.length ?? 0) +
    (pendingAddDrops?.needsReview.length ?? 0);

  // Loading state
  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
            Registration
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Users className="size-3.5" />
            Total: {stats.total}
          </Badge>
          <Badge
            variant="secondary"
            className="status-sage gap-1.5 px-3 py-1"
          >
            <CheckCircle2 className="size-3.5" />
            Checked In: {stats.checkedIn}
          </Badge>
          {stats.outstanding > 0 && (
            <Badge
              variant="secondary"
              className="status-clay gap-1.5 px-3 py-1"
            >
              <DollarSign className="size-3.5" />
              Outstanding: ${(stats.outstanding / 100).toFixed(2)}
            </Badge>
          )}
        </div>
      </div>

      {/* Search + Add/Drop button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          className="gap-2 shrink-0"
          onClick={() => setAddDropOpen(true)}
        >
          <FileText className="size-4" />
          Add/Drops
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="ml-1 h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full"
            >
              {pendingCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Main table */}
      {filteredGroups.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {search ? "No competitors match your search." : "No registrations yet."}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <Card key={group.orgId ?? "unaffiliated"}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {group.orgName} ({group.registrations.length})
                </CardTitle>
              </CardHeader>
              {/* Desktop/tablet table view */}
              <CardContent className="hidden sm:block p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 pl-4">In</TableHead>
                      <TableHead className="w-20">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-20 text-center">
                        Entries
                      </TableHead>
                      <TableHead className="w-32 text-right">
                        Payment
                      </TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.registrations.map((reg) => {
                      const balanceDollars = reg.balance / 100;
                      const isPaid = balanceDollars <= 0;
                      return (
                        <TableRow key={reg.id}>
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={reg.checkedIn}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleCheckin(reg.id);
                                } else {
                                  handleUndoCheckin(reg.id);
                                }
                              }}
                              disabled={actionPending}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {reg.competitorNumber ?? "—"}
                          </TableCell>
                          <TableCell>
                            <button
                              className="text-sm font-medium hover:underline text-left"
                              onClick={() => setDetailRegId(reg.id)}
                            >
                              {reg.displayName ?? "Unknown"}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {reg.entryCount}
                          </TableCell>
                          <TableCell className="text-right">
                            {isPaid ? (
                              <span className="text-sm font-medium text-status-sage">
                                Paid
                              </span>
                            ) : (
                              <span className="text-sm font-medium text-status-clay">
                                ${balanceDollars.toFixed(2)} owed
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => {
                                setPaymentReg(reg);
                                setPayAmount(
                                  balanceDollars > 0
                                    ? balanceDollars.toFixed(2)
                                    : "",
                                );
                                setPayMethod("cash");
                                setPayNote("");
                              }}
                            >
                              <DollarSign className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>

              {/* Mobile card view */}
              <CardContent className="sm:hidden px-3 pb-3 pt-0 space-y-2">
                {group.registrations.map((reg) => {
                  const balanceDollars = reg.balance / 100;
                  const isPaid = balanceDollars <= 0;
                  return (
                    <div
                      key={reg.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3",
                        reg.checkedIn && "status-sage",
                      )}
                    >
                      <Checkbox
                        checked={reg.checkedIn}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleCheckin(reg.id);
                          } else {
                            handleUndoCheckin(reg.id);
                          }
                        }}
                        disabled={actionPending}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0" onClick={() => setDetailRegId(reg.id)}>
                        <div className="flex items-center gap-2">
                          {reg.competitorNumber != null && (
                            <span className="font-mono text-xs text-muted-foreground">
                              #{reg.competitorNumber}
                            </span>
                          )}
                          <span className="text-sm font-medium truncate">
                            {reg.displayName ?? "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>{reg.entryCount} entries</span>
                          <span>·</span>
                          {isPaid ? (
                            <span className="font-medium text-status-sage">
                              Paid
                            </span>
                          ) : (
                            <span className="font-medium text-status-clay">
                              ${balanceDollars.toFixed(2)} owed
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => {
                          setPaymentReg(reg);
                          setPayAmount(
                            balanceDollars > 0
                              ? balanceDollars.toFixed(2)
                              : "",
                          );
                          setPayMethod("cash");
                          setPayNote("");
                        }}
                      >
                        <DollarSign className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Record Payment Dialog */}
      <Dialog
        open={paymentReg !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentReg(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentReg && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For:{" "}
                <span className="font-medium text-foreground">
                  {paymentReg.displayName}
                </span>
                {paymentReg.competitorNumber && (
                  <span className="ml-2 font-mono">
                    #{paymentReg.competitorNumber}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select
                    value={payMethod}
                    onValueChange={(v) =>
                      setPayMethod(v as "cash" | "check" | "other")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Paid at door"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentReg(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={actionPending || !payAmount}
            >
              {actionPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registration Detail Dialog */}
      <Dialog
        open={detailRegId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRegId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registration Details</DialogTitle>
          </DialogHeader>
          {detailLoading || !regDetail ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Competitor info */}
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium">
                    {regDetail.user?.displayName ?? "Unknown"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {regDetail.registration.competitorNumber
                      ? `#${regDetail.registration.competitorNumber}`
                      : "No number assigned"}
                    {" · "}
                    {regDetail.registration.checkedIn
                      ? "Checked in"
                      : "Not checked in"}
                  </p>
                </div>
              </div>

              {/* Entries */}
              <div>
                <p className="text-sm font-medium mb-2">
                  Entries ({regDetail.entries.length})
                </p>
                {regDetail.entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No entries</p>
                ) : (
                  <div className="space-y-1">
                    {regDetail.entries.map((entry) => (
                      <div
                        key={entry._id}
                        className="flex items-center justify-between text-sm rounded-md border px-3 py-1.5"
                      >
                        <span>
                          Event #{entry.eventId}
                        </span>
                        {entry.scratched && (
                          <Badge variant="destructive" className="text-xs">
                            Scratched
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payments */}
              <div>
                <p className="text-sm font-medium mb-2">Payments</p>
                {regDetail.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded
                  </p>
                ) : (
                  <div className="space-y-1">
                    {regDetail.payments.map((p) => (
                      <div
                        key={p._id}
                        className="flex items-center justify-between text-sm rounded-md border px-3 py-1.5"
                      >
                        <span className="capitalize">{p.method}</span>
                        <span className="font-mono">
                          ${(p.amount / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add/Drop history */}
              {regDetail.addDropRequests.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Add/Drop Requests</p>
                  <div className="space-y-1">
                    {regDetail.addDropRequests.map((r) => (
                      <div
                        key={r._id}
                        className="flex items-center justify-between text-sm rounded-md border px-3 py-1.5"
                      >
                        <span className="capitalize">
                          {r.type} - Event #{r.eventId}
                        </span>
                        <Badge
                          variant={
                            r.status === "approved"
                              ? "default"
                              : r.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Balance summary */}
              <div className="flex items-center justify-between pt-2 border-t text-sm">
                <span>
                  Owed: ${(regDetail.registration.amountOwed / 100).toFixed(2)}
                </span>
                <span>
                  Paid: $
                  {(
                    regDetail.payments.reduce((sum, p) => sum + p.amount, 0) /
                    100
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pending Add/Drops Dialog */}
      <Dialog open={addDropOpen} onOpenChange={setAddDropOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pending Add/Drop Requests</DialogTitle>
          </DialogHeader>
          {!pendingAddDrops ||
          (pendingAddDrops.safe.length === 0 &&
            pendingAddDrops.needsReview.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No pending requests.
            </p>
          ) : (
            <div className="space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Safe requests */}
              {pendingAddDrops.safe.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-status-sage" />
                    Safe to approve ({pendingAddDrops.safe.length})
                  </p>
                  <div className="space-y-2">
                    {pendingAddDrops.safe.map((req) => (
                      <div
                        key={req._id}
                        className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="text-sm">
                          <span className="capitalize font-medium">
                            {req.type}
                          </span>{" "}
                          - Event #{req.eventId}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => handleApprove(req._id)}
                            disabled={actionPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() => handleReject(req._id)}
                            disabled={actionPending}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Needs review */}
              {pendingAddDrops.needsReview.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <XCircle className="size-4 text-status-clay" />
                    Needs review ({pendingAddDrops.needsReview.length})
                  </p>
                  <div className="space-y-2">
                    {pendingAddDrops.needsReview.map((req) => (
                      <div
                        key={req._id}
                        className="status-clay flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="text-sm">
                          <span className="capitalize font-medium">
                            {req.type}
                          </span>{" "}
                          - Event #{req.eventId}
                          <p className="text-xs text-status-clay">
                            Affects active rounds
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() => handleApprove(req._id)}
                            disabled={actionPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() => handleReject(req._id)}
                            disabled={actionPending}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
