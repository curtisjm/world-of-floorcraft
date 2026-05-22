import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireIdentity } from "../lib/auth";
import { notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";

/**
 * Global judge directory + per-competition assignment. Ported from
 * `src/domains/competitions/routers/judge.ts` for Task 9 of the Convex
 * migration. Judges are not Convex `users` rows — they're a standalone
 * directory keyed by name so organizers can recruit panel members without
 * requiring them to register an account.
 */

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Substring-match search over `"firstName lastName"`. Authenticated users
 * only — matches the source router's protected procedure.
 */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const needle = args.query.trim().toLowerCase();
    if (needle.length === 0) return [];
    const judges = await ctx.db.query("judges").collect();
    return judges
      .filter((j) =>
        `${j.firstName} ${j.lastName}`.toLowerCase().includes(needle),
      )
      .slice(0, 20);
  },
});

/** Judges assigned to a competition, including their assignment row. */
export const listByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const assignments = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    return await Promise.all(
      assignments.map(async (a) => {
        const judge = await ctx.db.get(a.judgeId);
        return {
          _id: a._id,
          judgeId: a.judgeId,
          firstName: judge?.firstName ?? null,
          lastName: judge?.lastName ?? null,
          initials: judge?.initials ?? null,
          affiliation: judge?.affiliation ?? null,
          assignedAt: a.createdAt,
        };
      }),
    );
  },
});

// ── Mutations ───────────────────────────────────────────────────────

export const create = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    initials: v.optional(v.string()),
    affiliation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    if (args.firstName.length === 0 || args.lastName.length === 0) {
      throw new Error("First and last name are required");
    }
    if (args.initials && args.initials.length > 5) {
      throw new Error("Initials must be at most 5 characters");
    }
    const id = await ctx.db.insert("judges", {
      firstName: args.firstName,
      lastName: args.lastName,
      initials: args.initials,
      affiliation: args.affiliation,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const update = mutation({
  args: {
    judgeId: v.id("judges"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    initials: v.optional(v.union(v.string(), v.null())),
    affiliation: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    const judge = await ctx.db.get(args.judgeId);
    if (!judge) notFound("Judge not found");
    const patch: Record<string, unknown> = {};
    if (args.firstName !== undefined) patch.firstName = args.firstName;
    if (args.lastName !== undefined) patch.lastName = args.lastName;
    if (args.initials !== undefined) {
      patch.initials = args.initials ?? undefined;
    }
    if (args.affiliation !== undefined) {
      patch.affiliation = args.affiliation ?? undefined;
    }
    await ctx.db.patch(args.judgeId, patch);
    return await ctx.db.get(args.judgeId);
  },
});

export const assignToCompetition = mutation({
  args: {
    competitionId: v.id("competitions"),
    judgeId: v.id("judges"),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const judge = await ctx.db.get(args.judgeId);
    if (!judge) notFound("Judge not found");

    const existing = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", args.competitionId).eq("judgeId", args.judgeId),
      )
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Judge already assigned to this competition",
      });
    }

    const id = await ctx.db.insert("competitionJudges", {
      competitionId: args.competitionId,
      judgeId: args.judgeId,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const removeFromCompetition = mutation({
  args: {
    competitionId: v.id("competitions"),
    judgeId: v.id("judges"),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const existing = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", args.competitionId).eq("judgeId", args.judgeId),
      )
      .unique();
    if (!existing) notFound("Judge assignment not found");
    await ctx.db.delete(existing._id);
    return { success: true };
  },
});
