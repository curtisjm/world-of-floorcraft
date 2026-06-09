import { describe, expect, it } from "vitest";
import { getOnboardingGuardDecision } from "../src/shared/lib/onboarding-guard-state";

describe("onboarding guard state", () => {
  it("blocks protected children while a fresh authenticated user is being materialized", () => {
    const decision = getOnboardingGuardDecision({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      isConvexAuthLoading: false,
      isConvexAuthenticated: true,
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
      isClerkLoaded: true,
      isClerkSignedIn: true,
      isConvexAuthLoading: false,
      isConvexAuthenticated: true,
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
      isClerkLoaded: true,
      isClerkSignedIn: true,
      isConvexAuthLoading: false,
      isConvexAuthenticated: true,
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
      isClerkLoaded: true,
      isClerkSignedIn: false,
      isConvexAuthLoading: false,
      isConvexAuthenticated: false,
      materializationState: "idle",
      needsOnboarding: undefined,
      pathname: "/",
    });

    expect(decision.renderChildren).toBe(true);
    expect(decision.showLoading).toBe(false);
  });

  it("blocks signed-in children when Convex cannot authenticate the Clerk session", () => {
    const decision = getOnboardingGuardDecision({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      isConvexAuthLoading: false,
      isConvexAuthenticated: false,
      materializationState: "idle",
      needsOnboarding: undefined,
      pathname: "/competitions/create",
    });

    expect(decision.renderChildren).toBe(false);
    expect(decision.showLoading).toBe(false);
    expect(decision.errorMessage).toMatch(/verify your session/);
  });

  it("waits while Convex auth is still resolving for a signed-in Clerk user", () => {
    const decision = getOnboardingGuardDecision({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      isConvexAuthLoading: true,
      isConvexAuthenticated: false,
      materializationState: "idle",
      needsOnboarding: undefined,
      pathname: "/competitions/create",
    });

    expect(decision.renderChildren).toBe(false);
    expect(decision.showLoading).toBe(true);
    expect(decision.errorMessage).toBeUndefined();
  });
});
