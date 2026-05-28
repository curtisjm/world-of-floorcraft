import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { notFound } from "../lib/errors";
import { requireCompOrgRole, requireCompStaffRole } from "../lib/permissions";

/**
 * Competitor number assignment. Ported from
 * `src/domains/competitions/routers/number.ts` for Task 9 of the Convex
 * migration. Auto-assignment numbers each registration that leads in at
 * least one event, skipping already-used numbers and the configured
 * exclusion list.
 */

function requirePositiveInteger(value: number, fieldName: string) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new ConvexError({
      code: "BAD_REQUEST",
      message: `${fieldName} must be a positive integer`,
    });
  }
}

export const listAssignments = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);
    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const active = regs.filter((r) => !r.cancelled);
    const enriched = await Promise.all(
      active.map(async (reg) => {
        const user = await ctx.db.get(reg.userId);
        return {
          registrationId: reg._id,
          userId: reg.userId,
          competitorNumber: reg.competitorNumber ?? null,
          displayName: user?.displayName ?? null,
          username: user?.username ?? null,
        };
      }),
    );
    enriched.sort(
      (a, b) =>
        (a.competitorNumber ?? Infinity) - (b.competitorNumber ?? Infinity),
    );
    return enriched;
  },
});

export const autoAssign = mutation({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const active = regs.filter((r) => !r.cancelled);

    // Registrations that lead in at least one entry without a number yet.
    const candidates = [] as typeof active;
    for (const reg of active) {
      if (reg.competitorNumber !== undefined) continue;
      const leads = await ctx.db
        .query("entries")
        .withIndex("by_leader", (q) =>
          q.eq("leaderRegistrationId", reg._id),
        )
        .first();
      if (leads) candidates.push(reg);
    }
    if (candidates.length === 0) return { assigned: 0 };

    const taken = new Set<number>();
    for (const reg of active) {
      if (typeof reg.competitorNumber === "number") {
        taken.add(reg.competitorNumber);
      }
    }
    const exclusions = new Set<number>(comp.numberExclusions ?? []);

    let nextNumber = comp.numberStart ?? 1;
    let assigned = 0;
    for (const reg of candidates) {
      while (taken.has(nextNumber) || exclusions.has(nextNumber)) {
        nextNumber++;
      }
      await ctx.db.patch(reg._id, { competitorNumber: nextNumber });
      taken.add(nextNumber);
      nextNumber++;
      assigned++;
    }
    return { assigned };
  },
});

export const manualAssign = mutation({
  args: {
    registrationId: v.id("competitionRegistrations"),
    number: v.number(),
  },
  handler: async (ctx, args) => {
    requirePositiveInteger(args.number, "number");
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);

    const conflicts = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_number", (q) =>
        q
          .eq("competitionId", reg.competitionId)
          .eq("competitorNumber", args.number),
      )
      .collect();
    const activeConflict = conflicts.find(
      (conflict) => !conflict.cancelled && conflict._id !== args.registrationId,
    );
    if (activeConflict) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Number ${args.number} is already assigned`,
      });
    }
    await ctx.db.patch(args.registrationId, { competitorNumber: args.number });
    return await ctx.db.get(args.registrationId);
  },
});

export const unassign = mutation({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    await ctx.db.patch(args.registrationId, { competitorNumber: undefined });
    return await ctx.db.get(args.registrationId);
  },
});

export const updateSettings = mutation({
  args: {
    competitionId: v.id("competitions"),
    numberStart: v.optional(v.number()),
    numberExclusions: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.numberStart !== undefined) {
      requirePositiveInteger(args.numberStart, "numberStart");
      patch.numberStart = args.numberStart;
    }
    if (args.numberExclusions !== undefined) {
      for (const exclusion of args.numberExclusions) {
        requirePositiveInteger(exclusion, "numberExclusions");
      }
      patch.numberExclusions = args.numberExclusions;
    }
    await ctx.db.patch(args.competitionId, patch);
    return await ctx.db.get(args.competitionId);
  },
});
