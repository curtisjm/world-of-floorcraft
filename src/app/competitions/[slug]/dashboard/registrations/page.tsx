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
import { toast } from "sonner";
import { CheckCircle2, Circle, DollarSign, Eye } from "lucide-react";

export default function RegistrationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const [sortBy, setSortBy] = useState<"org" | "name" | "paid" | "checked_in">("name");
  const {
    data: registrations,
    isLoading,
    refetch,
  } = trpc.registration.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0, sortBy },
    { enabled: !!comp },
  );

  const toggleCheckedIn = trpc.registration.toggleCheckedIn.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Check-in updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelRegistration = trpc.registration.cancel.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Registration cancelled");
    },
    onError: (err) => toast.error(err.message),
  });

  const recordManual = trpc.payment.recordManual.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Payment recorded");
      setPaymentReg(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const [paymentReg, setPaymentReg] = useState<any>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payNote, setPayNote] = useState("");

  const [detailReg, setDetailReg] = useState<number | null>(null);
  const { data: regDetail } = trpc.registration.getById.useQuery(
    { registrationId: detailReg ?? 0 },
    { enabled: !!detailReg },
  );

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Registrations ({registrations?.length ?? 0})
        </h2>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort by Name</SelectItem>
            <SelectItem value="org">Sort by Org</SelectItem>
            <SelectItem value="paid">Sort by Payment</SelectItem>
            <SelectItem value="checked_in">Sort by Check-in</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!registrations?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          No registrations yet.
        </div>
      ) : (
        <div className="space-y-1">
          {registrations.map((reg: any) => (
            <div
              key={reg.id}
              className="flex items-center justify-between p-3 rounded-md border hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  className="shrink-0"
                  onClick={() => toggleCheckedIn.mutate({ registrationId: reg.id })}
                  title={reg.checkedIn ? "Uncheck" : "Check in"}
                >
                  {reg.checkedIn ? (
                    <CheckCircle2 className="size-5 text-green-500" />
                  ) : (
                    <Circle className="size-5 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {reg.displayName ?? reg.username ?? "Unknown"}
                    </span>
                    {reg.competitorNumber && (
                      <Badge variant="outline" className="text-xs font-mono">
                        #{reg.competitorNumber}
                      </Badge>
                    )}
                    {reg.orgName && (
                      <span className="text-xs text-muted-foreground">{reg.orgName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{reg.entryCount ?? 0} entries</span>
                    <span>·</span>
                    <span className={reg.amountOwed > reg.totalPaid ? "text-yellow-600" : "text-green-600"}>
                      ${reg.totalPaid ?? "0"} / ${reg.amountOwed ?? "0"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setDetailReg(reg.id)}
                >
                  <Eye className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => {
                    setPaymentReg(reg);
                    setPayAmount(String(Number(reg.amountOwed ?? 0) - Number(reg.totalPaid ?? 0)));
                  }}
                >
                  <DollarSign className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={paymentReg !== null} onOpenChange={() => setPaymentReg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {paymentReg && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                For: {paymentReg.displayName ?? paymentReg.username}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Button
              onClick={() => {
                if (paymentReg) {
                  recordManual.mutate({
                    registrationId: paymentReg.id,
                    amount: payAmount,
                    method: payMethod as any,
                    note: payNote || undefined,
                  });
                }
              }}
              disabled={recordManual.isPending || !payAmount}
            >
              {recordManual.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registration Detail Dialog */}
      <Dialog open={detailReg !== null} onOpenChange={() => setDetailReg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registration Details</DialogTitle>
          </DialogHeader>
          {regDetail ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Competitor</p>
                <p className="font-medium">{(regDetail as any).displayName ?? (regDetail as any).username}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entries ({regDetail.entries?.length ?? 0})</p>
                <div className="space-y-1 mt-1">
                  {regDetail.entries?.map((entry: any) => (
                    <div key={entry.id} className="text-sm flex items-center gap-2">
                      <span>{entry.eventName ?? `Event #${entry.eventId}`}</span>
                      {entry.scratched && <Badge variant="destructive" className="text-xs">Scratched</Badge>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payments</p>
                <div className="space-y-1 mt-1">
                  {regDetail.payments?.length ? (
                    regDetail.payments.map((p: any) => (
                      <div key={p.id} className="text-sm flex items-center justify-between">
                        <span className="capitalize">{p.method}</span>
                        <span>${p.amount}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No payments</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm">Total Paid: ${regDetail.totalPaid ?? "0"}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Cancel this registration?")) {
                      cancelRegistration.mutate({ registrationId: regDetail.id });
                      setDetailReg(null);
                    }
                  }}
                >
                  Cancel Registration
                </Button>
              </div>
            </div>
          ) : (
            <Skeleton className="h-32" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
