import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  getCurrentUser,
  getCurrentUserOrNull,
  requireCurrentUserId,
  requireIdentity,
} from "./auth";

// A Clerk identity. `tokenIdentifier` is the stable Convex auth key the
// helpers index on; `subject` is the raw Clerk user id stored as `clerkUserId`.
const IDENTITY = {
  tokenIdentifier: "https://clerk.example.com|user_test_abc123",
  subject: "user_test_abc123",
};

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: IDENTITY.tokenIdentifier,
      clerkUserId: IDENTITY.subject,
      isPrivate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("auth helpers", () => {
  it("getCurrentUser resolves the signed-in user via the token identifier", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const user = await t
      .withIdentity(IDENTITY)
      .run(async (ctx) => getCurrentUser(ctx));

    expect(user._id).toEqual(userId);
    expect(user.clerkUserId).toEqual(IDENTITY.subject);
  });

  it("requireCurrentUserId returns the Convex user id", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const resolved = await t
      .withIdentity(IDENTITY)
      .run(async (ctx) => requireCurrentUserId(ctx));

    expect(resolved).toEqual(userId);
  });

  it("getCurrentUserOrNull returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);

    const user = await t.run(async (ctx) => getCurrentUserOrNull(ctx));

    expect(user).toBeNull();
  });

  it("getCurrentUserOrNull returns null when the identity has no profile", async () => {
    const t = convexTest(schema, modules);

    const user = await t
      .withIdentity(IDENTITY)
      .run(async (ctx) => getCurrentUserOrNull(ctx));

    expect(user).toBeNull();
  });

  it("requireIdentity throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => requireIdentity(ctx)),
    ).rejects.toThrow();
  });

  it("getCurrentUser throws when the identity has no profile row", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.withIdentity(IDENTITY).run(async (ctx) => getCurrentUser(ctx)),
    ).rejects.toThrow();
  });
});
