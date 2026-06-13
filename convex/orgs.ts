import { ConvexError, type Infer, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { nanoid } from "nanoid";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { badRequest, forbidden, notFound } from "./lib/errors";
import { requireOrgRole } from "./lib/permissions";
import { membershipModel, orgRole } from "./schema";
import { createNotification } from "./social/notifications";

type MembershipModel = Infer<typeof membershipModel>;

/**
 * Organizations domain. Ported from the Drizzle/tRPC routers under
 * `src/domains/orgs/routers/*` (org, membership, invite, join-request)
 * for the Convex migration (docs/superpowers/plans/2026-05-22-convex-migration.md,
 * Task 6).
 *
 * Org channel membership effects on `conversations` / `conversationMembers`
 * are preserved end-to-end so messaging behavior keeps working before Task 8
 * implements the Convex messaging functions. Tables exist in the shared
 * schema (Task 2); no `ensureOrgChannelMembershipInputs` fallback is needed.
 *
 * Owner vs admin: an org has one `ownerId`; the owner also gets a
 * `memberships` row with role `"admin"`. UI consumers branch on
 * `isOwner = org.ownerId === user._id`, mirroring the tRPC contract.
 */

const INVITE_TOKEN_LENGTH = 24;
const INVITE_EXPIRY_DAYS = 7;
const ORG_NAME_MAX = 100;
const ORG_SLUG_MAX = 100;
const ORG_DESCRIPTION_MAX = 500;

/** Slugify an org name the same way the tRPC `org.create` procedure did. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function invitesExpireAt(now: number): number {
  return now + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}

async function listOrgChannelIds(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<Id<"conversations">[]> {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  return conversations
    .filter((c) => c.type === "org_channel")
    .map((c) => c._id);
}

async function ensureOrgChannelMembership(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
): Promise<void> {
  const channelIds = await listOrgChannelIds(ctx, orgId);
  for (const conversationId of channelIds) {
    const existing = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", userId),
      )
      .unique();
    if (existing) continue;
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId,
      joinedAt: Date.now(),
      unreadCount: 0,
    });
  }
}

async function removeFromOrgChannels(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
): Promise<void> {
  const channelIds = await listOrgChannelIds(ctx, orgId);
  for (const conversationId of channelIds) {
    const member = await ctx.db
      .query("conversationMembers")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", conversationId).eq("userId", userId),
      )
      .unique();
    if (member) {
      await ctx.db.delete(member._id);
    }
  }
}

/** Count active memberships for an org. Used by list-style queries. */
async function memberCount(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<number> {
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId))
    .collect();
  return members.length;
}

async function getMembership(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
): Promise<Doc<"memberships"> | null> {
  return await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", orgId).eq("userId", userId),
    )
    .unique();
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Public org index for the `/orgs` discovery page. Returns the most recently
 * created orgs first with a member count for the card, paginated through
 * Convex `paginate`. Replaces the legacy serial-id cursor used by the tRPC
 * `org.discover`.
 */
export const discover = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("organizations")
      .order("desc")
      .paginate(args.paginationOpts);

    const items = await Promise.all(
      result.page.map(async (org) => ({
        _id: org._id,
        slug: org.slug,
        name: org.name,
        description: org.description ?? null,
        avatarUrl: org.avatarUrl ?? null,
        membershipModel: org.membershipModel,
        createdAt: org.createdAt,
        memberCount: await memberCount(ctx, org._id),
      })),
    );

    return { ...result, page: items };
  },
});

/**
 * Orgs the current user belongs to, with their membership role and join
 * timestamp. Returns `[]` when not signed in (the current tRPC procedure
 * required auth; this softer behavior matches the rest of the migration's
 * unauthenticated query convention).
 */
export const listUserOrgs = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const enriched = await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        if (!org) return null;
        return {
          _id: org._id,
          slug: org.slug,
          name: org.name,
          description: org.description ?? null,
          avatarUrl: org.avatarUrl ?? null,
          membershipModel: org.membershipModel,
          ownerId: org.ownerId,
          createdAt: org.createdAt,
          role: m.role,
          joinedAt: m.createdAt,
        };
      }),
    );

    const filtered = enriched.filter(
      (o): o is NonNullable<typeof o> => o !== null,
    );
    filtered.sort((a, b) => b.joinedAt - a.joinedAt);
    return filtered;
  },
});

/**
 * Full org profile by slug, including member count. Returns `null` for an
 * unknown slug so the org page can render not-found without an error
 * boundary.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!org) return null;
    return {
      _id: org._id,
      slug: org.slug,
      name: org.name,
      description: org.description ?? null,
      avatarUrl: org.avatarUrl ?? null,
      membershipModel: org.membershipModel,
      ownerId: org.ownerId,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      memberCount: await memberCount(ctx, org._id),
    };
  },
});

/**
 * The signed-in user's membership + owner state for an org. Returns the
 * default no-membership shape when unauthenticated so the UI can branch
 * without an error.
 */
export const getMyMembership = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { membership: null, isOwner: false };
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return { membership: null, isOwner: false };
    const membership = await getMembership(ctx, args.orgId, user._id);
    return {
      membership: membership
        ? {
            _id: membership._id,
            orgId: membership.orgId,
            userId: membership.userId,
            role: membership.role,
            createdAt: membership.createdAt,
          }
        : null,
      isOwner: org.ownerId === user._id,
    };
  },
});

/**
 * Members of an org with avatar/display data and owner annotation. Members
 * only; the previous tRPC procedure required caller membership and this
 * mirrors that.
 */
export const listMembers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { org } = await requireOrgRole(ctx, args.orgId, "member");

    const rows = await ctx.db
      .query("memberships")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId))
      .collect();

    const enriched = await Promise.all(
      rows.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return {
          membershipId: m._id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.createdAt,
          username: u?.username ?? null,
          displayName: u?.displayName ?? null,
          avatarUrl: u?.avatarUrl ?? null,
          isOwner: m.userId === org.ownerId,
        };
      }),
    );
    return enriched;
  },
});

/**
 * The current user's pending join request for `orgId`, or `null`. Returns
 * null when unauthenticated.
 */
export const getMyJoinRequest = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    const request = await ctx.db
      .query("joinRequests")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", user._id),
      )
      .unique();
    if (!request || request.status !== "pending") return null;
    return request;
  },
});

/**
 * Pending join requests for an org, with requester profile data. Admin or
 * owner only.
 */
export const listPendingJoinRequests = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "admin");

    const requests = await ctx.db
      .query("joinRequests")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    const pending = requests.filter((r) => r.status === "pending");

    return await Promise.all(
      pending.map(async (r) => {
        const u = await ctx.db.get(r.userId);
        return {
          _id: r._id,
          orgId: r.orgId,
          userId: r.userId,
          status: r.status,
          createdAt: r.createdAt,
          username: u?.username ?? null,
          displayName: u?.displayName ?? null,
          avatarUrl: u?.avatarUrl ?? null,
        };
      }),
    );
  },
});

/**
 * Pending direct invites for the current user, with org metadata for display.
 * Returns `[]` when unauthenticated.
 */
export const listMyInvites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return [];
    const invites = await ctx.db
      .query("orgInvites")
      .withIndex("by_invited_user", (q) => q.eq("invitedUserId", user._id))
      .collect();
    const pending = invites.filter((i) => i.status === "pending");

    return await Promise.all(
      pending.map(async (i) => {
        const org = await ctx.db.get(i.orgId);
        return {
          _id: i._id,
          orgId: i.orgId,
          invitedBy: i.invitedBy,
          status: i.status,
          createdAt: i.createdAt,
          expiresAt: i.expiresAt,
          orgName: org?.name ?? null,
          orgSlug: org?.slug ?? null,
          orgAvatarUrl: org?.avatarUrl ?? null,
        };
      }),
    );
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Create an org owned by the caller. Inserts the owner's admin membership
 * and the default "General" `org_channel` conversation so messaging keeps
 * working before Task 8 ports its functions. Slug is generated from the
 * name when not provided.
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    membershipModel: v.optional(membershipModel),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const name = args.name.trim();
    if (name.length === 0 || name.length > ORG_NAME_MAX) {
      badRequest("Name must be 1-100 characters");
    }
    if (args.description && args.description.length > ORG_DESCRIPTION_MAX) {
      badRequest("Description is too long");
    }

    const slug = args.slug?.trim() || slugify(name);
    if (slug.length === 0 || slug.length > ORG_SLUG_MAX) {
      badRequest("Slug must be 1-100 characters");
    }

    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Slug already taken",
      });
    }

    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      slug,
      name,
      description: args.description,
      membershipModel: args.membershipModel ?? "open",
      ownerId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("memberships", {
      orgId,
      userId: user._id,
      role: "admin",
      createdAt: now,
    });

    const conversationId = await ctx.db.insert("conversations", {
      type: "org_channel",
      name: "General",
      orgId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("conversationMembers", {
      conversationId,
      userId: user._id,
      joinedAt: now,
      unreadCount: 0,
    });

    const created = await ctx.db.get(orgId);
    if (!created) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Organization creation failed",
      });
    }
    return created;
  },
});

/**
 * Update org metadata. Admin or owner only. Only provided fields are touched
 * — `null` clears the description/avatar, `undefined` leaves them alone.
 */
export const update = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    avatarUrl: v.optional(v.union(v.string(), v.null())),
    membershipModel: v.optional(membershipModel),
  },
  handler: async (ctx, args) => {
    await requireOrgRole(ctx, args.orgId, "admin");

    const patch: {
      name?: string;
      description?: string;
      avatarUrl?: string;
      membershipModel?: MembershipModel;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > ORG_NAME_MAX) {
        badRequest("Name must be 1-100 characters");
      }
      patch.name = name;
    }
    if (args.description !== undefined) {
      if (args.description && args.description.length > ORG_DESCRIPTION_MAX) {
        badRequest("Description is too long");
      }
      patch.description = args.description ?? undefined;
    }
    if (args.avatarUrl !== undefined) {
      patch.avatarUrl = args.avatarUrl ?? undefined;
    }
    if (args.membershipModel !== undefined) {
      patch.membershipModel = args.membershipModel;
    }

    await ctx.db.patch(args.orgId, patch);
    const updated = await ctx.db.get(args.orgId);
    if (!updated) notFound("Organization not found");
    return updated;
  },
});

async function organizationDeletionBlockers(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
): Promise<string[]> {
  const blockers: string[] = [];

  const competitions = await ctx.db
    .query("competitions")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  if (competitions.length > 0) {
    blockers.push(`competitions (${competitions.length})`);
  }

  const orgPosts = await ctx.db
    .query("posts")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  const orgVisiblePosts = await ctx.db
    .query("posts")
    .withIndex("by_visibility_org_published", (q) =>
      q.eq("visibility", "organization").eq("visibilityOrgId", orgId),
    )
    .collect();
  const postIds = new Set<Id<"posts">>();
  for (const post of orgPosts) postIds.add(post._id);
  for (const post of orgVisiblePosts) postIds.add(post._id);
  if (postIds.size > 0) {
    blockers.push(`posts (${postIds.size})`);
  }

  return blockers;
}

/**
 * Delete an org. Owner only. Removes memberships, invites, join requests,
 * org channels and their member rows so the storage matches the legacy
 * cascading-delete behavior. Competitions and posts must be removed or
 * archived first so deletion cannot strand public/user-owned records.
 */
export const remove = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    if (org.ownerId !== user._id) {
      forbidden("Only the owner can delete this organization");
    }

    const blockers = await organizationDeletionBlockers(ctx, args.orgId);
    if (blockers.length > 0) {
      throw new ConvexError({
        code: "CONFLICT",
        message:
          "Cannot delete organization while referenced records exist: " +
          `${blockers.join(", ")}. Remove or archive them first.`,
      });
    }

    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);

    const invites = await ctx.db
      .query("orgInvites")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const i of invites) await ctx.db.delete(i._id);

    const joinRequests = await ctx.db
      .query("joinRequests")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const r of joinRequests) await ctx.db.delete(r._id);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const c of conversations) {
      const members = await ctx.db
        .query("conversationMembers")
        .withIndex("by_conversation_user", (q) =>
          q.eq("conversationId", c._id),
        )
        .collect();
      for (const m of members) await ctx.db.delete(m._id);
      await ctx.db.delete(c._id);
    }

    await ctx.db.delete(args.orgId);
    return { success: true };
  },
});

/**
 * Join an `open` org. Throws if the org is not open, if the caller already
 * belongs, or if the org doesn't exist. Adds the caller to every existing
 * org channel.
 */
export const join = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    if (org.membershipModel !== "open") {
      forbidden("This organization is not open to join directly");
    }

    const existing = await getMembership(ctx, args.orgId, user._id);
    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Already a member",
      });
    }

    const now = Date.now();
    const id = await ctx.db.insert("memberships", {
      orgId: args.orgId,
      userId: user._id,
      role: "member",
      createdAt: now,
    });

    await ensureOrgChannelMembership(ctx, args.orgId, user._id);

    const membership = await ctx.db.get(id);
    return membership;
  },
});

/**
 * Leave an org. The owner must transfer ownership first. Idempotent — a
 * non-member silently no-ops the membership delete, and the org channel
 * removal is also tolerant of missing rows.
 */
export const leave = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    if (org.ownerId === user._id) {
      forbidden("Owner cannot leave. Transfer ownership first.");
    }

    const membership = await getMembership(ctx, args.orgId, user._id);
    if (membership) await ctx.db.delete(membership._id);
    await removeFromOrgChannels(ctx, args.orgId, user._id);
    return { success: true };
  },
});

/**
 * Promote or demote another member. Admin or owner only. Cannot change the
 * owner's role.
 */
export const updateRole = mutation({
  args: {
    orgId: v.id("organizations"),
    targetUserId: v.id("users"),
    role: orgRole,
  },
  handler: async (ctx, args) => {
    const { org } = await requireOrgRole(ctx, args.orgId, "admin");
    if (org.ownerId === args.targetUserId) {
      forbidden("Cannot change the owner's role");
    }

    const membership = await getMembership(
      ctx,
      args.orgId,
      args.targetUserId,
    );
    if (!membership) notFound("Membership not found");
    await ctx.db.patch(membership._id, { role: args.role });
    const updated = await ctx.db.get(membership._id);
    return updated;
  },
});

/**
 * Transfer ownership to another admin member. Owner only. The new owner
 * must already be an admin member.
 */
export const transferOwnership = mutation({
  args: {
    orgId: v.id("organizations"),
    newOwnerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    if (org.ownerId !== user._id) {
      forbidden("Only the owner can transfer ownership");
    }

    const newOwnerMembership = await getMembership(
      ctx,
      args.orgId,
      args.newOwnerId,
    );
    if (!newOwnerMembership || newOwnerMembership.role !== "admin") {
      badRequest("New owner must be an admin member");
    }

    await ctx.db.patch(args.orgId, {
      ownerId: args.newOwnerId,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.orgId);
  },
});

/**
 * Generate a shareable invite link for an org. Returns the invite row whose
 * `token` is the URL token. Admin or owner only.
 */
export const generateInviteLink = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireOrgRole(ctx, args.orgId, "admin");

    const now = Date.now();
    const token = nanoid(INVITE_TOKEN_LENGTH);
    const id = await ctx.db.insert("orgInvites", {
      orgId: args.orgId,
      invitedBy: user._id,
      token,
      status: "pending",
      createdAt: now,
      expiresAt: invitesExpireAt(now),
    });
    const invite = await ctx.db.get(id);
    if (!invite) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Invite creation failed",
      });
    }
    return invite;
  },
});

/**
 * Send a direct invite to a specific user. Admin or owner only. Rejects if
 * the target is already a member or already has a pending direct invite.
 * Notifies the target via the social notification helper.
 */
export const sendInvite = mutation({
  args: {
    orgId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const inviter = await getCurrentUser(ctx);
    await requireOrgRole(ctx, args.orgId, "admin");

    const existingMembership = await getMembership(
      ctx,
      args.orgId,
      args.userId,
    );
    if (existingMembership) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "User is already a member",
      });
    }

    const invites = await ctx.db
      .query("orgInvites")
      .withIndex("by_invited_user", (q) => q.eq("invitedUserId", args.userId))
      .collect();
    const pending = invites.find(
      (i) => i.orgId === args.orgId && i.status === "pending",
    );
    if (pending) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "A pending invite already exists for this user",
      });
    }

    const now = Date.now();
    const id = await ctx.db.insert("orgInvites", {
      orgId: args.orgId,
      invitedUserId: args.userId,
      invitedBy: inviter._id,
      status: "pending",
      createdAt: now,
      expiresAt: invitesExpireAt(now),
    });

    await createNotification(ctx, {
      userId: args.userId,
      type: "org_invite",
      actorId: inviter._id,
      orgId: args.orgId,
    });

    return await ctx.db.get(id);
  },
});

/**
 * Accept an invite. Pass `inviteId` for a direct invite or `token` for a
 * link invite. Direct invites are marked `accepted`; link invites stay
 * `pending` so they remain reusable. Adds the user to all org channels.
 */
export const acceptInvite = mutation({
  args: {
    inviteId: v.optional(v.id("orgInvites")),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.inviteId === undefined && args.token === undefined) {
      badRequest("Either inviteId or token must be provided");
    }
    const user = await getCurrentUser(ctx);

    let invite: Doc<"orgInvites"> | null = null;
    if (args.inviteId !== undefined) {
      const found = await ctx.db.get(args.inviteId);
      if (
        found &&
        found.invitedUserId === user._id &&
        found.status === "pending"
      ) {
        invite = found;
      }
    } else if (args.token !== undefined) {
      const found = await ctx.db
        .query("orgInvites")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .unique();
      if (found && found.status === "pending") invite = found;
    }

    if (!invite) notFound("Invite not found or already used");
    if (invite.expiresAt < Date.now()) {
      badRequest("Invite has expired");
    }

    const existing = await getMembership(ctx, invite.orgId, user._id);
    if (!existing) {
      await ctx.db.insert("memberships", {
        orgId: invite.orgId,
        userId: user._id,
        role: "member",
        createdAt: Date.now(),
      });
    }

    if (invite.invitedUserId) {
      await ctx.db.patch(invite._id, { status: "accepted" });
    }

    await ensureOrgChannelMembership(ctx, invite.orgId, user._id);

    return { success: true };
  },
});

/**
 * Decline a direct invite the current user owns. Marks the invite
 * `declined`.
 */
export const declineInvite = mutation({
  args: { inviteId: v.id("orgInvites") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (
      !invite ||
      invite.invitedUserId !== user._id ||
      invite.status !== "pending"
    ) {
      notFound("Invite not found");
    }
    await ctx.db.patch(invite._id, { status: "declined" });
    return { success: true };
  },
});

/**
 * Request to join a `request` org. Notifies every admin of the org. Rejects
 * if the caller already belongs or already has a pending request.
 */
export const requestJoin = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    if (org.membershipModel !== "request") {
      forbidden("This organization does not accept join requests");
    }

    const existingMembership = await getMembership(
      ctx,
      args.orgId,
      user._id,
    );
    if (existingMembership) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Already a member",
      });
    }

    const prior = await ctx.db
      .query("joinRequests")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", user._id),
      )
      .unique();
    if (prior && prior.status === "pending") {
      throw new ConvexError({
        code: "CONFLICT",
        message: "A pending join request already exists",
      });
    }

    let id: Id<"joinRequests">;
    if (prior) {
      await ctx.db.patch(prior._id, {
        status: "pending",
        reviewedBy: undefined,
        reviewedAt: undefined,
        createdAt: Date.now(),
      });
      id = prior._id;
    } else {
      id = await ctx.db.insert("joinRequests", {
        orgId: args.orgId,
        userId: user._id,
        status: "pending",
        createdAt: Date.now(),
      });
    }

    const adminMemberships = await ctx.db
      .query("memberships")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId))
      .collect();
    const adminIds = adminMemberships
      .filter((m) => m.role === "admin")
      .map((m) => m.userId);

    for (const adminId of adminIds) {
      await createNotification(ctx, {
        userId: adminId,
        type: "join_request",
        actorId: user._id,
        orgId: args.orgId,
      });
    }

    return await ctx.db.get(id);
  },
});

/**
 * Approve a pending join request. Admin or owner only. Inserts membership,
 * notifies the requester, and adds them to all org channels.
 */
export const approveJoinRequest = mutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) notFound("Join request not found");
    const { user } = await requireOrgRole(ctx, request.orgId, "admin");

    if (request.status !== "pending") {
      badRequest("Request is not pending");
    }

    const existing = await getMembership(
      ctx,
      request.orgId,
      request.userId,
    );
    if (!existing) {
      await ctx.db.insert("memberships", {
        orgId: request.orgId,
        userId: request.userId,
        role: "member",
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedBy: user._id,
      reviewedAt: Date.now(),
    });

    await createNotification(ctx, {
      userId: request.userId,
      type: "join_approved",
      actorId: user._id,
      orgId: request.orgId,
    });

    await ensureOrgChannelMembership(ctx, request.orgId, request.userId);

    return await ctx.db.get(args.requestId);
  },
});

/**
 * Reject a pending join request. Admin or owner only. Records the reviewer
 * and timestamp; does not create a membership.
 */
export const rejectJoinRequest = mutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) notFound("Join request not found");
    const { user } = await requireOrgRole(ctx, request.orgId, "admin");

    if (request.status !== "pending") {
      badRequest("Request is not pending");
    }

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      reviewedBy: user._id,
      reviewedAt: Date.now(),
    });

    return await ctx.db.get(args.requestId);
  },
});
