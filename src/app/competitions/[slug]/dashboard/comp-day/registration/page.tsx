"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { useCompLiveWithInvalidation } from "@competitions/lib/ably-comp-client";
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

export default function RegistrationTablePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });

  useCompLiveWithInvalidation(comp?.id);

  const utils = trpc.useUtils();

  const { data: orgGroups, isLoading } =
    trpc.registrationTable.getRegistrationTable.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp },
    );

  const { data: pendingAddDrops } =
    trpc.registrationTable.getPendingAddDrops.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp },
    );

  // State
  const [search, setSearch] = useState("");
  const [addDropOpen, setAddDropOpen] = useState(false);
  const [paymentReg, setPaymentReg] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "check" | "other">(
    "cash",
  );
  const [payNote, setPayNote] = useState("");
  const [detailRegId, setDetailRegId] = useState<number | null>(null);

  // Detail query
  const { data: regDetail, isLoading: detailLoading } =
    trpc.registrationTable.getRegistrationDetail.useQuery(
      { registrationId: detailRegId ?? 0 },
      { enabled: !!detailRegId },
    );

  // Mutations
  const checkin = trpc.registrationTable.checkinRegistration.useMutation({
    onSuccess: () => {
      utils.registrationTable.getRegistrationTable.invalidate();
      toast.success("Checked in");
    },
    onError: (err) => toast.error(err.message),
  });

  const undoCheckin = trpc.registrationTable.undoCheckin.useMutation({
    onSuccess: () => {
      utils.registrationTable.getRegistrationTable.invalidate();
      toast.success("Check-in undone");
    },
    onError: (err) => toast.error(err.message),
  });

  const recordPayment = trpc.registrationTable.recordPayment.useMutation({
    onSuccess: () => {
      utils.registrationTable.getRegistrationTable.invalidate();
      toast.success("Payment recorded");
      setPaymentReg(null);
      setPayAmount("");
      setPayNote("");
    },
    onError: (err) => toast.error(err.message),
  });

  const approveAddDrop = trpc.registrationTable.approveAddDrop.useMutation({
    onSuccess: () => {
      utils.registrationTable.getPendingAddDrops.invalidate();
      utils.registrationTable.getRegistrationTable.invalidate();
      toast.success("Request approved");
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectAddDrop = trpc.registrationTable.rejectAddDrop.useMutation({
    onSuccess: () => {
      utils.registrationTable.getPendingAddDrops.invalidate();
      toast.success("Request rejected");
    },
    onError: (err) => toast.error(err.message),
  });

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
        const balance = parseFloat(reg.balance);
        if (balance > 0) outstanding += balance;
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
        <h2 className="text-xl font-semibold tracking-tight">
          Registration Table
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Users className="size-3.5" />
            Total: {stats.total}
          </Badge>
          <Badge
            variant="secondary"
            className="gap-1.5 px-3 py-1 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
          >
            <CheckCircle2 className="size-3.5" />
            Checked In: {stats.checkedIn}
          </Badge>
          {stats.outstanding > 0 && (
            <Badge
              variant="secondary"
              className="gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            >
              <DollarSign className="size-3.5" />
              Outstanding: ${stats.outstanding.toFixed(2)}
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
              <CardContent className="p-0">
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
                      const balance = parseFloat(reg.balance);
                      const isPaid = balance <= 0;
                      return (
                        <TableRow key={reg.id}>
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={reg.checkedIn}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  checkin.mutate({
                                    registrationId: reg.id,
                                  });
                                } else {
                                  undoCheckin.mutate({
                                    registrationId: reg.id,
                                  });
                                }
                              }}
                              disabled={
                                checkin.isPending || undoCheckin.isPending
                              }
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {reg.competitorNumber ?? "\u2014"}
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
                              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                                Paid
                              </span>
                            ) : (
                              <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                                ${balance.toFixed(2)} owed
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
                                  balance > 0 ? balance.toFixed(2) : "",
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
              onClick={() => {
                if (paymentReg) {
                  recordPayment.mutate({
                    registrationId: paymentReg.id,
                    amount: payAmount,
                    method: payMethod,
                    note: payNote || undefined,
                  });
                }
              }}
              disabled={recordPayment.isPending || !payAmount}
            >
              {recordPayment.isPending ? "Recording..." : "Record Payment"}
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
                    {" \u00b7 "}
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
                    {regDetail.entries.map((entry: any) => (
                      <div
                        key={entry.id}
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
                    {regDetail.payments.map((p: any) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-sm rounded-md border px-3 py-1.5"
                      >
                        <span className="capitalize">{p.method}</span>
                        <span className="font-mono">${p.amount}</span>
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
                    {regDetail.addDropRequests.map((r: any) => (
                      <div
                        key={r.id}
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
                  Owed: ${regDetail.registration.amountOwed}
                </span>
                <span>
                  Paid: $
                  {regDetail.payments
                    .reduce(
                      (sum: number, p: any) => sum + parseFloat(p.amount),
                      0,
                    )
                    .toFixed(2)}
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
                    <CheckCircle2 className="size-4 text-green-500" />
                    Safe to approve ({pendingAddDrops.safe.length})
                  </p>
                  <div className="space-y-2">
                    {pendingAddDrops.safe.map((req: any) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
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
                            onClick={() =>
                              approveAddDrop.mutate({ requestId: req.id })
                            }
                            disabled={approveAddDrop.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() =>
                              rejectAddDrop.mutate({ requestId: req.id })
                            }
                            disabled={rejectAddDrop.isPending}
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
                    <XCircle className="size-4 text-amber-500" />
                    Needs review ({pendingAddDrops.needsReview.length})
                  </p>
                  <div className="space-y-2">
                    {pendingAddDrops.needsReview.map((req: any) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 px-3 py-2"
                      >
                        <div className="text-sm">
                          <span className="capitalize font-medium">
                            {req.type}
                          </span>{" "}
                          - Event #{req.eventId}
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Affects active rounds
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={() =>
                              approveAddDrop.mutate({ requestId: req.id })
                            }
                            disabled={approveAddDrop.isPending}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={() =>
                              rejectAddDrop.mutate({ requestId: req.id })
                            }
                            disabled={rejectAddDrop.isPending}
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
