import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { forbidden, notFound } from "../lib/errors";
import { requireCompStaffRole } from "../lib/permissions";
import { addDropType } from "../schema";
import {
  applyApprovedAddDropRequest,
  computeAffectsRounds,
  validateAddDropRequest,
} from "./integrity";

/**
 * Add/drop requests submitted after entries close. Ported from
 * `src/domains/competitions/routers/add-drop.ts` for Task 9 of the Convex
 * migration. `affectsRounds` is computed at submission time based on the
 * event's max final size, so the dashboard can sort safe-vs-needs-review
 * without re-running the count.
 */

// ── Queries ─────────────────────────────────────────────────────────

export const listByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);
    const requests = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    requests.sort((a, b) => a.createdAt - b.createdAt);
    const safe = requests.filter((r) => r.status === "pending" && !r.affectsRounds);
    const needsReview = requests.filter(
      (r) => r.status === "pending" && r.affectsRounds,
    );
    const resolved = requests.filter((r) => r.status !== "pending");
    return { safe, needsReview, resolved };
  },
});

export const listByRegistration = query({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    if (reg.userId !== user._id) {
      await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    }
    const requests = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", reg.competitionId),
      )
      .collect();
    return requests
      .filter((r) => r.leaderRegistrationId === args.registrationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  },
});

// ── Mutations ───────────────────────────────────────────────────────

export const submit = mutation({
  args: {
    competitionId: v.id("competitions"),
    type: addDropType,
    eventId: v.id("competitionEvents"),
    leaderRegistrationId: v.id("competitionRegistrations"),
    followerRegistrationId: v.id("competitionRegistrations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "entries_closed") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message:
          "Add/drop requests can only be submitted when entries are closed",
      });
    }

    const { leaderReg, followerReg } = await validateAddDropRequest(ctx, args);

    const isPartner =
      user._id === leaderReg.userId || user._id === followerReg.userId;
    let isOrgAdmin = false;
    if (!isPartner && leaderReg.orgId) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", leaderReg.orgId!).eq("userId", user._id),
        )
        .unique();
      isOrgAdmin = membership?.role === "admin";
    }
    if (!isPartner && !isOrgAdmin) {
      forbidden("Must be a partner or org admin to submit add/drop requests");
    }

    const affectsRounds = await computeAffectsRounds(
      ctx,
      args.eventId,
      args.type,
      comp.maxFinalSize,
    );

    const id = await ctx.db.insert("addDropRequests", {
      competitionId: args.competitionId,
      submittedBy: user._id,
      type: args.type,
      eventId: args.eventId,
      leaderRegistrationId: args.leaderRegistrationId,
      followerRegistrationId: args.followerRegistrationId,
      reason: args.reason,
      status: "pending",
      affectsRounds,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const approve = mutation({
  args: { requestId: v.id("addDropRequests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) notFound("Request not found");
    await requireCompStaffRole(ctx, request.competitionId, ["registration"]);
    if (request.status !== "pending") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Request already resolved",
      });
    }

    await applyApprovedAddDropRequest(ctx, request, user._id);
    return await ctx.db.get(args.requestId);
  },
});

export const reject = mutation({
  args: {
    requestId: v.id("addDropRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) notFound("Request not found");
    await requireCompStaffRole(ctx, request.competitionId, ["registration"]);
    if (request.status !== "pending") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Request already resolved",
      });
    }
    await ctx.db.patch(args.requestId, {
      status: "rejected",
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      reviewNotes: args.reason,
    });
    return await ctx.db.get(args.requestId);
  },
});

/**
 * Approve every pending request that doesn't affect round structure. Used by
 * the dashboard "approve all safe" button — the dashboard surfaces the
 * remaining `needsReview` requests separately for organizer judgment.
 */
export const approveAllSafe = mutation({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);

    const requests = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", args.competitionId).eq("status", "pending"),
      )
      .collect();
    const safe = requests.filter((r) => !r.affectsRounds);

    let approved = 0;
    for (const request of safe) {
      await applyApprovedAddDropRequest(ctx, request, user._id);
      approved++;
    }
    return { approved };
  },
});
