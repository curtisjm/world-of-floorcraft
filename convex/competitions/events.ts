import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import { competitionLevel, danceStyle, eventType } from "../schema";
import { generateDefaultEvents, type DanceStyle } from "./defaultEvents";

/**
 * Competition events + their ordered list of dances. Ported from
 * `src/domains/competitions/routers/event.ts` for Task 9 of the Convex
 * migration (docs/superpowers/plans/2026-05-22-convex-migration.md).
 *
 * `generateDefaults` reuses the pure-data style/level/dance configuration so
 * the migration doesn't duplicate competition product knowledge.
 */

// ── Queries ─────────────────────────────────────────────────────────

export const listByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    return await Promise.all(
      events.map(async (event) => {
        const dances = await ctx.db
          .query("eventDances")
          .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
          .collect();
        dances.sort((a, b) => a.position - b.position);
        return { ...event, dances };
      }),
    );
  },
});

export const getById = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const dances = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
      .collect();
    dances.sort((a, b) => a.position - b.position);
    return { ...event, dances };
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Generate the standard event list from `default-events.ts` for the given
 * styles. Attempts to assign each generated event to a matching session
 * block by matching style name (case-insensitive) to block label.
 */
export const generateDefaults = mutation({
  args: {
    competitionId: v.id("competitions"),
    styles: v.array(danceStyle),
  },
  handler: async (ctx, args) => {
    if (args.styles.length === 0) {
      throw new Error("Pick at least one style");
    }
    await requireCompOrgRole(ctx, args.competitionId);

    // Build a session lookup from this competition's days/blocks.
    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const sessionByLabel = new Map<string, Id<"scheduleBlocks">>();
    for (const day of days) {
      const blocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
        .collect();
      for (const block of blocks) {
        if (block.type === "session") {
          sessionByLabel.set(block.label.toLowerCase(), block._id);
        }
      }
    }

    const generated = generateDefaultEvents(args.styles as DanceStyle[]);
    const created: Doc<"competitionEvents">[] = [];
    for (let i = 0; i < generated.length; i++) {
      const g = generated[i]!;
      const sessionId = sessionByLabel.get(g.style);
      const eventId = await ctx.db.insert("competitionEvents", {
        competitionId: args.competitionId,
        sessionId: sessionId ?? undefined,
        name: g.name,
        style: g.style,
        level: g.level,
        eventType: g.eventType,
        position: i + 1,
      });
      for (let j = 0; j < g.dances.length; j++) {
        await ctx.db.insert("eventDances", {
          eventId,
          danceName: g.dances[j]!,
          position: j + 1,
        });
      }
      const event = await ctx.db.get(eventId);
      if (event) created.push(event);
    }
    return created;
  },
});

export const create = mutation({
  args: {
    competitionId: v.id("competitions"),
    sessionId: v.optional(v.union(v.id("scheduleBlocks"), v.null())),
    name: v.string(),
    style: danceStyle,
    level: competitionLevel,
    eventType,
    dances: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.name.length === 0 || args.dances.length === 0) {
      throw new Error("Event name and at least one dance are required");
    }
    await requireCompOrgRole(ctx, args.competitionId);

    const existing = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const maxPos = existing.reduce(
      (max, e) => Math.max(max, e.position ?? 0),
      0,
    );

    const eventId = await ctx.db.insert("competitionEvents", {
      competitionId: args.competitionId,
      sessionId: args.sessionId ?? undefined,
      name: args.name,
      style: args.style,
      level: args.level,
      eventType: args.eventType,
      position: maxPos + 1,
    });
    for (let i = 0; i < args.dances.length; i++) {
      await ctx.db.insert("eventDances", {
        eventId,
        danceName: args.dances[i]!,
        position: i + 1,
      });
    }
    const event = await ctx.db.get(eventId);
    const dances = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", eventId))
      .collect();
    dances.sort((a, b) => a.position - b.position);
    return { ...event!, dances };
  },
});

export const update = mutation({
  args: {
    eventId: v.id("competitionEvents"),
    name: v.optional(v.string()),
    sessionId: v.optional(v.union(v.id("scheduleBlocks"), v.null())),
    maxFinalSize: v.optional(v.union(v.number(), v.null())),
    maxHeatSize: v.optional(v.union(v.number(), v.null())),
    position: v.optional(v.number()),
    entryPrice: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const patch: Partial<Doc<"competitionEvents">> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.sessionId !== undefined) {
      patch.sessionId = args.sessionId ?? undefined;
    }
    if (args.maxFinalSize !== undefined) {
      patch.maxFinalSize = args.maxFinalSize ?? undefined;
    }
    if (args.maxHeatSize !== undefined) {
      patch.maxHeatSize = args.maxHeatSize ?? undefined;
    }
    if (args.position !== undefined) patch.position = args.position;
    if (args.entryPrice !== undefined) {
      patch.entryPrice = args.entryPrice ?? undefined;
    }
    await ctx.db.patch(args.eventId, patch);
    return await ctx.db.get(args.eventId);
  },
});

async function loadRoundsByEvent(
  ctx: MutationCtx,
  eventId: Id<"competitionEvents">,
) {
  return await ctx.db
    .query("rounds")
    .withIndex("by_event_position", (q) => q.eq("eventId", eventId))
    .collect();
}

async function deleteRoundGraph(ctx: MutationCtx, round: Doc<"rounds">) {
  const heatAssignmentIds = new Set<Id<"heatAssignments">>();

  const activeRounds = await ctx.db
    .query("activeRounds")
    .withIndex("by_round", (q) => q.eq("roundId", round._id))
    .collect();
  for (const active of activeRounds) await ctx.db.delete(active._id);

  const deckCheckins = await ctx.db
    .query("deckCaptainCheckins")
    .withIndex("by_round_entry", (q) => q.eq("roundId", round._id))
    .collect();
  for (const checkin of deckCheckins) await ctx.db.delete(checkin._id);

  const callbackMarks = await ctx.db
    .query("callbackMarks")
    .withIndex("by_round_judge_entry", (q) => q.eq("roundId", round._id))
    .collect();
  for (const mark of callbackMarks) await ctx.db.delete(mark._id);

  const finalMarks = await ctx.db
    .query("finalMarks")
    .withIndex("by_round_judge_entry_dance", (q) =>
      q.eq("roundId", round._id),
    )
    .collect();
  for (const mark of finalMarks) await ctx.db.delete(mark._id);

  const judgeSubmissions = await ctx.db
    .query("judgeSubmissions")
    .withIndex("by_round_judge", (q) => q.eq("roundId", round._id))
    .collect();
  for (const submission of judgeSubmissions) {
    await ctx.db.delete(submission._id);
  }

  const callbackResults = await ctx.db
    .query("callbackResults")
    .withIndex("by_round_entry", (q) => q.eq("roundId", round._id))
    .collect();
  for (const result of callbackResults) await ctx.db.delete(result._id);

  const finalResults = await ctx.db
    .query("finalResults")
    .withIndex("by_round_entry_dance", (q) => q.eq("roundId", round._id))
    .collect();
  for (const result of finalResults) await ctx.db.delete(result._id);

  const tabulationTables = await ctx.db
    .query("tabulationTables")
    .withIndex("by_round_entry_dance", (q) => q.eq("roundId", round._id))
    .collect();
  for (const table of tabulationTables) await ctx.db.delete(table._id);

  const roundMetas = await ctx.db
    .query("roundResultsMeta")
    .withIndex("by_round", (q) => q.eq("roundId", round._id))
    .collect();
  for (const meta of roundMetas) await ctx.db.delete(meta._id);

  const markCorrections = await ctx.db
    .query("markCorrections")
    .withIndex("by_round", (q) => q.eq("roundId", round._id))
    .collect();
  for (const correction of markCorrections) {
    await ctx.db.delete(correction._id);
  }

  const heats = await ctx.db
    .query("heats")
    .withIndex("by_round_number", (q) => q.eq("roundId", round._id))
    .collect();
  for (const heat of heats) {
    const assignments = await ctx.db
      .query("heatAssignments")
      .withIndex("by_heat_entry", (q) => q.eq("heatId", heat._id))
      .collect();
    for (const assignment of assignments) {
      heatAssignmentIds.add(assignment._id);
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(heat._id);
  }

  await ctx.db.delete(round._id);
  return heatAssignmentIds;
}

async function deleteEntryGraphForEvent(
  ctx: MutationCtx,
  eventId: Id<"competitionEvents">,
  heatAssignmentIds: Set<Id<"heatAssignments">>,
) {
  const eventEntries = await ctx.db
    .query("entries")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();

  for (const entry of eventEntries) {
    const assignments = await ctx.db
      .query("heatAssignments")
      .withIndex("by_entry", (q) => q.eq("entryId", entry._id))
      .collect();
    for (const assignment of assignments) heatAssignmentIds.add(assignment._id);
  }
  for (const assignmentId of heatAssignmentIds) {
    const assignment = await ctx.db.get(assignmentId);
    if (assignment) await ctx.db.delete(assignmentId);
  }

  for (const entry of eventEntries) await ctx.db.delete(entry._id);
}

async function deleteEventMetadata(
  ctx: MutationCtx,
  eventId: Id<"competitionEvents">,
) {
  const timeOverrides = await ctx.db
    .query("eventTimeOverrides")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  for (const override of timeOverrides) await ctx.db.delete(override._id);

  const dances = await ctx.db
    .query("eventDances")
    .withIndex("by_event_position", (q) => q.eq("eventId", eventId))
    .collect();
  for (const d of dances) await ctx.db.delete(d._id);
}

export const remove = mutation({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const rounds = await loadRoundsByEvent(ctx, args.eventId);
    const heatAssignmentIds = new Set<Id<"heatAssignments">>();
    for (const round of rounds) {
      const roundHeatAssignmentIds = await deleteRoundGraph(ctx, round);
      for (const assignmentId of roundHeatAssignmentIds) {
        heatAssignmentIds.add(assignmentId);
      }
    }

    await deleteEntryGraphForEvent(ctx, args.eventId, heatAssignmentIds);
    await deleteEventMetadata(ctx, args.eventId);

    await ctx.db.delete(args.eventId);
    return { success: true };
  },
});

export const reorderInSession = mutation({
  args: {
    sessionId: v.id("scheduleBlocks"),
    eventIds: v.array(v.id("competitionEvents")),
  },
  handler: async (ctx, args) => {
    const block = await ctx.db.get(args.sessionId);
    if (!block) notFound("Session not found");
    const day = await ctx.db.get(block.dayId);
    if (!day) notFound("Day not found");
    await requireCompOrgRole(ctx, day.competitionId);

    for (let i = 0; i < args.eventIds.length; i++) {
      const e = await ctx.db.get(args.eventIds[i]!);
      if (!e || e.sessionId !== args.sessionId) continue;
      await ctx.db.patch(args.eventIds[i]!, { position: i + 1 });
    }
    return { success: true };
  },
});

/**
 * Replace the ordered dance list for an event. Wipes and re-inserts so the
 * resulting positions are 1..N without gaps.
 */
export const updateDances = mutation({
  args: {
    eventId: v.id("competitionEvents"),
    dances: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.dances.length === 0) {
      throw new Error("At least one dance is required");
    }
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const existing = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    for (const d of existing) await ctx.db.delete(d._id);

    for (let i = 0; i < args.dances.length; i++) {
      await ctx.db.insert("eventDances", {
        eventId: args.eventId,
        danceName: args.dances[i]!,
        position: i + 1,
      });
    }
    const dances = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    dances.sort((a, b) => a.position - b.position);
    return { ...event, dances };
  },
});
