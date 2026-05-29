"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  getOnboardingGuardDecision,
  type OnboardingMaterializationState,
} from "@shared/lib/onboarding-guard-state";

/**
 * Redirects signed-in users without a username to `/onboarding`. Also
 * materializes the Convex `users` row the first time a Clerk-authenticated
 * user reaches the app — replacing the old `protectedProcedure`/`ensureUser`
 * side effect that ran on every tRPC call.
 */
function OnboardingGuardLoading() {
  return (
    <div className="flex min-h-[calc(100vh-73px)] items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const [materializationState, setMaterializationState] =
    useState<OnboardingMaterializationState>("idle");

  const ensureCurrentUser = useMutation(api.users.ensureCurrentUser);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!isAuthenticated) {
      setMaterializationState("idle");
      return;
    }

    let cancelled = false;
    setMaterializationState("pending");

    // Idempotent on the server; keep protected children hidden until the row
    // exists so first-login page queries cannot race and throw profile errors.
    void ensureCurrentUser({})
      .then(() => {
        if (!cancelled) setMaterializationState("ready");
      })
      .catch(() => {
        if (!cancelled) setMaterializationState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isAuthenticated, ensureCurrentUser]);

  const needsOnboarding = useQuery(
    api.users.needsOnboarding,
    isAuthenticated && materializationState === "ready" ? {} : "skip",
  );

  const decision = getOnboardingGuardDecision({
    isAuthLoading,
    isAuthenticated,
    materializationState,
    needsOnboarding: needsOnboarding?.needsOnboarding,
    pathname,
  });

  useEffect(() => {
    if (decision.redirectTo) {
      router.push(decision.redirectTo);
    }
  }, [decision.redirectTo, router]);

  if (decision.errorMessage) {
    return (
      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 text-center">
        <p className="text-sm text-destructive">{decision.errorMessage}</p>
      </div>
    );
  }

  if (decision.showLoading) {
    return <OnboardingGuardLoading />;
  }

  return decision.renderChildren ? <>{children}</> : null;
}
