import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Task 7 of the Convex migration: social content (posts, feeds, comments,
// likes, saves, partner search, and org-scoped posts). These tests pin the
// behavior ported from the Drizzle/tRPC `post`, `feed`, `comment`, `like`,
// `save`, `partnerSearch`, and `orgPost` routers.

type TestConvex = ReturnType<typeof convexTest>;

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
  name: "Alice Anderson",
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

async function seedUser(
  t: TestConvex,
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

async function seedFollow(
  t: TestConvex,
  followerId: Id<"users">,
  followingId: Id<"users">,
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("follows", {
      followerId,
      followingId,
      status: "active",
      createdAt: Date.now(),
    }),
  );
}

async function seedOrg(
  t: TestConvex,
  ownerId: Id<"users">,
  slug = "studio",
): Promise<Id<"organizations">> {
  return t.run(async (ctx) => {
    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      slug,
      name: slug,
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

async function joinOrg(
  t: TestConvex,
  orgId: Id<"organizations">,
  userId: Id<"users">,
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert("memberships", {
      orgId,
      userId,
      role: "member",
      createdAt: Date.now(),
    }),
  );
}

// ── posts (user-authored) ───────────────────────────────────────────

describe("posts", () => {
  it("createArticle returns a draft when publish is false", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });

    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Tango Drills",
      body: "Some content",
    });

    expect(post.publishedAt).toBeUndefined();
    expect(post.title).toBe("Tango Drills");
    expect(post.type).toBe("article");
    expect(post.visibility).toBe("public");
  });

  it("createArticle published article shows up in author's drafts? no", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });

    await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Published",
      body: "Body",
      publish: true,
    });

    const drafts = await t.withIdentity(ALICE).query(api.social.posts.listDrafts, {});
    expect(drafts).toHaveLength(0);
  });

  it("createArticle rejects empty title", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await expect(
      t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
        title: "  ",
        body: "Body",
      }),
    ).rejects.toThrow();
  });

  it("createArticle organization visibility requires membership", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrg(t, bob);

    await expect(
      t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
        title: "Members",
        body: "Body",
        visibility: "organization",
        visibilityOrgId: orgId,
      }),
    ).rejects.toThrow();

    await joinOrg(t, orgId, alice);
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Members",
      body: "Body",
      visibility: "organization",
      visibilityOrgId: orgId,
    });
    expect(post.visibility).toBe("organization");
    expect(post.visibilityOrgId).toBe(orgId);
  });

  it("update edits only the author's own post", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Original",
      body: "Body",
    });

    const updatedByAuthor = await t.withIdentity(ALICE).mutation(api.social.posts.update, {
      postId: post._id,
      title: "Edited",
    });
    expect(updatedByAuthor?.title).toBe("Edited");

    const updatedByOther = await t.withIdentity(BOB).mutation(api.social.posts.update, {
      postId: post._id,
      title: "Hijacked",
    });
    expect(updatedByOther).toBeNull();
  });

  it("publish marks the post as published", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const draft = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Draft",
      body: "Body",
    });

    const published = await t.withIdentity(ALICE).mutation(api.social.posts.publish, {
      postId: draft._id,
    });

    expect(published?.publishedAt).toBeTypeOf("number");
  });

  it("remove deletes the author's post, its comments, and its likes", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "T",
      body: "B",
      publish: true,
    });
    await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId: post._id,
      body: "comment",
    });
    await t.withIdentity(BOB).mutation(api.social.likes.togglePost, {
      postId: post._id,
    });

    await t.withIdentity(ALICE).mutation(api.social.posts.remove, {
      postId: post._id,
    });

    const remaining = await t.run((ctx) => ctx.db.get(post._id));
    expect(remaining).toBeNull();
    const comments = await t.run((ctx) => ctx.db.query("comments").collect());
    expect(comments).toHaveLength(0);
    const likes = await t.run((ctx) => ctx.db.query("likes").collect());
    expect(likes).toHaveLength(0);
    void alice;
    void bob;
  });

  it("get returns null for a draft when viewed by someone else", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const draft = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Hidden",
      body: "Body",
    });

    const viewedByOther = await t
      .withIdentity(BOB)
      .query(api.social.posts.get, { postId: draft._id });
    expect(viewedByOther).toBeNull();

    const viewedByAuthor = await t
      .withIdentity(ALICE)
      .query(api.social.posts.get, { postId: draft._id });
    expect(viewedByAuthor?.title).toBe("Hidden");
  });

  it("get returns null for followers-only post when viewer doesn't follow", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Followers",
      body: "Body",
      visibility: "followers",
      publish: true,
    });

    const notFollowing = await t
      .withIdentity(BOB)
      .query(api.social.posts.get, { postId: post._id });
    expect(notFollowing).toBeNull();

    await seedFollow(t, bob, alice);
    const followingViewer = await t
      .withIdentity(BOB)
      .query(api.social.posts.get, { postId: post._id });
    expect(followingViewer?.title).toBe("Followers");
  });

  it("createRoutineShare requires the routine to belong to the author", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const danceId = await t.run((ctx) =>
      ctx.db.insert("dances", { name: "waltz", displayName: "Waltz" }),
    );
    const routineId = await t.run((ctx) =>
      ctx.db.insert("routines", {
        userId: alice,
        danceId,
        name: "My Routine",
        isPublished: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      t.withIdentity(BOB).mutation(api.social.posts.createRoutineShare, {
        routineId,
        body: "share",
      }),
    ).rejects.toThrow();

    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createRoutineShare, {
      routineId,
      body: "share",
    });
    expect(post.type).toBe("routine_share");
    expect(post.publishedAt).toBeTypeOf("number");
    void bob;
  });
});

// ── feeds ───────────────────────────────────────────────────────────

describe("feeds", () => {
  it("followingFeed includes posts by followed users", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    await seedFollow(t, alice, bob);

    await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "Bob's note",
      body: "Body",
      publish: true,
    });

    const result = await t
      .withIdentity(ALICE)
      .query(api.social.posts.followingFeed, {});
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].title).toBe("Bob's note");
  });

  it("followingFeed excludes drafts and non-followed authors", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });

    await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "Not followed",
      body: "Body",
      publish: true,
    });
    await t.withIdentity(CAROL).mutation(api.social.posts.createArticle, {
      title: "Draft",
      body: "Body",
    });

    const result = await t
      .withIdentity(ALICE)
      .query(api.social.posts.followingFeed, {});
    expect(result.posts).toHaveLength(0);
  });

  it("followingFeed includes org-visibility posts for members", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrg(t, bob);
    await joinOrg(t, orgId, alice);

    await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "Org-only",
      body: "Body",
      visibility: "organization",
      visibilityOrgId: orgId,
      publish: true,
    });

    const result = await t
      .withIdentity(ALICE)
      .query(api.social.posts.followingFeed, {});
    expect(result.posts.map((p) => p.title)).toContain("Org-only");
  });

  it("exploreFeed lists every public published post newest-first", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });

    await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "first",
      body: "Body",
      publish: true,
    });
    await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "second",
      body: "Body",
      publish: true,
    });
    await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "draft",
      body: "Body",
    });

    const result = await t.query(api.social.posts.exploreFeed, {});
    expect(result.posts.map((p) => p.title)).toEqual(["second", "first"]);
  });

  it("exploreFeed paginates with the next cursor", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    for (let i = 0; i < 3; i += 1) {
      await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
        title: `post-${i}`,
        body: "Body",
        publish: true,
      });
    }

    const first = await t.query(api.social.posts.exploreFeed, { limit: 2 });
    expect(first.posts).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await t.query(api.social.posts.exploreFeed, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.posts).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
  });
});

// ── comments ────────────────────────────────────────────────────────

async function setupPost() {
  const t = convexTest(schema, modules);
  const alice = await seedUser(t, ALICE, { username: "alice" });
  const bob = await seedUser(t, BOB, { username: "bob" });
  const post = await t
    .withIdentity(ALICE)
    .mutation(api.social.posts.createArticle, {
      title: "Topic",
      body: "Body",
      publish: true,
    });
  return { t, alice, bob, postId: post._id };
}

describe("comments", () => {
  it("create stores a top-level comment and notifies the author", async () => {
    const { t, alice, postId } = await setupPost();
    const result = await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId,
      body: "Looks great",
    });
    expect("comment" in result).toBe(true);

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", alice))
        .collect(),
    );
    expect(notifications.some((n) => n.type === "comment")).toBe(true);
  });

  it("listByPost returns top-level comments with reply counts", async () => {
    const { t, postId } = await setupPost();
    const root = await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId,
      body: "root",
    });
    if (!("comment" in root) || !root.comment) throw new Error("expected comment");
    await t.withIdentity(ALICE).mutation(api.social.comments.create, {
      postId,
      parentId: root.comment._id,
      body: "reply",
    });

    const comments = await t.query(api.social.comments.listByPost, { postId });
    expect(comments).toHaveLength(1);
    expect(comments[0].replyCount).toBe(1);
  });

  it("replies returns replies for a comment, sorted oldest first", async () => {
    const { t, postId } = await setupPost();
    const root = await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId,
      body: "root",
    });
    if (!("comment" in root) || !root.comment) throw new Error("expected comment");
    await t.withIdentity(ALICE).mutation(api.social.comments.create, {
      postId,
      parentId: root.comment._id,
      body: "first reply",
    });
    await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId,
      parentId: root.comment._id,
      body: "second reply",
    });

    const replies = await t.query(api.social.comments.replies, {
      commentId: root.comment._id,
    });
    expect(replies.map((c) => c.body)).toEqual(["first reply", "second reply"]);
  });

  it("rejects replies to replies", async () => {
    const { t, postId } = await setupPost();
    const root = await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId,
      body: "root",
    });
    if (!("comment" in root) || !root.comment) throw new Error("expected comment");
    const reply = await t.withIdentity(ALICE).mutation(api.social.comments.create, {
      postId,
      parentId: root.comment._id,
      body: "reply",
    });
    if (!("comment" in reply) || !reply.comment) throw new Error("expected comment");

    const replyToReply = await t
      .withIdentity(BOB)
      .mutation(api.social.comments.create, {
        postId,
        parentId: reply.comment._id,
        body: "should fail",
      });
    expect(replyToReply).toEqual({ error: "cannot_reply_to_reply" });
  });

  it("remove deletes the user's own comment", async () => {
    const { t, postId } = await setupPost();
    const made = await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId,
      body: "first",
    });
    if (!("comment" in made) || !made.comment) throw new Error("expected comment");
    await t.withIdentity(BOB).mutation(api.social.comments.remove, {
      commentId: made.comment._id,
    });
    const remaining = await t.run((ctx) => ctx.db.query("comments").collect());
    expect(remaining).toHaveLength(0);
  });
});

// ── likes ───────────────────────────────────────────────────────────

describe("likes", () => {
  it("togglePost likes and unlikes", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Topic",
      body: "Body",
      publish: true,
    });

    const firstToggle = await t.withIdentity(BOB).mutation(api.social.likes.togglePost, {
      postId: post._id,
    });
    expect(firstToggle.liked).toBe(true);

    const secondToggle = await t.withIdentity(BOB).mutation(api.social.likes.togglePost, {
      postId: post._id,
    });
    expect(secondToggle.liked).toBe(false);
  });

  it("toggleComment likes and unlikes", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "Topic",
      body: "Body",
      publish: true,
    });
    const created = await t.withIdentity(BOB).mutation(api.social.comments.create, {
      postId: post._id,
      body: "comment",
    });
    if (!("comment" in created) || !created.comment) throw new Error("expected comment");

    const firstToggle = await t.withIdentity(ALICE).mutation(api.social.likes.toggleComment, {
      commentId: created.comment._id,
    });
    expect(firstToggle.liked).toBe(true);

    const secondToggle = await t.withIdentity(ALICE).mutation(api.social.likes.toggleComment, {
      commentId: created.comment._id,
    });
    expect(secondToggle.liked).toBe(false);
    void alice;
  });

  it("postStatus reports the like count and viewer state", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createArticle, {
      title: "T",
      body: "B",
      publish: true,
    });
    await t.withIdentity(BOB).mutation(api.social.likes.togglePost, {
      postId: post._id,
    });

    const status = await t.query(api.social.likes.postStatus, {
      postId: post._id,
      userId: bob,
    });
    expect(status.count).toBe(1);
    expect(status.liked).toBe(true);

    const anonymous = await t.query(api.social.likes.postStatus, {
      postId: post._id,
      userId: null,
    });
    expect(anonymous.count).toBe(1);
    expect(anonymous.liked).toBe(false);
  });
});

// ── saves ───────────────────────────────────────────────────────────

describe("saves", () => {
  it("createFolder and folders list returns counts including the all-saves bucket", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await t.withIdentity(ALICE).mutation(api.social.saves.createFolder, {
      name: "Tango",
    });
    const result = await t
      .withIdentity(ALICE)
      .query(api.social.saves.folders, {});
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe("Tango");
    expect(result.allSavedCount).toBe(0);
  });

  it("savePost is idempotent on the same (post, folder)", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "T",
      body: "B",
      publish: true,
    });
    await t.withIdentity(ALICE).mutation(api.social.saves.savePost, {
      postId: post._id,
      folderId: null,
    });
    await t.withIdentity(ALICE).mutation(api.social.saves.savePost, {
      postId: post._id,
      folderId: null,
    });
    const rows = await t.run((ctx) => ctx.db.query("savedPosts").collect());
    expect(rows).toHaveLength(1);
  });

  it("unsavePost removes the requested (post, folder) entry", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "T",
      body: "B",
      publish: true,
    });
    await t.withIdentity(ALICE).mutation(api.social.saves.savePost, {
      postId: post._id,
      folderId: null,
    });
    await t.withIdentity(ALICE).mutation(api.social.saves.unsavePost, {
      postId: post._id,
      folderId: null,
    });
    const rows = await t.run((ctx) => ctx.db.query("savedPosts").collect());
    expect(rows).toHaveLength(0);
  });

  it("deleteFolder moves saved posts back to the all-saves bucket", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "T",
      body: "B",
      publish: true,
    });
    const folder = await t
      .withIdentity(ALICE)
      .mutation(api.social.saves.createFolder, { name: "Tango" });
    await t.withIdentity(ALICE).mutation(api.social.saves.savePost, {
      postId: post._id,
      folderId: folder._id,
    });

    await t.withIdentity(ALICE).mutation(api.social.saves.deleteFolder, {
      folderId: folder._id,
    });

    const rows = await t
      .withIdentity(ALICE)
      .query(api.social.saves.folders, {});
    expect(rows.allSavedCount).toBe(1);
    expect(rows.folders).toHaveLength(0);
  });

  it("postsInFolder returns the saved post for the all-saves bucket", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const post = await t.withIdentity(BOB).mutation(api.social.posts.createArticle, {
      title: "Topic",
      body: "Body",
      publish: true,
    });
    await t.withIdentity(ALICE).mutation(api.social.saves.savePost, {
      postId: post._id,
      folderId: null,
    });

    const items = await t
      .withIdentity(ALICE)
      .query(api.social.saves.postsInFolder, { folderId: null });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Topic");
  });
});

// ── partner search ──────────────────────────────────────────────────

describe("partnerSearch", () => {
  it("upsert inserts then updates on subsequent calls", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    const first = await t.withIdentity(ALICE).mutation(api.social.partnerSearch.upsert, {
      danceStyles: ["standard"],
      rolePreference: "lead",
    });
    expect(first.danceStyles).toEqual(["standard"]);

    const second = await t.withIdentity(ALICE).mutation(api.social.partnerSearch.upsert, {
      danceStyles: ["standard", "latin"],
      location: "Chicago",
      rolePreference: "both",
    });
    expect(second.rolePreference).toBe("both");
    expect(second.location).toBe("Chicago");
    expect(second.danceStyles).toEqual(["standard", "latin"]);
  });

  it("remove deletes the current user's profile", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await t.withIdentity(ALICE).mutation(api.social.partnerSearch.upsert, {
      danceStyles: ["standard"],
      rolePreference: "lead",
    });
    await t.withIdentity(ALICE).mutation(api.social.partnerSearch.remove, {});
    const remaining = await t.withIdentity(ALICE).query(api.social.partnerSearch.me, {});
    expect(remaining).toBeNull();
  });

  it("discover filters by style and excludes the caller", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });

    await t.withIdentity(ALICE).mutation(api.social.partnerSearch.upsert, {
      danceStyles: ["standard"],
      rolePreference: "lead",
    });
    await t.withIdentity(BOB).mutation(api.social.partnerSearch.upsert, {
      danceStyles: ["standard", "latin"],
      rolePreference: "follow",
    });
    await t.withIdentity(CAROL).mutation(api.social.partnerSearch.upsert, {
      danceStyles: ["nightclub"],
      rolePreference: "both",
    });

    const standard = await t
      .withIdentity(ALICE)
      .query(api.social.partnerSearch.discover, { style: "standard" });
    expect(standard.items.map((i) => i.username)).toEqual(["bob"]);

    const latin = await t
      .withIdentity(ALICE)
      .query(api.social.partnerSearch.discover, { style: "latin" });
    expect(latin.items.map((i) => i.username)).toEqual(["bob"]);

    const everyone = await t
      .withIdentity(ALICE)
      .query(api.social.partnerSearch.discover, {});
    expect(everyone.items.map((i) => i.username).sort()).toEqual([
      "bob",
      "carol",
    ]);
  });
});

// ── org posts ───────────────────────────────────────────────────────

describe("orgPosts", () => {
  it("createOrgPost requires admin role", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrg(t, alice);

    await expect(
      t.withIdentity(BOB).mutation(api.social.posts.createOrgPost, {
        orgId,
        type: "article",
        title: "Members only",
        body: "Body",
      }),
    ).rejects.toThrow();

    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createOrgPost, {
      orgId,
      type: "article",
      title: "Members only",
      body: "Body",
    });
    expect(post.orgId).toBe(orgId);
    expect(post.authorId).toBeUndefined();
  });

  it("publishOrgPost notifies every org member", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const bob = await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrg(t, alice);
    await joinOrg(t, orgId, bob);

    const draft = await t.withIdentity(ALICE).mutation(api.social.posts.createOrgPost, {
      orgId,
      type: "article",
      title: "Topic",
      body: "Body",
    });
    await t.withIdentity(ALICE).mutation(api.social.posts.publishOrgPost, {
      postId: draft._id,
      orgId,
    });

    const notifications = await t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", bob))
        .collect(),
    );
    expect(notifications.some((n) => n.type === "org_post")).toBe(true);
  });

  it("listByOrg returns only published public org posts", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const orgId = await seedOrg(t, alice);

    await t.withIdentity(ALICE).mutation(api.social.posts.createOrgPost, {
      orgId,
      type: "article",
      title: "Published",
      body: "Body",
      publish: true,
    });
    await t.withIdentity(ALICE).mutation(api.social.posts.createOrgPost, {
      orgId,
      type: "article",
      title: "Draft",
      body: "Body",
    });

    const result = await t.query(api.social.posts.listByOrg, { orgId });
    expect(result.items.map((i) => i.title)).toEqual(["Published"]);
  });

  it("listOrgDrafts requires admin", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrg(t, alice);
    await t.withIdentity(ALICE).mutation(api.social.posts.createOrgPost, {
      orgId,
      type: "article",
      title: "Draft",
      body: "Body",
    });

    await expect(
      t.withIdentity(BOB).query(api.social.posts.listOrgDrafts, { orgId }),
    ).rejects.toThrow();

    const drafts = await t
      .withIdentity(ALICE)
      .query(api.social.posts.listOrgDrafts, { orgId });
    expect(drafts).toHaveLength(1);
  });

  it("removeOrgPost deletes draft and dependents", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t, ALICE, { username: "alice" });
    const orgId = await seedOrg(t, alice);
    const post = await t.withIdentity(ALICE).mutation(api.social.posts.createOrgPost, {
      orgId,
      type: "article",
      title: "Topic",
      body: "Body",
      publish: true,
    });
    await t.withIdentity(ALICE).mutation(api.social.likes.togglePost, {
      postId: post._id,
    });

    await t.withIdentity(ALICE).mutation(api.social.posts.removeOrgPost, {
      postId: post._id,
      orgId,
    });

    const remaining = await t.run((ctx) => ctx.db.get(post._id));
    expect(remaining).toBeNull();
    const likes = await t.run((ctx) => ctx.db.query("likes").collect());
    expect(likes).toHaveLength(0);
  });
});
