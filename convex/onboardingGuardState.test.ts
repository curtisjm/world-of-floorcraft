import { describe, expect, it } from "vitest";
import { getOnboardingGuardDecision } from "../src/shared/lib/onboarding-guard-state";

describe("onboarding guard state", () => {
  it("blocks protected children while a fresh authenticated user is being materialized", () => {
    const decision = getOnboardingGuardDecision({
      isAuthLoading: false,
      isAuthenticated: true,
      materializationState: "pending",
      needsOnboarding: undefined,
      pathname: "/partners",
    });

    expect(decision.renderChildren).toBe(false);
    expect(decision.showLoading).toBe(true);
    expect(decision.redirectTo).toBeUndefined();
  });

  it("keeps protected children hidden while redirecting users without usernames", () => {
    const decision = getOnboardingGuardDecision({
      isAuthLoading: false,
      isAuthenticated: true,
      materializationState: "ready",
      needsOnboarding: true,
      pathname: "/partners",
    });

    expect(decision.renderChildren).toBe(false);
    expect(decision.showLoading).toBe(true);
    expect(decision.redirectTo).toBe("/onboarding");
  });

  it("allows the onboarding route once materialization has completed", () => {
    const decision = getOnboardingGuardDecision({
      isAuthLoading: false,
      isAuthenticated: true,
      materializationState: "ready",
      needsOnboarding: true,
      pathname: "/onboarding",
    });

    expect(decision.renderChildren).toBe(true);
    expect(decision.showLoading).toBe(false);
    expect(decision.redirectTo).toBeUndefined();
  });

  it("allows children for unauthenticated routes", () => {
    const decision = getOnboardingGuardDecision({
      isAuthLoading: false,
      isAuthenticated: false,
      materializationState: "idle",
      needsOnboarding: undefined,
      pathname: "/",
    });

    expect(decision.renderChildren).toBe(true);
    expect(decision.showLoading).toBe(false);
  });
});
