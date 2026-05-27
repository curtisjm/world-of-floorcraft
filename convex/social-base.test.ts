import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { buildUserSearchText } from "./lib/search";

// Task 5 of the Convex migration: social identity, profiles, follows, and the
// notification base. These tests pin the behavior ported from the Drizzle/tRPC
// `profile`, `follow`, and `notification` routers.
//
// Clerk identities: `tokenIdentifier` is the stable Convex auth key the user
// helpers index on; `subject` is the raw Clerk user id stored as `clerkUserId`.

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
  name: "Alice Anderson",
  nickname: "alice",
  pictureUrl: "https://img.example.com/alice.png",
};
const BOB = {
  tokenIdentifier: "https://clerk.example.com|user_bob",
  subject: "user_bob",
  name: "Bob Brown",
};
const CAROL = {
  tokenIdentifier: "https://clerk.example.com|user_carol",
  subject: "user_carol",
  name: "Carol Clark",
};

type TestConvex = ReturnType<typeof convexTest>;

/**
 * Insert a `users` row directly, bypassing `ensureCurrentUser`, for tests that
 * need pre-existing users as fixtures.
 */
async function seedUser(
  t: TestConvex,
  identity: { tokenIdentifier: string; subject: string },
  overrides: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    isPrivate?: boolean;
  } = {},
): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      isPrivate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
      searchText: buildUserSearchText(overrides),
    }),
  );
}

// ── users ───────────────────────────────────────────────────────────

describe("users", () => {
  it("ensureCurrentUser creates a user row from the Clerk identity", async () => {
    const t = convexTest(schema, modules);

    const user = await t
      .withIdentity(ALICE)
      .mutation(api.users.ensureCurrentUser, {});

    expect(user.clerkUserId).toBe(ALICE.subject);
    expect(user.tokenIdentifier).toBe(ALICE.tokenIdentifier);
    expect(user.displayName).toBe("Alice Anderson");
    expect(user.username).toBe("alice");
    expect(user.avatarUrl).toBe("https://img.example.com/alice.png");
    expect(user.isPrivate).toBe(false);
  });

  it("ensureCurrentUser is idempotent and never duplicates a user", async () => {
    const t = convexTest(schema, modules);

    const first = await t
      .withIdentity(ALICE)
      .mutation(api.users.ensureCurrentUser, {});
    const second = await t
      .withIdentity(ALICE)
      .mutation(api.users.ensureCurrentUser, {});

    expect(second._id).toEqual(first._id);
    const all = await t.run((ctx) => ctx.db.query("users").collect());
    expect(all).toHaveLength(1);
  });

  it("ensureCurrentUser throws without an identity", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.users.ensureCurrentUser, {}),
    ).rejects.toThrow();
  });

  it("me returns null when the caller has no profile row", async () => {
    const t = convexTest(schema, modules);
    const me = await t.withIdentity(ALICE).query(api.users.me, {});
    expect(me).toBeNull();
  });

  it("me returns the current user's profile", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.ensureCurrentUser, {});

    const me = await t.withIdentity(ALICE).query(api.users.me, {});

    expect(me?.clerkUserId).toBe(ALICE.subject);
  });

  it("needsOnboarding is true when the user has no username", async () => {
    const t = convexTest(schema, modules);
    // BOB's identity has no nickname, so no username is set on creation.
    await t.withIdentity(BOB).mutation(api.users.ensureCurrentUser, {});

    const result = await t
      .withIdentity(BOB)
      .query(api.users.needsOnboarding, {});

    expect(result.needsOnboarding).toBe(true);
  });

  it("needsOnboarding is false when the user has a username", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.ensureCurrentUser, {});

    const result = await t
      .withIdentity(ALICE)
      .query(api.users.needsOnboarding, {});

    expect(result.needsOnboarding).toBe(false);
  });

  it("needsOnboarding is false when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.users.needsOnboarding, {});
    expect(result.needsOnboarding).toBe(false);
  });

  it("updateProfile updates profile fields", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(BOB).mutation(api.users.ensureCurrentUser, {});

    await t.withIdentity(BOB).mutation(api.users.updateProfile, {
      username: "bob_b",
      displayName: "Bobby",
      bio: "I dance",
      isPrivate: true,
    });

    const me = await t.withIdentity(BOB).query(api.users.me, {});
    expect(me?.username).toBe("bob_b");
    expect(me?.displayName).toBe("Bobby");
    expect(me?.bio).toBe("I dance");
    expect(me?.isPrivate).toBe(true);
  });

  it("updateProfile rejects a username already taken by another user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "taken" });
    await t.withIdentity(BOB).mutation(api.users.ensureCurrentUser, {});

    await expect(
      t.withIdentity(BOB).mutation(api.users.updateProfile, {
        username: "taken",
      }),
    ).rejects.toThrow();
  });

  it("updateProfile lets a user re-save their own existing username", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.ensureCurrentUser, {});
    await t.withIdentity(ALICE).mutation(api.users.updateProfile, {
      username: "alice_a",
    });

    await expect(
      t.withIdentity(ALICE).mutation(api.users.updateProfile, {
        username: "alice_a",
        bio: "updated",
      }),
    ).resolves.not.toThrow();
  });

  it("updateProfile rejects competitionLevelHigh below competitionLevel", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.ensureCurrentUser, {});

    await expect(
      t.withIdentity(ALICE).mutation(api.users.updateProfile, {
        competitionLevel: "gold",
        competitionLevelHigh: "bronze",
      }),
    ).rejects.toThrow();
  });

  it("updateProfile rejects an invalid username", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.ensureCurrentUser, {});

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.users.updateProfile, { username: "ab" }),
    ).rejects.toThrow();
    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.users.updateProfile, { username: "bad name" }),
    ).rejects.toThrow();
  });

  it("updateProfile clears a competition level when passed null", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(ALICE).mutation(api.users.ensureCurrentUser, {});
    await t.withIdentity(ALICE).mutation(api.users.updateProfile, {
      competitionLevel: "silver",
    });

    await t.withIdentity(ALICE).mutation(api.users.updateProfile, {
      competitionLevel: null,
    });

    const me = await t.withIdentity(ALICE).query(api.users.me, {});
    expect(me?.competitionLevel).toBeUndefined();
  });
});

// ── profiles ────────────────────────────────────────────────────────

describe("profiles", () => {
  it("getByUsername returns the profile with active follower/following counts", async () => {
    const t = convexTest(schema, modules);
    const bob = await seedUser(t, BOB, { username: "bob" });
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const carol = await seedUser(t, CAROL, { username: "carol" });

    await t.run(async (ctx) => {
      // Alice actively follows Bob; Carol's request is still pending.
      await ctx.db.insert("follows", {
        followerId: alice,
        followingId: bob,
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("follows", {
        followerId: carol,
        followingId: bob,
        status: "pending",
        createdAt: Date.now(),
      });
      // Bob actively follows Carol.
      await ctx.db.insert("follows", {
        followerId: bob,
        followingId: carol,
        status: "active",
        createdAt: Date.now(),
      });
    });

    const profile = await t.query(api.social.profiles.getByUsername, {
      username: "bob",
    });

    expect(profile).not.toBeNull();
    expect(profile?.username).toBe("bob");
    expect(profile?.followerCount).toBe(1);
    expect(profile?.followingCount).toBe(1);
  });

  it("getByUsername returns null for an unknown username", async () => {
    const t = convexTest(schema, modules);
    const profile = await t.query(api.social.profiles.getByUsername, {
      username: "ghost",
    });
    expect(profile).toBeNull();
  });

  it("search matches users by username or display name", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice", displayName: "Alice A" });
    await seedUser(t, BOB, { username: "bobby", displayName: "Bob Brown" });
    await seedUser(t, CAROL, { username: "carol", displayName: "Carol Clark" });

    const byUsername = await t
      .withIdentity(ALICE)
      .query(api.social.profiles.search, { query: "BOB" });
    expect(byUsername.map((u) => u.username)).toContain("bobby");

    const byDisplayName = await t
      .withIdentity(ALICE)
      .query(api.social.profiles.search, { query: "clark" });
    expect(byDisplayName.map((u) => u.username)).toContain("carol");
  });

  it("search excludes the calling user from results", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice", displayName: "Alice A" });

    const results = await t
      .withIdentity(ALICE)
      .query(api.social.profiles.search, { query: "alice" });

    expect(results).toHaveLength(0);
  });

  it("followers lists only active followers", async () => {
    const t = convexTest(schema, modules);
    const bob = await seedUser(t, BOB, { username: "bob" });
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const carol = await seedUser(t, CAROL, { username: "carol" });
    await t.run(async (ctx) => {
      await ctx.db.insert("follows", {
        followerId: alice,
        followingId: bob,
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("follows", {
        followerId: carol,
        followingId: bob,
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const followers = await t.query(api.social.profiles.followers, {
      username: "bob",
    });

    expect(followers.map((u) => u.username)).toEqual(["alice"]);
  });

  it("following lists only active follows", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const carol = await seedUser(t, CAROL, { username: "carol" });
    await t.run(async (ctx) => {
      await ctx.db.insert("follows", {
        followerId: alice,
        followingId: bob,
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("follows", {
        followerId: alice,
        followingId: carol,
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const following = await t.query(api.social.profiles.following, {
      username: "alice",
    });

    expect(following.map((u) => u.username)).toEqual(["bob"]);
  });
});

// ── follows ─────────────────────────────────────────────────────────

describe("follows", () => {
  it("follow on a public user creates an active follow", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob", isPrivate: false });

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    expect(result.status).toBe("active");
  });

  it("follow on a private user creates a pending follow", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob", isPrivate: true });

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    expect(result.status).toBe("pending");
  });

  it("follow rejects following yourself", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.social.follows.follow, { targetUserId: alice }),
    ).rejects.toThrow();
  });

  it("follow rejects an unknown target user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    // A syntactically valid id for a user that was deleted before the call.
    const ghost = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        tokenIdentifier: "ghost",
        clerkUserId: "ghost",
        isPrivate: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.social.follows.follow, { targetUserId: ghost }),
    ).rejects.toThrow();
  });

  it("status returns the current follow state", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });

    const before = await t
      .withIdentity(ALICE)
      .query(api.social.follows.status, { targetUserId: bob });
    expect(before.status).toBeNull();

    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    const after = await t
      .withIdentity(ALICE)
      .query(api.social.follows.status, { targetUserId: bob });
    expect(after.status).toBe("active");
  });

  it("unfollow removes the follow", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.unfollow, { targetUserId: bob });

    const status = await t
      .withIdentity(ALICE)
      .query(api.social.follows.status, { targetUserId: bob });
    expect(status.status).toBeNull();
  });

  it("approve activates a pending follow request", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob", isPrivate: true });
    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, {
        targetUserId: (await t.run((ctx) =>
          ctx.db
            .query("users")
            .withIndex("by_username", (q) => q.eq("username", "bob"))
            .unique(),
        ))!._id,
      });

    await t
      .withIdentity(BOB)
      .mutation(api.social.follows.approve, { requesterId: alice });

    const status = await t
      .withIdentity(ALICE)
      .query(api.social.follows.status, {
        targetUserId: (await t.run((ctx) =>
          ctx.db
            .query("users")
            .withIndex("by_username", (q) => q.eq("username", "bob"))
            .unique(),
        ))!._id,
      });
    expect(status.status).toBe("active");
  });

  it("approve throws when there is no pending request", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });

    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.social.follows.approve, { requesterId: alice }),
    ).rejects.toThrow();
  });

  it("reject removes a pending follow request", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob", isPrivate: true });
    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    await t
      .withIdentity(BOB)
      .mutation(api.social.follows.reject, { requesterId: alice });

    const remaining = await t.run((ctx) =>
      ctx.db.query("follows").collect(),
    );
    expect(remaining).toHaveLength(0);
  });

  it("follow notifies the target user", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });

    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bob))
        .collect(),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("follow");
    expect(notifications[0].actorId).toEqual(alice);
  });

  it("approve notifies the requester", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob", isPrivate: true });
    await t
      .withIdentity(ALICE)
      .mutation(api.social.follows.follow, { targetUserId: bob });

    await t
      .withIdentity(BOB)
      .mutation(api.social.follows.approve, { requesterId: alice });

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", alice))
        .collect(),
    );
    expect(notifications.map((n) => n.type)).toContain("follow_accepted");
  });
});

// ── notifications ───────────────────────────────────────────────────

describe("notifications", () => {
  it("unreadCount counts only unread notifications", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "follow",
        read: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "follow",
        read: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "follow",
        read: true,
        createdAt: Date.now(),
      });
    });

    const count = await t
      .withIdentity(ALICE)
      .query(api.social.notifications.unreadCount, {});

    expect(count).toBe(2);
  });

  it("list returns notifications newest-first with actor info", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "follow",
        actorId: bob,
        read: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "follow_accepted",
        actorId: bob,
        read: false,
        createdAt: Date.now(),
      });
    });

    const result = await t
      .withIdentity(ALICE)
      .query(api.social.notifications.list, {
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result.page).toHaveLength(2);
    // Newest first: the second insert (`follow_accepted`) leads.
    expect(result.page[0].notification.type).toBe("follow_accepted");
    expect(result.page[0].actor?.username).toBe("bob");
  });

  it("markRead marks a single notification as read", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const notificationId = await t.run((ctx) =>
      ctx.db.insert("notifications", {
        userId: alice,
        type: "follow",
        read: false,
        createdAt: Date.now(),
      }),
    );

    await t
      .withIdentity(ALICE)
      .mutation(api.social.notifications.markRead, { notificationId });

    const notification = await t.run((ctx) => ctx.db.get(notificationId));
    expect(notification?.read).toBe(true);
  });

  it("markRead does not affect another user's notification", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const bobNotification = await t.run((ctx) =>
      ctx.db.insert("notifications", {
        userId: bob,
        type: "follow",
        read: false,
        createdAt: Date.now(),
      }),
    );

    await t.withIdentity(ALICE).mutation(api.social.notifications.markRead, {
      notificationId: bobNotification,
    });

    const notification = await t.run((ctx) => ctx.db.get(bobNotification));
    expect(notification?.read).toBe(false);
  });

  it("markAllRead marks every unread notification as read", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "follow",
        read: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("notifications", {
        userId: alice,
        type: "comment",
        read: false,
        createdAt: Date.now(),
      });
    });

    await t
      .withIdentity(ALICE)
      .mutation(api.social.notifications.markAllRead, {});

    const count = await t
      .withIdentity(ALICE)
      .query(api.social.notifications.unreadCount, {});
    expect(count).toBe(0);
  });

  it("createInternal creates a notification for the recipient", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });

    await t.mutation(internal.social.notifications.createInternal, {
      userId: bob,
      type: "follow",
      actorId: alice,
    });

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bob))
        .collect(),
    );
    expect(notifications).toHaveLength(1);
  });

  it("createInternal does not notify a user about their own action", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });

    await t.mutation(internal.social.notifications.createInternal, {
      userId: alice,
      type: "follow",
      actorId: alice,
    });

    const notifications = await t.run((ctx) =>
      ctx.db.query("notifications").collect(),
    );
    expect(notifications).toHaveLength(0);
  });
});
