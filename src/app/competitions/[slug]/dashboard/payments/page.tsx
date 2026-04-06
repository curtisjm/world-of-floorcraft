"use client";

import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Badge } from "@shared/ui/badge";
import { toast } from "sonner";
import { DollarSign, CreditCard, Banknote, CheckCircle2, AlertCircle } from "lucide-react";

export default function PaymentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: summary, isLoading } = trpc.payment.summaryByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );
  const { data: connectStatus } = trpc.payment.getConnectStatus.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const createConnect = trpc.payment.createConnectAccount.useMutation({
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Payments</h2>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Collected</p>
                <p className="text-2xl font-bold">${summary?.totalCollected ?? "0.00"}</p>
              </div>
              <DollarSign className="size-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Owed</p>
                <p className="text-2xl font-bold">${summary?.totalOwed ?? "0.00"}</p>
              </div>
              <Banknote className="size-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Collected</p>
                <p className="text-2xl font-bold">${summary?.netCollected ?? "0.00"}</p>
              </div>
              <CreditCard className="size-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Method Breakdown */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Registrations</span>
                <span className="font-medium">{summary.registrationCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Refunded</span>
                <span className="font-medium">${summary.totalRefunded ?? "0.00"}</span>
              </div>
              {[
                { method: "online", count: summary.onlineCount },
                { method: "cash", count: summary.cashCount },
                { method: "check", count: summary.checkCount },
                { method: "other", count: summary.otherCount },
              ].filter((m) => m.count > 0).map((m) => (
                <div key={m.method} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{m.method}</span>
                  <Badge variant="secondary" className="text-xs">{m.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stripe Connect */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Online Payments (Stripe)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectStatus?.connected ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-500" />
              <span className="text-sm">
                Stripe connected
                {connectStatus.chargesEnabled ? " — charges enabled" : " — pending verification"}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <AlertCircle className="size-5 text-yellow-500" />
                <span className="text-sm">Not connected to Stripe</span>
              </div>
              <Button
                onClick={() => {
                  createConnect.mutate({
                    competitionId: comp.id,
                    refreshUrl: `${window.location.origin}/competitions/${slug}/dashboard/payments`,
                    returnUrl: `${window.location.origin}/competitions/${slug}/dashboard/payments`,
                  });
                }}
                disabled={createConnect.isPending}
              >
                {createConnect.isPending ? "Connecting..." : "Connect Stripe"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
