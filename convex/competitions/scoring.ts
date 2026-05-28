import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import {
  singleDance,
  multiDance,
  tallyCallbacks,
  type Marks,
} from "./lib/scoring";

type Ctx = MutationCtx | QueryCtx;

export async function loadRoundEventForCompetition(
  ctx: Ctx,
  roundId: Id<"rounds">,
  competitionId?: Id<"competitions">,
) {
  const round = await ctx.db.get(roundId);
  if (!round) notFound("Round not found");
  const event = await ctx.db.get(round.eventId);
  if (!event) notFound("Event not found");
  if (competitionId !== undefined && event.competitionId !== competitionId) {
    badRequest("Round does not belong to this competition");
  }
  return { round, event, competitionId: event.competitionId };
}

export async function requireScoringStaffForRound(
  ctx: Ctx,
  roundId: Id<"rounds">,
) {
  const roundEvent = await loadRoundEventForCompetition(ctx, roundId);
  await requireCompOrgRole(ctx, roundEvent.event.competitionId);
  return roundEvent;
}

export async function requireJudgeAssignedToCompetition(
  ctx: Ctx,
  competitionId: Id<"competitions">,
  judgeId: Id<"judges">,
) {
  const assignment = await ctx.db
    .query("competitionJudges")
    .withIndex("by_competition_judge", (q) =>
      q.eq("competitionId", competitionId).eq("judgeId", judgeId),
    )
    .unique();
  if (!assignment) badRequest("Judge is not assigned to this competition");
}

export async function validateEntriesBelongToEvent(
  ctx: Ctx,
  eventId: Id<"competitionEvents">,
  entryIds: Id<"entries">[],
) {
  for (const entryId of [...new Set(entryIds)]) {
    const entry = await ctx.db.get(entryId);
    if (!entry || entry.eventId !== eventId) {
      badRequest("Entry does not belong to this round's event");
    }
  }
}

export async function validateDanceNamesForEvent(
  ctx: Ctx,
  eventId: Id<"competitionEvents">,
  danceNames: string[],
) {
  const dances = await ctx.db
    .query("eventDances")
    .withIndex("by_event_position", (q) => q.eq("eventId", eventId))
    .collect();
  const validDanceNames = new Set(dances.map((d) => d.danceName));
  for (const danceName of [...new Set(danceNames)]) {
    if (!validDanceNames.has(danceName)) {
      badRequest("Dance is not part of this event");
    }
  }
}

/**
 * Mark submission and result computation — ported from
 * `src/domains/competitions/routers/scoring.ts`.
 *
 * Public submit* mutations require an authenticated Clerk user (the staff
 * UI). Judge tablet submissions go through `convex/competitions/judgeSession`
 * which authenticates via the judge JWT instead.
 */

export async function upsertJudgeSubmission(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
  judgeId: Id<"judges">,
) {
  const existing = await ctx.db
    .query("judgeSubmissions")
    .withIndex("by_round_judge", (q) =>
      q.eq("roundId", roundId).eq("judgeId", judgeId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: "submitted",
      submittedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("judgeSubmissions", {
      roundId,
      judgeId,
      status: "submitted",
      submittedAt: Date.now(),
    });
  }
}

export async function writeCallbackMarks(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
  judgeId: Id<"judges">,
  marks: Array<{ entryId: Id<"entries">; marked: boolean }>,
) {
  for (const mark of marks) {
    const existing = await ctx.db
      .query("callbackMarks")
      .withIndex("by_round_judge_entry", (q) =>
        q
          .eq("roundId", roundId)
          .eq("judgeId", judgeId)
          .eq("entryId", mark.entryId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { marked: mark.marked });
    } else {
      await ctx.db.insert("callbackMarks", {
        roundId,
        judgeId,
        entryId: mark.entryId,
        marked: mark.marked,
      });
    }
  }
}

export async function writeFinalMarks(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
  judgeId: Id<"judges">,
  marks: Array<{
    entryId: Id<"entries">;
    danceName: string;
    placement: number;
  }>,
) {
  const danceNames = [...new Set(marks.map((m) => m.danceName))];
  for (const danceName of danceNames) {
    const existing = await ctx.db
      .query("finalMarks")
      .withIndex("by_round_judge_dance_placement", (q) =>
        q
          .eq("roundId", roundId)
          .eq("judgeId", judgeId)
          .eq("danceName", danceName),
      )
      .collect();
    for (const m of existing) await ctx.db.delete(m._id);
  }
  for (const mark of marks) {
    await ctx.db.insert("finalMarks", {
      roundId,
      judgeId,
      entryId: mark.entryId,
      danceName: mark.danceName,
      placement: mark.placement,
    });
  }
}

// ── Mark submission ─────────────────────────────────────────────────

export const submitCallbackMarks = mutation({
  args: {
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    marks: v.array(
      v.object({
        entryId: v.id("entries"),
        marked: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { event } = await requireScoringStaffForRound(ctx, args.roundId);
    await requireJudgeAssignedToCompetition(
      ctx,
      event.competitionId,
      args.judgeId,
    );
    await validateEntriesBelongToEvent(
      ctx,
      event._id,
      args.marks.map((m) => m.entryId),
    );

    await writeCallbackMarks(ctx, args.roundId, args.judgeId, args.marks);
    await upsertJudgeSubmission(ctx, args.roundId, args.judgeId);
    return { submitted: args.marks.length };
  },
});

export const submitFinalMarks = mutation({
  args: {
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    marks: v.array(
      v.object({
        entryId: v.id("entries"),
        danceName: v.string(),
        placement: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { event } = await requireScoringStaffForRound(ctx, args.roundId);
    await requireJudgeAssignedToCompetition(
      ctx,
      event.competitionId,
      args.judgeId,
    );
    await validateEntriesBelongToEvent(
      ctx,
      event._id,
      args.marks.map((m) => m.entryId),
    );
    await validateDanceNamesForEvent(
      ctx,
      event._id,
      args.marks.map((m) => m.danceName),
    );
    for (const m of args.marks) {
      if (m.placement < 1) badRequest("placement must be >= 1");
    }
    await writeFinalMarks(ctx, args.roundId, args.judgeId, args.marks);
    await upsertJudgeSubmission(ctx, args.roundId, args.judgeId);
    return { submitted: args.marks.length };
  },
});

export const getSubmissionStatus = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    await requireScoringStaffForRound(ctx, args.roundId);
    return await ctx.db
      .query("judgeSubmissions")
      .withIndex("by_round_judge", (q) => q.eq("roundId", args.roundId))
      .collect();
  },
});

// ── Result computation ──────────────────────────────────────────────

export async function recomputeCallbackResults(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
) {
  const round = await ctx.db.get(roundId);
  if (!round) notFound("Round not found");

  const marks = await ctx.db
    .query("callbackMarks")
    .withIndex("by_round_judge_entry", (q) => q.eq("roundId", roundId))
    .collect();

  const judgeIds = [...new Set(marks.map((m) => m.judgeId))].sort();
  const markMap: Record<string, boolean[]> = {};

  for (const mark of marks) {
    const key = mark.entryId as string;
    if (!markMap[key]) markMap[key] = [];
  }

  for (const entryKey of Object.keys(markMap)) {
    markMap[entryKey] = judgeIds.map((jId) => {
      const mark = marks.find(
        (m) => (m.entryId as string) === entryKey && m.judgeId === jId,
      );
      return mark?.marked ?? false;
    });
  }

  const tallies = tallyCallbacks(markMap);

  const callbacksRequested = round.callbacksRequested ?? tallies.length;
  const advancedSet = new Set<string>();
  let advancing = 0;
  for (const tally of tallies) {
    if (advancing < callbacksRequested) {
      advancedSet.add(tally.coupleId);
      advancing++;
    }
  }

  const existing = await ctx.db
    .query("callbackResults")
    .withIndex("by_round_entry", (q) => q.eq("roundId", roundId))
    .collect();
  for (const r of existing) await ctx.db.delete(r._id);

  for (const tally of tallies) {
    await ctx.db.insert("callbackResults", {
      roundId,
      entryId: tally.coupleId as Id<"entries">,
      totalMarks: tally.totalMarks,
      advanced: advancedSet.has(tally.coupleId),
    });
  }

  const meta = await ctx.db
    .query("roundResultsMeta")
    .withIndex("by_round", (q) => q.eq("roundId", roundId))
    .unique();
  if (meta) {
    await ctx.db.patch(meta._id, {
      status: "computed",
      computedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("roundResultsMeta", {
      roundId,
      status: "computed",
      computedAt: Date.now(),
    });
  }

  return { couples: tallies.length, advanced: advancedSet.size };
}

export async function recomputeFinalResults(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
) {
  const round = await ctx.db.get(roundId);
  if (!round) notFound("Round not found");
  const event = await ctx.db.get(round.eventId);
  if (!event) notFound("Event not found");

  const dances = await ctx.db
    .query("eventDances")
    .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
    .collect();
  dances.sort((a, b) => a.position - b.position);

  const marks = await ctx.db
    .query("finalMarks")
    .withIndex("by_round_judge_entry_dance", (q) => q.eq("roundId", roundId))
    .collect();

  if (marks.length === 0) {
    badRequest("No marks submitted for this round");
  }

  const entryIds = [...new Set(marks.map((m) => m.entryId as string))];
  const judgeIds = [...new Set(marks.map((m) => m.judgeId as string))].sort();
  const danceNames =
    dances.length > 0
      ? dances.map((d) => d.danceName)
      : [...new Set(marks.map((m) => m.danceName))];

  const allDanceMarks: Marks[] = [];
  const perDanceResults = [] as ReturnType<typeof singleDance>[];

  for (const danceName of danceNames) {
    const danceMarkMap: Marks = {};
    for (const entryId of entryIds) {
      danceMarkMap[entryId] = judgeIds.map((jId) => {
        const mark = marks.find(
          (m) =>
            (m.entryId as string) === entryId &&
            (m.judgeId as string) === jId &&
            m.danceName === danceName,
        );
        return mark?.placement ?? entryIds.length;
      });
    }
    allDanceMarks.push(danceMarkMap);
    perDanceResults.push(singleDance(danceMarkMap));
  }

  const existingResults = await ctx.db
    .query("finalResults")
    .withIndex("by_round_entry_dance", (q) => q.eq("roundId", roundId))
    .collect();
  for (const r of existingResults) await ctx.db.delete(r._id);

  const existingTabulation = await ctx.db
    .query("tabulationTables")
    .withIndex("by_round_entry_dance", (q) => q.eq("roundId", roundId))
    .collect();
  for (const t of existingTabulation) await ctx.db.delete(t._id);

  for (let d = 0; d < danceNames.length; d++) {
    const danceName = danceNames[d]!;
    const danceResult = perDanceResults[d]!;

    for (const [coupleId, row] of Object.entries(danceResult.tabulation)) {
      await ctx.db.insert("finalResults", {
        roundId,
        entryId: coupleId as Id<"entries">,
        danceName,
        placement: row.placement,
        placementValue: row.pointValue,
      });
      await ctx.db.insert("tabulationTables", {
        roundId,
        entryId: coupleId as Id<"entries">,
        danceName,
        tableData: row.cells,
      });
    }
  }

  if (danceNames.length > 1) {
    const multiResult = multiDance(perDanceResults, allDanceMarks);

    for (const [coupleId, placement] of Object.entries(
      multiResult.placements,
    )) {
      await ctx.db.insert("finalResults", {
        roundId,
        entryId: coupleId as Id<"entries">,
        placement,
        placementValue: placement,
        tiebreakRule: multiResult.tiebreakRules[coupleId] ?? undefined,
      });
    }

    for (const [coupleId, dancePlacements] of Object.entries(
      multiResult.perDancePlacements,
    )) {
      await ctx.db.insert("tabulationTables", {
        roundId,
        entryId: coupleId as Id<"entries">,
        tableData: {
          danceValues: dancePlacements.map((d) => d.pointValue),
          total: multiResult.totals[coupleId],
          placement: multiResult.placements[coupleId],
          tiebreakRule: multiResult.tiebreakRules[coupleId],
        },
      });
    }
  }

  const meta = await ctx.db
    .query("roundResultsMeta")
    .withIndex("by_round", (q) => q.eq("roundId", roundId))
    .unique();
  if (meta) {
    await ctx.db.patch(meta._id, {
      status: "computed",
      computedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("roundResultsMeta", {
      roundId,
      status: "computed",
      computedAt: Date.now(),
    });
  }

  return {
    dances: danceNames.length,
    couples: entryIds.length,
    isMultiDance: danceNames.length > 1,
  };
}

export const computeCallbackResults = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);
    return await recomputeCallbackResults(ctx, args.roundId);
  },
});

export const computeFinalResults = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);
    return await recomputeFinalResults(ctx, args.roundId);
  },
});

// ── Result queries ──────────────────────────────────────────────────

export const getResults = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const meta = await ctx.db
      .query("roundResultsMeta")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .unique();
    const results = await ctx.db
      .query("finalResults")
      .withIndex("by_round_placement", (q) => q.eq("roundId", args.roundId))
      .collect();
    results.sort((a, b) => a.placement - b.placement);
    const tabulation = await ctx.db
      .query("tabulationTables")
      .withIndex("by_round_entry_dance", (q) => q.eq("roundId", args.roundId))
      .collect();
    const callbacks = await ctx.db
      .query("callbackResults")
      .withIndex("by_round_entry", (q) => q.eq("roundId", args.roundId))
      .collect();
    return { meta, results, tabulation, callbacks };
  },
});

export const getCallbackResults = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("callbackResults")
      .withIndex("by_round_entry", (q) => q.eq("roundId", args.roundId))
      .collect();
  },
});

// ── Workflow ────────────────────────────────────────────────────────

export const reviewResults = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    const { user } = await requireCompOrgRole(ctx, event.competitionId);

    const meta = await ctx.db
      .query("roundResultsMeta")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .unique();
    if (!meta) forbidden("Results have not been computed");

    await ctx.db.patch(meta._id, {
      status: "reviewed",
      reviewedBy: user._id,
      reviewedAt: Date.now(),
    });
    return await ctx.db.get(meta._id);
  },
});

export const publishResults = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const meta = await ctx.db
      .query("roundResultsMeta")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .unique();
    if (!meta) forbidden("Results have not been computed");
    if (meta.status !== "reviewed" && meta.status !== "published") {
      forbidden("Results must be reviewed before publishing");
    }

    await ctx.db.patch(meta._id, {
      status: "published",
      publishedAt: Date.now(),
    });
    return await ctx.db.get(meta._id);
  },
});
