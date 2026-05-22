import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Task 8 of the Convex migration: messaging, presence, and typing. These
// tests pin the behavior ported from the Drizzle/tRPC `conversation`,
// `message`, and `ably-auth` routers and verify the new heartbeat tables
// (`conversationPresence`, `conversationTyping`) behave like the Ably
// presence/typing channels they replace.

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
};
const BOB = {
  tokenIdentifier: "https://clerk.example.com|user_bob",
  subject: "user_bob",
};
const CAROL = {
  tokenIdentifier: "https://clerk.example.com|user_carol",
  subject: "user_carol",
};

type T = TestConvex<typeof schema>;

async function seedUser(
  t: T,
  identity: { tokenIdentifier: string; subject: string },
  overrides: { username?: string; displayName?: string } = {},
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

async function seedOrg(
  t: T,
  ownerId: Id<"users">,
): Promise<Id<"organizations">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      slug: "studio-one",
      name: "Studio One",
      membershipModel: "open",
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: ownerId,
      role: "admin",
      createdAt: now,
    });
    return orgId;
  });
}

async function memberCount(
  t: T,
  conversationId: Id<"conversations">,
): Promise<number> {
  const members = await t.run((ctx) =>
    ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId),
      )
      .collect(),
  );
  return members.length;
}

// ── getOrCreateDM ───────────────────────────────────────────────────

describe("getOrCreateDM", () => {
  it("creates a direct conversation with both members", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });

    const created = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    const conversation = await t.run((ctx) => ctx.db.get(created._id));
    expect(conversation?.type).toBe("direct");
    expect(await memberCount(t, created._id)).toBe(2);
  });

  it("returns the existing conversation on repeat calls", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });

    const first = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });
    const second = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });
    const third = await t
      .withIdentity(BOB)
      .mutation(api.messaging.getOrCreateDM, {
        otherUserId: (await t.run((ctx) =>
          ctx.db
            .query("users")
            .withIndex("by_token_identifier", (q) =>
              q.eq("tokenIdentifier", ALICE.tokenIdentifier),
            )
            .unique(),
        ))!._id,
      });

    expect(second._id).toBe(first._id);
    expect(third._id).toBe(first._id);
  });

  it("rejects DMing yourself", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.messaging.getOrCreateDM, { otherUserId: aliceId }),
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    const bobId = await seedUser(t, BOB, { username: "bob" });

    await expect(
      t.mutation(api.messaging.getOrCreateDM, { otherUserId: bobId }),
    ).rejects.toThrow();
  });
});

// ── createGroup ─────────────────────────────────────────────────────

describe("createGroup", () => {
  it("creates a group including the caller and provided members", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });

    const group = await t.withIdentity(ALICE).mutation(api.messaging.createGroup, {
      name: "Dance Squad",
      memberIds: [bobId, carolId],
    });

    expect(group.type).toBe("group");
    expect(group.name).toBe("Dance Squad");
    expect(await memberCount(t, group._id)).toBe(3);
  });

  it("auto-generates a name from member display names when blank", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { displayName: "Alice A" });
    const bobId = await seedUser(t, BOB, { displayName: "Bob B" });
    const carolId = await seedUser(t, CAROL, { displayName: "Carol C" });

    const group = await t.withIdentity(ALICE).mutation(api.messaging.createGroup, {
      memberIds: [bobId, carolId],
    });
    expect(group.name).toBeTruthy();
    expect(group.name!.length).toBeGreaterThan(0);
    expect(group.name!).toContain("Alice A");
    expect(group.name!).toContain("Bob B");
    expect(group.name!).toContain("Carol C");
  });

  it("dedupes the caller out of memberIds", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });

    const group = await t.withIdentity(ALICE).mutation(api.messaging.createGroup, {
      name: "G",
      memberIds: [aliceId, bobId],
    });
    expect(await memberCount(t, group._id)).toBe(2);
  });

  it("rejects empty memberIds", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.messaging.createGroup, { memberIds: [] }),
    ).rejects.toThrow();
  });
});

// ── createOrgChannel (internal) ─────────────────────────────────────

describe("createOrgChannel", () => {
  it("creates an org_channel conversation and adds every org member", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrg(t, aliceId);
    await t.run((ctx) =>
      ctx.db.insert("memberships", {
        orgId,
        userId: bobId,
        role: "member",
        createdAt: Date.now(),
      }),
    );

    const channel = await t.mutation(
      internal.messaging.createOrgChannel,
      { orgId, name: "Announcements" },
    );

    expect(channel.type).toBe("org_channel");
    expect(channel.name).toBe("Announcements");
    expect(channel.orgId).toBe(orgId);
    expect(await memberCount(t, channel._id)).toBe(2);
  });

  it("rejects an empty name", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const orgId = await seedOrg(t, aliceId);

    await expect(
      t.mutation(internal.messaging.createOrgChannel, { orgId, name: "" }),
    ).rejects.toThrow();
  });
});

// ── addMember ───────────────────────────────────────────────────────

describe("addMember", () => {
  it("adds a new member to a group conversation", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });

    const group = await t.withIdentity(ALICE).mutation(api.messaging.createGroup, {
      name: "Squad",
      memberIds: [bobId],
    });

    await t.withIdentity(ALICE).mutation(api.messaging.addMember, {
      conversationId: group._id,
      userId: carolId,
    });

    expect(await memberCount(t, group._id)).toBe(3);
  });

  it("is idempotent for an existing member", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });

    const group = await t.withIdentity(ALICE).mutation(api.messaging.createGroup, {
      name: "Squad",
      memberIds: [bobId],
    });

    await t.withIdentity(ALICE).mutation(api.messaging.addMember, {
      conversationId: group._id,
      userId: bobId,
    });
    expect(await memberCount(t, group._id)).toBe(2);
  });

  it("rejects adding to a direct conversation", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });

    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await expect(
      t.withIdentity(ALICE).mutation(api.messaging.addMember, {
        conversationId: dm._id,
        userId: carolId,
      }),
    ).rejects.toThrow();
  });

  it("rejects non-members of a group", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });

    const group = await t.withIdentity(ALICE).mutation(api.messaging.createGroup, {
      name: "Squad",
      memberIds: [bobId],
    });

    await expect(
      t.withIdentity(CAROL).mutation(api.messaging.addMember, {
        conversationId: group._id,
        userId: bobId,
      }),
    ).rejects.toThrow();
  });
});

// ── send + history + markRead + listConversations ───────────────────

describe("send / history / markRead / listConversations", () => {
  it("send inserts a message, bumps updatedAt, and notifies others", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });
    const beforeUpdated = (await t.run((ctx) => ctx.db.get(dm._id)))!.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const message = await t.withIdentity(ALICE).mutation(api.messaging.send, {
      conversationId: dm._id,
      body: "Hello, Bob.",
    });
    expect(message.body).toBe("Hello, Bob.");
    expect(message.senderId).toBe(aliceId);

    const conversation = await t.run((ctx) => ctx.db.get(dm._id));
    expect(conversation!.updatedAt).toBeGreaterThan(beforeUpdated);

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bobId))
        .collect(),
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("message");
    expect(notifications[0].actorId).toBe(aliceId);
    expect(notifications[0].conversationId).toBe(dm._id);
  });

  it("send rejects non-members", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await expect(
      t.withIdentity(CAROL).mutation(api.messaging.send, {
        conversationId: dm._id,
        body: "intruding",
      }),
    ).rejects.toThrow();
  });

  it("send rejects empty bodies and oversize bodies", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await expect(
      t.withIdentity(ALICE).mutation(api.messaging.send, {
        conversationId: dm._id,
        body: "   ",
      }),
    ).rejects.toThrow();

    await expect(
      t.withIdentity(ALICE).mutation(api.messaging.send, {
        conversationId: dm._id,
        body: "x".repeat(5001),
      }),
    ).rejects.toThrow();
  });

  it("history paginates and requires membership", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    for (let i = 0; i < 3; i++) {
      await t.withIdentity(ALICE).mutation(api.messaging.send, {
        conversationId: dm._id,
        body: `msg-${i}`,
      });
    }

    const page = await t.withIdentity(ALICE).query(api.messaging.history, {
      conversationId: dm._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(3);
    // Newest-first: the most recent send is index 0
    expect(page.page[0].body).toBe("msg-2");
    expect(page.page[2].body).toBe("msg-0");
    expect(page.page[0].sender?.username).toBe("alice");

    // A non-member cannot read history.
    await expect(
      t.withIdentity(CAROL).query(api.messaging.history, {
        conversationId: dm._id,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
  });

  it("markRead resets the unread count for that user", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await t.withIdentity(ALICE).mutation(api.messaging.send, {
      conversationId: dm._id,
      body: "one",
    });
    await t.withIdentity(ALICE).mutation(api.messaging.send, {
      conversationId: dm._id,
      body: "two",
    });

    const before = await t.withIdentity(BOB).query(api.messaging.listConversations, {});
    expect(before).toHaveLength(1);
    expect(before[0].unreadCount).toBe(2);
    expect(before[0].lastMessage?.body).toBe("two");

    await t
      .withIdentity(BOB)
      .mutation(api.messaging.markRead, { conversationId: dm._id });

    const after = await t.withIdentity(BOB).query(api.messaging.listConversations, {});
    expect(after[0].unreadCount).toBe(0);
  });

  it("listConversations sorts by updatedAt desc, returns DM otherUser, returns [] when signed out", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice", displayName: "Alice A" });
    const bobId = await seedUser(t, BOB, { username: "bob", displayName: "Bob B" });
    const carolId = await seedUser(t, CAROL, { username: "carol", displayName: "Carol C" });

    const dmBC = await t
      .withIdentity(BOB)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: aliceId });
    await new Promise((r) => setTimeout(r, 5));
    const group = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.createGroup, {
        name: "Crew",
        memberIds: [bobId, carolId],
      });
    // make DM more recent than the group by sending after the group was made
    await new Promise((r) => setTimeout(r, 5));
    await t.withIdentity(BOB).mutation(api.messaging.send, {
      conversationId: dmBC._id,
      body: "hi alice",
    });

    const aliceList = await t.withIdentity(ALICE).query(api.messaging.listConversations, {});
    expect(aliceList).toHaveLength(2);
    expect(aliceList[0]._id).toBe(dmBC._id);
    expect(aliceList[0].otherUser?.username).toBe("bob");
    expect(aliceList[0].lastMessage?.body).toBe("hi alice");
    expect(aliceList[1]._id).toBe(group._id);
    expect(aliceList[1].otherUser).toBeNull();

    const anon = await t.query(api.messaging.listConversations, {});
    expect(anon).toEqual([]);
  });
});

// ── Presence and typing ─────────────────────────────────────────────

describe("presence and typing", () => {
  it("heartbeatPresence upserts, activePresence filters by TTL", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await t
      .withIdentity(ALICE)
      .mutation(api.messaging.heartbeatPresence, { conversationId: dm._id });
    await t
      .withIdentity(BOB)
      .mutation(api.messaging.heartbeatPresence, { conversationId: dm._id });

    const fresh = await t
      .withIdentity(ALICE)
      .query(api.messaging.activePresence, {
        conversationId: dm._id,
        now: Date.now(),
      });
    expect(new Set(fresh)).toEqual(new Set([aliceId, bobId]));

    // Far-future `now`: every heartbeat is stale relative to PRESENCE_TTL_MS.
    const stale = await t
      .withIdentity(ALICE)
      .query(api.messaging.activePresence, {
        conversationId: dm._id,
        now: Date.now() + 10 * 60_000,
      });
    expect(stale).toEqual([]);
  });

  it("heartbeatPresence patches the existing row in place", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await t
      .withIdentity(ALICE)
      .mutation(api.messaging.heartbeatPresence, { conversationId: dm._id });
    await t
      .withIdentity(ALICE)
      .mutation(api.messaging.heartbeatPresence, { conversationId: dm._id });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("conversationPresence")
        .withIndex("by_conversation_user", (q) =>
          q.eq("conversationId", dm._id),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1);
  });

  it("setTyping(true) writes, setTyping(false) deletes; activeTyping excludes self", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await t
      .withIdentity(BOB)
      .mutation(api.messaging.setTyping, {
        conversationId: dm._id,
        isTyping: true,
      });
    await t
      .withIdentity(ALICE)
      .mutation(api.messaging.setTyping, {
        conversationId: dm._id,
        isTyping: true,
      });

    const aliceView = await t
      .withIdentity(ALICE)
      .query(api.messaging.activeTyping, {
        conversationId: dm._id,
        now: Date.now(),
      });
    expect(aliceView).toEqual([bobId]);

    const bobView = await t
      .withIdentity(BOB)
      .query(api.messaging.activeTyping, {
        conversationId: dm._id,
        now: Date.now(),
      });
    expect(bobView).toEqual([aliceId]);

    await t
      .withIdentity(BOB)
      .mutation(api.messaging.setTyping, {
        conversationId: dm._id,
        isTyping: false,
      });

    const aliceViewAfter = await t
      .withIdentity(ALICE)
      .query(api.messaging.activeTyping, {
        conversationId: dm._id,
        now: Date.now(),
      });
    expect(aliceViewAfter).toEqual([]);
  });

  it("activeTyping filters out stale heartbeats", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    await t
      .withIdentity(BOB)
      .mutation(api.messaging.setTyping, {
        conversationId: dm._id,
        isTyping: true,
      });

    const stale = await t
      .withIdentity(ALICE)
      .query(api.messaging.activeTyping, {
        conversationId: dm._id,
        now: Date.now() + 60_000,
      });
    expect(stale).toEqual([]);
  });

  it("cleanupStalePresence removes rows older than the TTL", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const dm = await t
      .withIdentity(ALICE)
      .mutation(api.messaging.getOrCreateDM, { otherUserId: bobId });

    // Insert a presence row dated long ago.
    await t.run(async (ctx) => {
      await ctx.db.insert("conversationPresence", {
        conversationId: dm._id,
        userId: bobId,
        lastSeenAt: 0,
      });
      await ctx.db.insert("conversationTyping", {
        conversationId: dm._id,
        userId: bobId,
        updatedAt: 0,
      });
    });

    const result = await t.mutation(internal.messaging.cleanupStalePresence, {
      now: Date.now(),
    });
    expect(result.presenceRemoved).toBe(1);
    expect(result.typingRemoved).toBe(1);

    const remaining = await t.run((ctx) =>
      Promise.all([
        ctx.db
          .query("conversationPresence")
          .withIndex("by_conversation_user", (q) =>
            q.eq("conversationId", dm._id),
          )
          .collect(),
        ctx.db
          .query("conversationTyping")
          .withIndex("by_conversation_user", (q) =>
            q.eq("conversationId", dm._id),
          )
          .collect(),
      ]),
    );
    expect(remaining[0]).toEqual([]);
    expect(remaining[1]).toEqual([]);
  });
});
