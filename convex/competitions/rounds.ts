import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { badRequest, notFound } from "../lib/errors";
import { requireCompOrgRole, requireCompStaffRole } from "../lib/permissions";
import { roundStatus, roundType } from "../schema";

/**
 * Round generation, heat assignment, and per-heat entry placement — ported
 * from `src/domains/competitions/routers/round.ts` for Task 10 of the Convex
 * migration. Behavior preserved: heat redistribution is round-robin, default
 * max heat size is 20, default max final size is 8, and the recall rate for
 * structure determination is 55%.
 */

const DEFAULT_MAX_FINAL = 8;
const DEFAULT_MAX_HEAT = 20;
const RECALL_RATE = 0.55;

function determineRoundStructure(
  entryCount: number,
  maxFinalSize: number,
): Doc<"rounds">["roundType"][] {
  if (entryCount <= maxFinalSize) return ["final"];

  const roundTypes: Doc<"rounds">["roundType"][] = ["final"];
  let remaining = entryCount;

  remaining = Math.ceil(remaining * RECALL_RATE);
  if (remaining > maxFinalSize) {
    roundTypes.unshift("semi_final");
    remaining = Math.ceil(entryCount * RECALL_RATE);
    if (remaining > maxFinalSize * 2) {
      roundTypes.unshift("quarter_final");
      remaining = Math.ceil(entryCount * RECALL_RATE);
      if (remaining > maxFinalSize * 3) {
        roundTypes.unshift("2nd_round");
        remaining = Math.ceil(entryCount * RECALL_RATE);
        if (remaining > maxFinalSize * 4) {
          roundTypes.unshift("1st_round");
        }
      }
    }
  } else {
    roundTypes.unshift("semi_final");
  }

  return roundTypes;
}

function distributeToHeats<T>(entryIds: T[], maxHeatSize: number): T[][] {
  if (entryIds.length <= maxHeatSize) return [entryIds];
  const numHeats = Math.ceil(entryIds.length / maxHeatSize);
  const heatsArr: T[][] = Array.from({ length: numHeats }, () => []);
  entryIds.forEach((id, i) => {
    heatsArr[i % numHeats]!.push(id);
  });
  return heatsArr;
}

async function loadHeatsWithEntries(
  ctx: QueryCtx | MutationCtx,
  roundId: Id<"rounds">,
) {
  const roundHeats = await ctx.db
    .query("heats")
    .withIndex("by_round_number", (q) => q.eq("roundId", roundId))
    .collect();
  roundHeats.sort((a, b) => a.heatNumber - b.heatNumber);
  const heatsWithEntries = [];
  for (const heat of roundHeats) {
    const assignments = await ctx.db
      .query("heatAssignments")
      .withIndex("by_heat_entry", (q) => q.eq("heatId", heat._id))
      .collect();
    heatsWithEntries.push({
      ...heat,
      entries: assignments.map((a) => a.entryId),
    });
  }
  return heatsWithEntries;
}

async function deleteRoundCascade(ctx: MutationCtx, roundId: Id<"rounds">) {
  const roundHeats = await ctx.db
    .query("heats")
    .withIndex("by_round_number", (q) => q.eq("roundId", roundId))
    .collect();
  for (const heat of roundHeats) {
    const assignments = await ctx.db
      .query("heatAssignments")
      .withIndex("by_heat_entry", (q) => q.eq("heatId", heat._id))
      .collect();
    for (const a of assignments) await ctx.db.delete(a._id);
    await ctx.db.delete(heat._id);
  }
  const submissions = await ctx.db
    .query("judgeSubmissions")
    .withIndex("by_round_judge", (q) => q.eq("roundId", roundId))
    .collect();
  for (const s of submissions) await ctx.db.delete(s._id);
  const callbackMarks = await ctx.db
    .query("callbackMarks")
    .withIndex("by_round_judge_entry", (q) => q.eq("roundId", roundId))
    .collect();
  for (const m of callbackMarks) await ctx.db.delete(m._id);
  const finalMarks = await ctx.db
    .query("finalMarks")
    .withIndex("by_round_judge_entry_dance", (q) => q.eq("roundId", roundId))
    .collect();
  for (const m of finalMarks) await ctx.db.delete(m._id);
  const callbackResults = await ctx.db
    .query("callbackResults")
    .withIndex("by_round_entry", (q) => q.eq("roundId", roundId))
    .collect();
  for (const r of callbackResults) await ctx.db.delete(r._id);
  const finalResults = await ctx.db
    .query("finalResults")
    .withIndex("by_round_entry_dance", (q) => q.eq("roundId", roundId))
    .collect();
  for (const r of finalResults) await ctx.db.delete(r._id);
  const tabulationTables = await ctx.db
    .query("tabulationTables")
    .withIndex("by_round_entry_dance", (q) => q.eq("roundId", roundId))
    .collect();
  for (const t of tabulationTables) await ctx.db.delete(t._id);
  const meta = await ctx.db
    .query("roundResultsMeta")
    .withIndex("by_round", (q) => q.eq("roundId", roundId))
    .unique();
  if (meta) await ctx.db.delete(meta._id);
  await ctx.db.delete(roundId);
}

// ── Queries ─────────────────────────────────────────────────────────

export const listByEvent = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    eventRounds.sort((a, b) => a.position - b.position);

    const result = [];
    for (const round of eventRounds) {
      const heatsWithEntries = await loadHeatsWithEntries(ctx, round._id);
      result.push({ ...round, heats: heatsWithEntries });
    }
    return result;
  },
});

export const getById = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const heatsWithEntries = await loadHeatsWithEntries(ctx, round._id);
    return { ...round, heats: heatsWithEntries };
  },
});

// ── Mutations ───────────────────────────────────────────────────────

async function generateRoundsForEvent(
  ctx: MutationCtx,
  event: Doc<"competitionEvents">,
  comp: Doc<"competitions">,
) {
  const maxFinal = event.maxFinalSize ?? comp.maxFinalSize ?? DEFAULT_MAX_FINAL;
  const maxHeatSize = event.maxHeatSize ?? comp.maxHeatSize ?? DEFAULT_MAX_HEAT;

  const allEntries = await ctx.db
    .query("entries")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .collect();
  const active = allEntries.filter((e) => !e.scratched);
  if (active.length === 0) return { rounds: 0, heats: 0 };

  const existing = await ctx.db
    .query("rounds")
    .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
    .collect();
  for (const r of existing) {
    await deleteRoundCascade(ctx, r._id);
  }

  const structure = determineRoundStructure(active.length, maxFinal);
  let totalHeats = 0;

  for (let i = 0; i < structure.length; i++) {
    const type = structure[i]!;
    const newRoundId = await ctx.db.insert("rounds", {
      eventId: event._id,
      roundType: type,
      position: i + 1,
      status: "pending",
      heatsApproved: false,
    });

    if (i === 0) {
      const entryIds = active.map((e) => e._id);
      const groups = distributeToHeats(entryIds, maxHeatSize);
      for (let h = 0; h < groups.length; h++) {
        const heatId = await ctx.db.insert("heats", {
          roundId: newRoundId,
          heatNumber: h + 1,
          status: "pending",
        });
        for (const entryId of groups[h]!) {
          await ctx.db.insert("heatAssignments", { heatId, entryId });
        }
        totalHeats++;
      }
    } else if (type === "final" && structure.length === 1) {
      const heatId = await ctx.db.insert("heats", {
        roundId: newRoundId,
        heatNumber: 1,
        status: "pending",
      });
      for (const e of active) {
        await ctx.db.insert("heatAssignments", { heatId, entryId: e._id });
      }
      totalHeats++;
    }
  }

  return { rounds: structure.length, heats: totalHeats };
}

export const generateForCompetition = mutation({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const { competition } = await requireCompStaffRole(
      ctx,
      args.competitionId,
      ["chairman"],
    );

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    let totalRounds = 0;
    let totalHeats = 0;

    for (const event of events) {
      const result = await generateRoundsForEvent(ctx, event, competition);
      totalRounds += result.rounds;
      totalHeats += result.heats;
    }
    return { events: events.length, totalRounds, totalHeats };
  },
});

export const generateForEvent = mutation({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    const { competition } = await requireCompStaffRole(
      ctx,
      event.competitionId,
      ["chairman"],
    );
    return generateRoundsForEvent(ctx, event, competition);
  },
});

export const update = mutation({
  args: {
    roundId: v.id("rounds"),
    callbacksRequested: v.optional(v.number()),
    status: v.optional(roundStatus),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const patch: Partial<Doc<"rounds">> = {};
    if (args.callbacksRequested !== undefined) {
      if (args.callbacksRequested < 1) {
        badRequest("callbacksRequested must be >= 1");
      }
      patch.callbacksRequested = args.callbacksRequested;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
    }
    await ctx.db.patch(args.roundId, patch);
    return await ctx.db.get(args.roundId);
  },
});

export const addRound = mutation({
  args: {
    eventId: v.id("competitionEvents"),
    roundType: roundType,
    position: v.number(),
    callbacksRequested: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    if (args.position < 1) badRequest("position must be >= 1");

    const id = await ctx.db.insert("rounds", {
      eventId: args.eventId,
      roundType: args.roundType,
      position: args.position,
      callbacksRequested: args.callbacksRequested,
      status: "pending",
      heatsApproved: false,
    });
    return await ctx.db.get(id);
  },
});

export const removeRound = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);
    await deleteRoundCascade(ctx, args.roundId);
    return { deleted: true };
  },
});

export const reassignHeats = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    const { competition } = await requireCompOrgRole(ctx, event.competitionId);
    const maxHeatSize =
      event.maxHeatSize ?? competition.maxHeatSize ?? DEFAULT_MAX_HEAT;

    const all = await ctx.db
      .query("entries")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    const active = all.filter((e) => !e.scratched);
    const entryIds = active.map((e) => e._id);

    await ctx.db.patch(round._id, { heatsApproved: false });

    const existing = await ctx.db
      .query("heats")
      .withIndex("by_round_number", (q) => q.eq("roundId", round._id))
      .collect();
    for (const h of existing) {
      const assignments = await ctx.db
        .query("heatAssignments")
        .withIndex("by_heat_entry", (q) => q.eq("heatId", h._id))
        .collect();
      for (const a of assignments) await ctx.db.delete(a._id);
      await ctx.db.delete(h._id);
    }

    const groups = distributeToHeats(entryIds, maxHeatSize);
    let created = 0;
    for (let i = 0; i < groups.length; i++) {
      const heatId = await ctx.db.insert("heats", {
        roundId: round._id,
        heatNumber: i + 1,
        status: "pending",
      });
      for (const entryId of groups[i]!) {
        await ctx.db.insert("heatAssignments", { heatId, entryId });
      }
      created++;
    }
    return { heats: created, entries: entryIds.length };
  },
});

export const approveHeats = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompStaffRole(ctx, event.competitionId, ["chairman"]);
    await ctx.db.patch(args.roundId, { heatsApproved: true });
    return await ctx.db.get(args.roundId);
  },
});

export const moveEntry = mutation({
  args: {
    entryId: v.id("entries"),
    fromHeatId: v.id("heats"),
    toHeatId: v.id("heats"),
  },
  handler: async (ctx, args) => {
    const fromHeat = await ctx.db.get(args.fromHeatId);
    const toHeat = await ctx.db.get(args.toHeatId);
    if (!fromHeat || !toHeat) notFound("Heat not found");
    if (fromHeat.roundId !== toHeat.roundId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Heats must be in the same round",
      });
    }
    const round = await ctx.db.get(fromHeat.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const existing = await ctx.db
      .query("heatAssignments")
      .withIndex("by_heat_entry", (q) =>
        q.eq("heatId", args.fromHeatId).eq("entryId", args.entryId),
      )
      .collect();
    for (const a of existing) await ctx.db.delete(a._id);

    const newId = await ctx.db.insert("heatAssignments", {
      heatId: args.toHeatId,
      entryId: args.entryId,
    });
    return await ctx.db.get(newId);
  },
});
