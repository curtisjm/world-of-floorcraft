"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

/**
 * Redirects signed-in users without a username to `/onboarding`. Also
 * materializes the Convex `users` row the first time a Clerk-authenticated
 * user reaches the app — replacing the old `protectedProcedure`/`ensureUser`
 * side effect that ran on every tRPC call.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();

  const ensureCurrentUser = useMutation(api.users.ensureCurrentUser);
  const needsOnboarding = useQuery(
    api.users.needsOnboarding,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (isAuthenticated) {
      // Idempotent on the server; safe to fire on every auth transition.
      void ensureCurrentUser({}).catch(() => {});
    }
  }, [isAuthenticated, ensureCurrentUser]);

  useEffect(() => {
    if (needsOnboarding?.needsOnboarding && pathname !== "/onboarding") {
      router.push("/onboarding");
    }
  }, [needsOnboarding, pathname, router]);

  return <>{children}</>;
}
