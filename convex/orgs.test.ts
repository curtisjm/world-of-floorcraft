import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Task 6 of the Convex migration: organizations, memberships, invites, and
// join requests. These tests pin the behavior ported from the Drizzle/tRPC
// `org`, `membership`, `invite`, and `joinRequest` routers and verify that
// org-channel membership effects on `conversations` / `conversationMembers`
// are preserved end-to-end (the messaging Convex functions land in Task 8).

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
  name: "Alice Anderson",
  nickname: "alice",
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
const DAVE = {
  tokenIdentifier: "https://clerk.example.com|user_dave",
  subject: "user_dave",
  name: "Dave Davis",
};

type T = TestConvex<typeof schema>;

async function seedUser(
  t: T,
  identity: { tokenIdentifier: string; subject: string },
  overrides: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
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
    }),
  );
}

/**
 * Find the "General" org channel for an org. Org channels are how messaging
 * currently maps org membership to chat membership; these tests assert that
 * org mutations keep the channel/member rows in sync.
 */
async function findOrgChannel(
  t: T,
  orgId: Id<"organizations">,
): Promise<Id<"conversations"> | null> {
  return t.run(async (ctx) => {
    const channels = await ctx.db
      .query("conversations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return channels.find((c) => c.type === "org_channel")?._id ?? null;
  });
}

async function isInOrgChannel(
  t: T,
  conversationId: Id<"conversations">,
  userId: Id<"users">,
): Promise<boolean> {
  const member = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", userId),
      )
      .unique(),
  );
  return member !== null;
}

// ── create / update / remove ────────────────────────────────────────

describe("organization lifecycle", () => {
  it("create inserts org, owner membership, and a General channel", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });

    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    expect(org.name).toBe("Studio One");
    expect(org.slug).toBe("studio-one");
    expect(org.membershipModel).toBe("open");

    const memberships = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) => q.eq("orgId", org._id))
        .collect(),
    );
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("admin");
    expect(memberships[0].userId).toBe(org.ownerId);

    const channelId = await findOrgChannel(t, org._id);
    expect(channelId).not.toBeNull();
    expect(await isInOrgChannel(t, channelId!, org.ownerId)).toBe(true);
  });

  it("create uses the supplied slug when provided", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });

    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Some Other Studio",
        slug: "snappy-studio",
      });

    expect(org.slug).toBe("snappy-studio");
  });

  it("create rejects a duplicate slug", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.orgs.create, { name: "Studio One" }),
    ).rejects.toThrow();
  });

  it("create requires authentication", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.orgs.create, { name: "Ghost Studio" }),
    ).rejects.toThrow();
  });

  it("update applies provided fields and ignores others", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    const updated = await t.withIdentity(ALICE).mutation(api.orgs.update, {
      orgId: org._id,
      name: "Studio Uno",
      description: "Best studio",
      membershipModel: "request",
    });

    expect(updated?.name).toBe("Studio Uno");
    expect(updated?.description).toBe("Best studio");
    expect(updated?.membershipModel).toBe("request");
  });

  it("update lets a non-owner admin edit", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(BOB)
      .mutation(api.orgs.create, { name: "Bob's Studio" });
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        orgId: org._id,
        userId: aliceId,
        role: "admin",
        createdAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.update, {
        orgId: org._id,
        name: "Renamed",
      }),
    ).resolves.toBeDefined();
  });

  it("update forbids a plain member", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(BOB)
      .mutation(api.orgs.create, { name: "Bob's Studio" });
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        orgId: org._id,
        userId: aliceId,
        role: "member",
        createdAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.update, {
        orgId: org._id,
        name: "Hacked",
      }),
    ).rejects.toThrow();
  });

  it("remove deletes org and all dependent rows", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        orgId: org._id,
        userId: bobId,
        role: "member",
        createdAt: Date.now(),
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("orgInvites", {
        orgId: org._id,
        invitedUserId: bobId,
        invitedBy: org.ownerId,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("joinRequests", {
        orgId: org._id,
        userId: bobId,
        status: "pending",
        createdAt: Date.now(),
      }),
    );

    await t
      .withIdentity(ALICE)
      .mutation(api.orgs.remove, { orgId: org._id });

    const removed = await t.run((ctx) => ctx.db.get(org._id));
    expect(removed).toBeNull();

    const remainingMemberships = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) => q.eq("orgId", org._id))
        .collect(),
    );
    expect(remainingMemberships).toHaveLength(0);

    const remainingInvites = await t.run((ctx) =>
      ctx.db
        .query("orgInvites")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .collect(),
    );
    expect(remainingInvites).toHaveLength(0);

    const remainingConversations = await t.run((ctx) =>
      ctx.db
        .query("conversations")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .collect(),
    );
    expect(remainingConversations).toHaveLength(0);
  });

  it("remove forbids non-owners (even admins)", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(BOB)
      .mutation(api.orgs.create, { name: "Bob's Studio" });
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        orgId: org._id,
        userId: aliceId,
        role: "admin",
        createdAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.remove, { orgId: org._id }),
    ).rejects.toThrow();
  });

  it("remove is blocked by competitions that reference the org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    await t.run((ctx) =>
      ctx.db.insert("competitions", {
        orgId: org._id,
        createdBy: org.ownerId,
        name: "Spring Invitational",
        slug: "spring-invitational",
        status: "draft",
        pricingModel: "flat_fee",
        requirePaymentAtRegistration: false,
        stripeOnboardingComplete: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.remove, { orgId: org._id }),
    ).rejects.toThrow(/competitions/);
    expect(await t.run((ctx) => ctx.db.get(org._id))).not.toBeNull();
  });

  it("remove is blocked by org posts that reference the org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    await t.run((ctx) =>
      ctx.db.insert("posts", {
        orgId: org._id,
        type: "article",
        visibility: "public",
        title: "News",
        body: "Post body",
        publishedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.remove, { orgId: org._id }),
    ).rejects.toThrow(/posts/);
    expect(await t.run((ctx) => ctx.db.get(org._id))).not.toBeNull();
  });
});

// ── discover / listUserOrgs / getBySlug ─────────────────────────────

describe("organization listings", () => {
  it("discover returns the newest orgs first with member counts", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const first = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "First" });
    const second = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Second" });

    const result = await t.query(api.orgs.discover, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(2);
    expect(result.page[0]._id).toBe(second._id);
    expect(result.page[1]._id).toBe(first._id);
    expect(result.page[0].memberCount).toBe(1);
  });

  it("listUserOrgs returns the caller's memberships with role", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const aliceOrg = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    const bobOrg = await t
      .withIdentity(BOB)
      .mutation(api.orgs.create, { name: "Studio Two" });

    const aliceOrgs = await t
      .withIdentity(ALICE)
      .query(api.orgs.listUserOrgs, {});
    expect(aliceOrgs.map((o) => o._id)).toEqual([aliceOrg._id]);
    expect(aliceOrgs[0].role).toBe("admin");

    const bobOrgs = await t
      .withIdentity(BOB)
      .query(api.orgs.listUserOrgs, {});
    expect(bobOrgs.map((o) => o._id)).toEqual([bobOrg._id]);
  });

  it("getBySlug returns the org with a member count", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    const fetched = await t.query(api.orgs.getBySlug, { slug: org.slug });
    expect(fetched?._id).toBe(org._id);
    expect(fetched?.memberCount).toBe(1);
  });

  it("getBySlug returns null for an unknown slug", async () => {
    const t = convexTest(schema, modules);
    const fetched = await t.query(api.orgs.getBySlug, { slug: "ghost" });
    expect(fetched).toBeNull();
  });
});

// ── join / leave / role / transfer ──────────────────────────────────

describe("membership flows", () => {
  it("join an open org adds membership and channel membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    const memberships = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .collect(),
    );
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("member");

    const channelId = await findOrgChannel(t, org._id);
    expect(await isInOrgChannel(t, channelId!, bobId)).toBe(true);
  });

  it("join rejects invite-only and request orgs", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const inviteOnly = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Invite Only",
        membershipModel: "invite",
      });
    const requestOnly = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Request Only",
        slug: "request-only",
        membershipModel: "request",
      });

    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.orgs.join, { orgId: inviteOnly._id }),
    ).rejects.toThrow();
    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.orgs.join, { orgId: requestOnly._id }),
    ).rejects.toThrow();
  });

  it("join is rejected when already a member", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    await expect(
      t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id }),
    ).rejects.toThrow();
  });

  it("leave removes membership and org channel membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    await t.withIdentity(BOB).mutation(api.orgs.leave, { orgId: org._id });

    const remaining = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .collect(),
    );
    expect(remaining).toHaveLength(0);

    const channelId = await findOrgChannel(t, org._id);
    expect(await isInOrgChannel(t, channelId!, bobId)).toBe(false);
  });

  it("owner cannot leave their own org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.leave, { orgId: org._id }),
    ).rejects.toThrow();
  });

  it("updateRole promotes a member to admin", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    await t.withIdentity(ALICE).mutation(api.orgs.updateRole, {
      orgId: org._id,
      targetUserId: bobId,
      role: "admin",
    });

    const membership = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .unique(),
    );
    expect(membership?.role).toBe("admin");
  });

  it("updateRole refuses to change the owner's role", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.updateRole, {
        orgId: org._id,
        targetUserId: org.ownerId,
        role: "member",
      }),
    ).rejects.toThrow();
  });

  it("transferOwnership moves ownership to an existing admin", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });
    await t.withIdentity(ALICE).mutation(api.orgs.updateRole, {
      orgId: org._id,
      targetUserId: bobId,
      role: "admin",
    });

    await t.withIdentity(ALICE).mutation(api.orgs.transferOwnership, {
      orgId: org._id,
      newOwnerId: bobId,
    });

    const updated = await t.run((ctx) => ctx.db.get(org._id));
    expect(updated?.ownerId).toBe(bobId);
  });

  it("transferOwnership rejects a non-admin candidate", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    await expect(
      t.withIdentity(ALICE).mutation(api.orgs.transferOwnership, {
        orgId: org._id,
        newOwnerId: bobId,
      }),
    ).rejects.toThrow();
  });

  it("listMembers requires membership and annotates owner", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    await expect(
      t.withIdentity(CAROL).query(api.orgs.listMembers, { orgId: org._id }),
    ).rejects.toThrow();

    const members = await t
      .withIdentity(BOB)
      .query(api.orgs.listMembers, { orgId: org._id });
    expect(members).toHaveLength(2);
    const owner = members.find((m) => m.userId === org.ownerId);
    expect(owner?.isOwner).toBe(true);
    const bob = members.find((m) => m.userId === bobId);
    expect(bob?.isOwner).toBe(false);
    // Carol is not a member, so listMembers must omit her.
    expect(members.find((m) => m.userId === carolId)).toBeUndefined();
  });
});

// ── invites ─────────────────────────────────────────────────────────

describe("invites", () => {
  it("sendInvite creates a pending invite and notifies the recipient", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "invite",
      });

    const invite = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId });

    expect(invite?.status).toBe("pending");
    expect(invite?.invitedUserId).toBe(bobId);

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bobId))
        .collect(),
    );
    expect(notifications.map((n) => n.type)).toContain("org_invite");
  });

  it("sendInvite rejects duplicate pending invites", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t
      .withIdentity(ALICE)
      .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId }),
    ).rejects.toThrow();
  });

  it("sendInvite rejects existing members", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t.withIdentity(BOB).mutation(api.orgs.join, { orgId: org._id });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId }),
    ).rejects.toThrow();
  });

  it("acceptInvite via inviteId marks the invite accepted", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    const invite = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId });

    await t
      .withIdentity(BOB)
      .mutation(api.orgs.acceptInvite, { inviteId: invite!._id });

    const fresh = await t.run((ctx) => ctx.db.get(invite!._id));
    expect(fresh?.status).toBe("accepted");

    const membership = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .unique(),
    );
    expect(membership).not.toBeNull();
    const channelId = await findOrgChannel(t, org._id);
    expect(await isInOrgChannel(t, channelId!, bobId)).toBe(true);
  });

  it("declineInvite marks the invite declined and creates no membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    const invite = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId });

    await t
      .withIdentity(BOB)
      .mutation(api.orgs.declineInvite, { inviteId: invite!._id });

    const fresh = await t.run((ctx) => ctx.db.get(invite!._id));
    expect(fresh?.status).toBe("declined");
    const memberships = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .collect(),
    );
    expect(memberships).toHaveLength(0);
  });

  it("generateInviteLink + acceptInvite via token adds membership and keeps the invite pending", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    const linkInvite = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.generateInviteLink, { orgId: org._id });
    expect(linkInvite?.token).toBeDefined();

    await t
      .withIdentity(BOB)
      .mutation(api.orgs.acceptInvite, { token: linkInvite!.token! });

    const fresh = await t.run((ctx) => ctx.db.get(linkInvite!._id));
    // Link invites are reusable, so they stay pending after acceptance.
    expect(fresh?.status).toBe("pending");

    const membership = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .unique(),
    );
    expect(membership).not.toBeNull();
  });

  it("acceptInvite rejects an expired invite", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    const inviteId = await t.run((ctx) =>
      ctx.db.insert("orgInvites", {
        orgId: org._id,
        invitedUserId: bobId,
        invitedBy: org.ownerId,
        status: "pending",
        createdAt: Date.now() - 86400000,
        expiresAt: Date.now() - 1,
      }),
    );

    await expect(
      t.withIdentity(BOB).mutation(api.orgs.acceptInvite, { inviteId }),
    ).rejects.toThrow();
  });

  it("listMyInvites returns pending invites with org info", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });
    await t
      .withIdentity(ALICE)
      .mutation(api.orgs.sendInvite, { orgId: org._id, userId: bobId });

    const mine = await t
      .withIdentity(BOB)
      .query(api.orgs.listMyInvites, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].orgName).toBe("Studio One");
    expect(mine[0].orgSlug).toBe(org.slug);
  });
});

// ── join requests ───────────────────────────────────────────────────

describe("join requests", () => {
  it("requestJoin creates a pending request on a request org", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });

    const request = await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    expect(request?.status).toBe("pending");
    expect(request?.userId).toBe(bobId);
  });

  it("requestJoin notifies every admin", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });
    // Promote Carol so two admins (owner + Carol) exist.
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        orgId: org._id,
        userId: carolId,
        role: "admin",
        createdAt: Date.now(),
      }),
    );

    await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    const ownerNotifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", org.ownerId))
        .collect(),
    );
    const carolNotifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", carolId))
        .collect(),
    );
    expect(
      ownerNotifications.some((n) => n.type === "join_request"),
    ).toBe(true);
    expect(
      carolNotifications.some((n) => n.type === "join_request"),
    ).toBe(true);
    // Bob does not get one because the actor never notifies themselves.
    const bobNotifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bobId))
        .collect(),
    );
    expect(
      bobNotifications.find((n) => n.type === "join_request"),
    ).toBeUndefined();
  });

  it("requestJoin rejects non-request orgs and duplicate requests", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const open = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Open Studio" });
    const requestOrg = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Request Studio",
        slug: "request-studio",
        membershipModel: "request",
      });

    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.orgs.requestJoin, { orgId: open._id }),
    ).rejects.toThrow();

    await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: requestOrg._id });
    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.orgs.requestJoin, { orgId: requestOrg._id }),
    ).rejects.toThrow();
  });

  it("approveJoinRequest adds membership, notifies, and adds to channels", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });
    const request = await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    await t
      .withIdentity(ALICE)
      .mutation(api.orgs.approveJoinRequest, { requestId: request!._id });

    const fresh = await t.run((ctx) => ctx.db.get(request!._id));
    expect(fresh?.status).toBe("approved");
    const membership = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .unique(),
    );
    expect(membership).not.toBeNull();
    const channelId = await findOrgChannel(t, org._id);
    expect(await isInOrgChannel(t, channelId!, bobId)).toBe(true);

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bobId))
        .collect(),
    );
    expect(
      notifications.some((n) => n.type === "join_approved"),
    ).toBe(true);
  });

  it("rejectJoinRequest marks rejected and creates no membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });
    const request = await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    await t
      .withIdentity(ALICE)
      .mutation(api.orgs.rejectJoinRequest, { requestId: request!._id });

    const fresh = await t.run((ctx) => ctx.db.get(request!._id));
    expect(fresh?.status).toBe("rejected");
    const membership = await t.run((ctx) =>
      ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", org._id).eq("userId", bobId),
        )
        .collect(),
    );
    expect(membership).toHaveLength(0);
  });

  it("approve/reject require admin or owner", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, DAVE, { username: "dave" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });
    const request = await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    await expect(
      t.withIdentity(DAVE).mutation(api.orgs.approveJoinRequest, {
        requestId: request!._id,
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(DAVE).mutation(api.orgs.rejectJoinRequest, {
        requestId: request!._id,
      }),
    ).rejects.toThrow();
  });

  it("listPendingJoinRequests returns pending only for admins", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });
    await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    const list = await t
      .withIdentity(ALICE)
      .query(api.orgs.listPendingJoinRequests, { orgId: org._id });
    expect(list).toHaveLength(1);
    expect(list[0].username).toBe("bob");

    await expect(
      t
        .withIdentity(CAROL)
        .query(api.orgs.listPendingJoinRequests, { orgId: org._id }),
    ).rejects.toThrow();
  });

  it("getMyJoinRequest returns the pending request or null", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, {
        name: "Studio One",
        membershipModel: "request",
      });

    const empty = await t
      .withIdentity(BOB)
      .query(api.orgs.getMyJoinRequest, { orgId: org._id });
    expect(empty).toBeNull();

    await t
      .withIdentity(BOB)
      .mutation(api.orgs.requestJoin, { orgId: org._id });

    const filled = await t
      .withIdentity(BOB)
      .query(api.orgs.getMyJoinRequest, { orgId: org._id });
    expect(filled?.status).toBe("pending");
  });
});

// ── getMyMembership ─────────────────────────────────────────────────

describe("getMyMembership", () => {
  it("reports isOwner and membership for the owner", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    const result = await t
      .withIdentity(ALICE)
      .query(api.orgs.getMyMembership, { orgId: org._id });
    expect(result.isOwner).toBe(true);
    expect(result.membership?.role).toBe("admin");
  });

  it("returns null membership and false isOwner for an outsider", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    const result = await t
      .withIdentity(BOB)
      .query(api.orgs.getMyMembership, { orgId: org._id });
    expect(result.isOwner).toBe(false);
    expect(result.membership).toBeNull();
  });

  it("returns null membership for unauthenticated callers", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const org = await t
      .withIdentity(ALICE)
      .mutation(api.orgs.create, { name: "Studio One" });

    const result = await t.query(api.orgs.getMyMembership, {
      orgId: org._id,
    });
    expect(result.isOwner).toBe(false);
    expect(result.membership).toBeNull();
  });
});
