import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getCurrentUser } from "../lib/auth";
import { forbidden, notFound } from "../lib/errors";
import { requireCompStaffRole } from "../lib/permissions";

/**
 * Team-match submissions — short text payload sent by an organization's
 * representative to the staff. Ported from
 * `src/domains/competitions/routers/team-match.ts` for Task 9 of the Convex
 * migration.
 */

const MAX_CONTENT = 2000;

export const listByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, []);
    const submissions = await ctx.db
      .query("teamMatchSubmissions")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    submissions.sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(
      submissions.map(async (s) => {
        const user = await ctx.db.get(s.userId);
        return {
          _id: s._id,
          content: s.content,
          createdAt: s.createdAt,
          displayName: user?.displayName ?? null,
          username: user?.username ?? null,
        };
      }),
    );
  },
});

export const submit = mutation({
  args: {
    competitionId: v.id("competitions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (args.content.length === 0 || args.content.length > MAX_CONTENT) {
      throw new Error(`Content must be 1-${MAX_CONTENT} characters`);
    }
    const id = await ctx.db.insert("teamMatchSubmissions", {
      competitionId: args.competitionId,
      userId: user._id,
      content: args.content,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { submissionId: v.id("teamMatchSubmissions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const submission = await ctx.db.get(args.submissionId);
    if (!submission) notFound("Submission not found");
    if (submission.userId !== user._id) {
      forbidden("Can only delete your own submission");
    }
    await ctx.db.delete(args.submissionId);
    return { success: true };
  },
});
