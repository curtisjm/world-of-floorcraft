import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import { competitionStaffRole } from "../schema";

/**
 * Competition staff assignments. Ported from
 * `src/domains/competitions/routers/staff.ts` for Task 9 of the Convex
 * migration. Staff are existing Convex `users` rows with a per-competition
 * role (scrutineer, chairman, judge, emcee, deck_captain, registration, dj).
 */

// ── Queries ─────────────────────────────────────────────────────────

export const listByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const rows = await ctx.db
      .query("competitionStaff")
      .withIndex("by_competition_user_role", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    return await Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db.get(row.userId);
        return {
          _id: row._id,
          userId: row.userId,
          role: row.role,
          createdAt: row.createdAt,
          username: user?.username ?? null,
          displayName: user?.displayName ?? null,
        };
      }),
    );
  },
});

// ── Mutations ───────────────────────────────────────────────────────

export const assign = mutation({
  args: {
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    role: competitionStaffRole,
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const target = await ctx.db.get(args.userId);
    if (!target) notFound("User not found");

    const existing = await ctx.db
      .query("competitionStaff")
      .withIndex("by_competition_user_role", (q) =>
        q
          .eq("competitionId", args.competitionId)
          .eq("userId", args.userId)
          .eq("role", args.role),
      )
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "User already has this role",
      });
    }

    const id = await ctx.db.insert("competitionStaff", {
      competitionId: args.competitionId,
      userId: args.userId,
      role: args.role,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: {
    competitionId: v.id("competitions"),
    userId: v.id("users"),
    role: competitionStaffRole,
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const existing = await ctx.db
      .query("competitionStaff")
      .withIndex("by_competition_user_role", (q) =>
        q
          .eq("competitionId", args.competitionId)
          .eq("userId", args.userId)
          .eq("role", args.role),
      )
      .unique();
    if (!existing) notFound("Staff assignment not found");
    await ctx.db.delete(existing._id);
    return { success: true };
  },
});
