import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";

/**
 * GDPR-style record removal requests — competitors can request that their
 * competition records be hidden from public results. Ported from
 * `src/domains/competitions/routers/record-removal.ts`.
 *
 * Review access is scoped to the competition's organizers/scrutineers instead
 * of a global platform-admin role.
 */

export const getMyRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const requests = await ctx.db
      .query("recordRemovalRequests")
      .withIndex("by_user_competition", (q) => q.eq("userId", user._id))
      .collect();
    return await Promise.all(
      requests.map(async (r) => {
        const comp = await ctx.db.get(r.competitionId);
        return {
          ...r,
          competitionName: comp?.name ?? null,
          competitionSlug: comp?.slug ?? null,
        };
      }),
    );
  },
});

export const listPending = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const requests = await ctx.db
      .query("recordRemovalRequests")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const pending = requests.filter((r) => r.status === "pending");
    return await Promise.all(
      pending.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        const comp = await ctx.db.get(r.competitionId);
        return {
          ...r,
          userName: user?.displayName ?? null,
          competitionName: comp?.name ?? null,
          competitionSlug: comp?.slug ?? null,
        };
      }),
    );
  },
});

export const getRequest = query({
  args: { requestId: v.id("recordRemovalRequests") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    if (request.userId !== currentUser._id) {
      await requireCompOrgRole(ctx, request.competitionId);
    }
    const user = await ctx.db.get(request.userId);
    const comp = await ctx.db.get(request.competitionId);
    const reg = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", request.competitionId).eq("userId", request.userId),
      )
      .unique();

    let userEntries: Array<{
      entryId: import("../_generated/dataModel").Id<"entries">;
      eventName: string;
    }> = [];
    if (reg) {
      const leaderEntries = await ctx.db
        .query("entries")
        .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", reg._id))
        .collect();
      const followerEntries = await ctx.db
        .query("entries")
        .withIndex("by_follower", (q) =>
          q.eq("followerRegistrationId", reg._id),
        )
        .collect();
      const entryList = [...leaderEntries, ...followerEntries];
      userEntries = await Promise.all(
        entryList.map(async (e) => {
          const event = await ctx.db.get(e.eventId);
          return { entryId: e._id, eventName: event?.name ?? "Unknown" };
        }),
      );
    }

    return {
      ...request,
      userName: user?.displayName ?? null,
      competitionName: comp?.name ?? null,
      entries: userEntries,
    };
  },
});

export const submit = mutation({
  args: {
    competitionId: v.id("competitions"),
    entryId: v.optional(v.id("entries")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "finished") {
      forbidden("Competition must be finished");
    }
    if (args.reason.trim().length === 0) badRequest("reason is required");

    const reg = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", user._id),
      )
      .unique();
    if (!reg) badRequest("You have no entries in this competition");

    if (args.entryId) {
      const entry = await ctx.db.get(args.entryId);
      if (!entry) badRequest("Entry not found");
      const event = await ctx.db.get(entry.eventId);
      if (!event || event.competitionId !== args.competitionId) {
        badRequest("Entry does not belong to this competition");
      }
      if (
        entry.leaderRegistrationId !== reg._id &&
        entry.followerRegistrationId !== reg._id
      ) {
        forbidden("Entry does not belong to your registration");
      }
    }

    const existing = await ctx.db
      .query("recordRemovalRequests")
      .withIndex("by_user_competition", (q) =>
        q.eq("userId", user._id).eq("competitionId", args.competitionId),
      )
      .collect();
    if (existing.some((r) => r.status === "pending")) {
      forbidden("You already have a pending removal request");
    }
    const id = await ctx.db.insert("recordRemovalRequests", {
      userId: user._id,
      competitionId: args.competitionId,
      entryId: args.entryId,
      reason: args.reason,
      status: "pending",
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

async function reviewRequest(
  ctx: import("../_generated/server").MutationCtx,
  requestId: import("../_generated/dataModel").Id<"recordRemovalRequests">,
  status: "approved" | "rejected",
  reviewNotes: string | undefined,
) {
  const request = await ctx.db.get(requestId);
  if (!request) notFound("Request not found");
  const { user: reviewer } = await requireCompOrgRole(
    ctx,
    request.competitionId,
  );
  if (request.status !== "pending") badRequest("Request is not pending");
  await ctx.db.patch(requestId, {
    status,
    reviewedBy: reviewer._id,
    reviewedAt: Date.now(),
    reviewNotes: reviewNotes,
  });
  return await ctx.db.get(requestId);
}

export const approve = mutation({
  args: {
    requestId: v.id("recordRemovalRequests"),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await reviewRequest(ctx, args.requestId, "approved", args.reviewNotes);
  },
});

export const reject = mutation({
  args: {
    requestId: v.id("recordRemovalRequests"),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await reviewRequest(ctx, args.requestId, "rejected", args.reviewNotes);
  },
});
