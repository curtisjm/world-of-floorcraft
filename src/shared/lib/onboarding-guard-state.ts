export type OnboardingMaterializationState =
  | "idle"
  | "pending"
  | "ready"
  | "error";

export type OnboardingGuardDecision = {
  renderChildren: boolean;
  showLoading: boolean;
  redirectTo?: "/onboarding";
  errorMessage?: string;
};

type OnboardingGuardInput = {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  materializationState: OnboardingMaterializationState;
  needsOnboarding: boolean | undefined;
  pathname: string;
};

/**
 * Decide whether the root app guard may render page children.
 *
 * Fresh Clerk/Convex users start authenticated before their Convex `users` row
 * exists. Protected page queries call auth helpers that require that row, so
 * children must stay hidden until `ensureCurrentUser` succeeds and the
 * onboarding check has re-read the materialized profile.
 */
export function getOnboardingGuardDecision({
  isAuthLoading,
  isAuthenticated,
  materializationState,
  needsOnboarding,
  pathname,
}: OnboardingGuardInput): OnboardingGuardDecision {
  if (isAuthLoading) {
    return { renderChildren: false, showLoading: true };
  }

  if (!isAuthenticated) {
    return { renderChildren: true, showLoading: false };
  }

  if (materializationState === "error") {
    return {
      renderChildren: false,
      showLoading: false,
      errorMessage: "We couldn't prepare your profile. Refresh to try again.",
    };
  }

  if (materializationState !== "ready" || needsOnboarding === undefined) {
    return { renderChildren: false, showLoading: true };
  }

  if (needsOnboarding && pathname !== "/onboarding") {
    return {
      renderChildren: false,
      showLoading: true,
      redirectTo: "/onboarding",
    };
  }

  return { renderChildren: true, showLoading: false };
}
