"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Badge } from "@shared/ui/badge";
import { toast } from "sonner";
import { DollarSign, CreditCard, Banknote, CheckCircle2, AlertCircle } from "lucide-react";

export default function PaymentsPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const summary = useQuery(
    api.competitions.payments.summaryByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );
  const connectStatus = useQuery(
    api.competitions.payments.getConnectStatusRecord,
    comp ? { competitionId: comp._id } : "skip",
  );

  const createConnectAction = useAction(
    api.competitions.stripeActions.createConnectAccount,
  );
  const [connecting, setConnecting] = useState(false);

  const isLoading = comp === undefined || summary === undefined;

  if (isLoading || !comp) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-none" />
          ))}
        </div>
      </div>
    );
  }

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await createConnectAction({
        competitionId: comp._id,
        refreshUrl: `${window.location.origin}/competitions/${slug}/dashboard/payments`,
        returnUrl: `${window.location.origin}/competitions/${slug}/dashboard/payments`,
      });
      if (result.url) {
        window.location.href = result.url;
      } else {
        toast.error("Stripe returned an empty onboarding URL");
        setConnecting(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start Stripe onboarding");
      setConnecting(false);
    }
  };

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
              <DollarSign className="size-8 text-sage/70" />
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
              <Banknote className="size-8 text-clay/70" />
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
              <CreditCard className="size-8 text-muted-foreground" />
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
              <CheckCircle2 className="size-5 text-sage" />
              <span className="text-sm">
                Stripe connected
                {connectStatus.onboardingComplete
                  ? " — charges enabled"
                  : " — pending verification"}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <AlertCircle className="size-5 text-clay" />
                <span className="text-sm">Not connected to Stripe</span>
              </div>
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? "Connecting..." : "Connect Stripe"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
