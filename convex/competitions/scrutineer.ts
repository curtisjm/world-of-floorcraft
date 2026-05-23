import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { badRequest, notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import {
  recomputeCallbackResults,
  recomputeFinalResults,
} from "./scoring";

/**
 * Scrutineer console — round start/stop, mark override, review/publish, and
 * the round-status dashboard. Combines `scrutineer.ts` and
 * `scrutineer-dashboard.ts`. Ably broadcasts from the original implementation
 * are dropped; Convex queries handle reactive UI updates.
 */

async function findNextRoundForCompetition(
  ctx: QueryCtx,
  competitionId: Id<"competitions">,
) {
  const events = await ctx.db
    .query("competitionEvents")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  for (const event of events) {
    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
      .collect();
    eventRounds.sort((a, b) => a.position - b.position);
    for (const round of eventRounds) {
      if (round.status === "pending") {
        return {
          id: round._id,
          eventId: event._id,
          eventName: event.name,
          roundType: round.roundType,
          position: round.position,
        };
      }
    }
  }
  return null;
}

async function getActiveRoundFor(
  ctx: QueryCtx,
  competitionId: Id<"competitions">,
) {
  const all = await ctx.db
    .query("activeRounds")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  return all.find((a) => a.endedAt === undefined) ?? null;
}

// ── Start / Stop round ──────────────────────────────────────────────

export const startRound = mutation({
  args: {
    competitionId: v.id("competitions"),
    roundId: v.optional(v.id("rounds")),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const currentActive = await getActiveRoundFor(ctx, args.competitionId);
    if (currentActive) {
      const pendingSubs = await ctx.db
        .query("judgeSubmissions")
        .withIndex("by_round_judge", (q) =>
          q.eq("roundId", currentActive.roundId),
        )
        .collect();
      const pendingCount = pendingSubs.filter((s) => s.status === "pending")
        .length;
      if (pendingCount > 0) {
        badRequest(`${pendingCount} judge(s) haven't submitted yet`);
      }
      await ctx.db.patch(currentActive._id, { endedAt: Date.now() });
    }

    let roundId = args.roundId;
    if (!roundId) {
      const next = await findNextRoundForCompetition(ctx, args.competitionId);
      if (!next) badRequest("No more rounds to start");
      roundId = next.id;
    }

    const round = await ctx.db.get(roundId);
    if (!round) notFound("Round not found");

    await ctx.db.patch(roundId, { status: "in_progress" });

    const activeRoundId = await ctx.db.insert("activeRounds", {
      competitionId: args.competitionId,
      roundId,
      startedAt: Date.now(),
    });

    const compJudges = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const cj of compJudges) {
      const existing = await ctx.db
        .query("judgeSubmissions")
        .withIndex("by_round_judge", (q) =>
          q.eq("roundId", roundId).eq("judgeId", cj.judgeId),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("judgeSubmissions", {
          roundId,
          judgeId: cj.judgeId,
          status: "pending",
        });
      }
    }

    return { activeRoundId, roundId };
  },
});

export const stopRound = mutation({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const currentActive = await getActiveRoundFor(ctx, args.competitionId);
    if (!currentActive) badRequest("No active round");

    await ctx.db.patch(currentActive._id, { endedAt: Date.now() });
    await ctx.db.patch(currentActive.roundId, { status: "completed" });

    return { stoppedRoundId: currentActive.roundId };
  },
});

// ── Override marks ──────────────────────────────────────────────────

export const overrideMarks = mutation({
  args: {
    roundId: v.id("rounds"),
    judgeId: v.id("judges"),
    corrections: v.array(
      v.object({
        entryId: v.id("entries"),
        danceName: v.optional(v.string()),
        newValue: v.string(),
      }),
    ),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    const { user } = await requireCompOrgRole(ctx, event.competitionId);

    const finalCorrections = args.corrections.filter(
      (c) => round.roundType === "final" && c.danceName !== undefined,
    );
    const callbackCorrections = args.corrections.filter(
      (c) => !(round.roundType === "final" && c.danceName !== undefined),
    );

    if (finalCorrections.length > 0) {
      const affectedDances = [
        ...new Set(finalCorrections.map((c) => c.danceName!)),
      ];
      for (const danceName of affectedDances) {
        const existingMarks = await ctx.db
          .query("finalMarks")
          .withIndex("by_round_judge_dance_placement", (q) =>
            q
              .eq("roundId", args.roundId)
              .eq("judgeId", args.judgeId)
              .eq("danceName", danceName),
          )
          .collect();

        for (const correction of finalCorrections.filter(
          (c) => c.danceName === danceName,
        )) {
          const existing = existingMarks.find(
            (m) => m.entryId === correction.entryId,
          );
          await ctx.db.insert("markCorrections", {
            roundId: args.roundId,
            judgeId: args.judgeId,
            entryId: correction.entryId,
            danceName,
            oldValue: existing ? String(existing.placement) : "none",
            newValue: correction.newValue,
            source: "scrutineer",
            correctedBy: user._id,
            reason: args.reason,
            createdAt: Date.now(),
          });
        }

        const correctionMap = new Map(
          finalCorrections
            .filter((c) => c.danceName === danceName)
            .map((c) => [c.entryId, parseInt(c.newValue)] as const),
        );

        for (const m of existingMarks) {
          await ctx.db.delete(m._id);
        }
        for (const mark of existingMarks) {
          await ctx.db.insert("finalMarks", {
            roundId: args.roundId,
            judgeId: args.judgeId,
            entryId: mark.entryId,
            danceName,
            placement: correctionMap.get(mark.entryId) ?? mark.placement,
          });
        }
      }
    }

    for (const correction of callbackCorrections) {
      const existing = await ctx.db
        .query("callbackMarks")
        .withIndex("by_round_judge_entry", (q) =>
          q
            .eq("roundId", args.roundId)
            .eq("judgeId", args.judgeId)
            .eq("entryId", correction.entryId),
        )
        .unique();

      const oldValue = existing ? String(existing.marked) : "none";
      await ctx.db.insert("markCorrections", {
        roundId: args.roundId,
        judgeId: args.judgeId,
        entryId: correction.entryId,
        oldValue,
        newValue: correction.newValue,
        source: "scrutineer",
        correctedBy: user._id,
        reason: args.reason,
        createdAt: Date.now(),
      });
      if (existing) {
        await ctx.db.patch(existing._id, {
          marked: correction.newValue === "true",
        });
      }
    }

    const meta = await ctx.db
      .query("roundResultsMeta")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .unique();
    if (meta && meta.status === "reviewed") {
      await ctx.db.patch(meta._id, {
        status: "computed",
        computedAt: Date.now(),
      });
    }

    return { corrected: args.corrections.length };
  },
});

// ── Unlock judge submission ─────────────────────────────────────────

export const unlockJudgeSubmission = mutation({
  args: { roundId: v.id("rounds"), judgeId: v.id("judges") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const existing = await ctx.db
      .query("judgeSubmissions")
      .withIndex("by_round_judge", (q) =>
        q.eq("roundId", args.roundId).eq("judgeId", args.judgeId),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "pending",
        submittedAt: undefined,
      });
    }
    return { unlocked: true };
  },
});

// ── Review / publish results ────────────────────────────────────────

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
    if (!meta || meta.status !== "computed") {
      badRequest("Results must be computed before review");
    }
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
    if (!meta || meta.status !== "reviewed") {
      badRequest("Results must be reviewed before publishing");
    }
    await ctx.db.patch(meta._id, {
      status: "published",
      publishedAt: Date.now(),
    });
    return await ctx.db.get(meta._id);
  },
});

// ── Recompute ───────────────────────────────────────────────────────

export const recomputeResults = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    if (round.roundType === "final") {
      return await recomputeFinalResults(ctx, args.roundId);
    } else {
      return await recomputeCallbackResults(ctx, args.roundId);
    }
  },
});

// ── Queries ─────────────────────────────────────────────────────────

export const getSubmissionStatus = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const active = await getActiveRoundFor(ctx, args.competitionId);
    if (!active) return { activeRound: null, submissions: [] };

    const round = await ctx.db.get(active.roundId);
    const event = round ? await ctx.db.get(round.eventId) : null;
    const submissions = await ctx.db
      .query("judgeSubmissions")
      .withIndex("by_round_judge", (q) => q.eq("roundId", active.roundId))
      .collect();

    const submissionDetail = await Promise.all(
      submissions.map(async (s) => {
        const judge = await ctx.db.get(s.judgeId);
        return {
          judgeId: s.judgeId,
          judgeName: judge
            ? `${judge.firstName} ${judge.lastName}`
            : "Unknown",
          status: s.status,
          submittedAt: s.submittedAt ?? null,
        };
      }),
    );

    return {
      activeRound: {
        roundId: active.roundId,
        eventName: event?.name ?? "Unknown Event",
        roundType: round?.roundType,
        startedAt: active.startedAt,
      },
      submissions: submissionDetail,
    };
  },
});

export const viewJudgeMarks = query({
  args: { roundId: v.id("rounds"), judgeId: v.id("judges") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    if (round.roundType === "final") {
      const marks = await ctx.db
        .query("finalMarks")
        .withIndex("by_round_judge_dance_placement", (q) =>
          q.eq("roundId", args.roundId).eq("judgeId", args.judgeId),
        )
        .collect();
      return {
        type: "final" as const,
        marks: marks.map((m) => ({
          entryId: m.entryId,
          danceName: m.danceName,
          placement: m.placement,
        })),
      };
    } else {
      const marks = await ctx.db
        .query("callbackMarks")
        .withIndex("by_round_judge_entry", (q) =>
          q.eq("roundId", args.roundId).eq("judgeId", args.judgeId),
        )
        .collect();
      return {
        type: "callback" as const,
        marks: marks.map((m) => ({
          entryId: m.entryId,
          marked: m.marked,
        })),
      };
    }
  },
});

export const getResults = query({
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

export const getNextRound = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    return await findNextRoundForCompetition(ctx, args.competitionId);
  },
});

export const getCorrectionHistory = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const corrections = await ctx.db
      .query("markCorrections")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();
    corrections.sort((a, b) => a.createdAt - b.createdAt);

    return await Promise.all(
      corrections.map(async (c) => {
        const judge = await ctx.db.get(c.judgeId);
        return {
          ...c,
          judgeName: judge
            ? `${judge.firstName} ${judge.lastName}`
            : "Unknown",
        };
      }),
    );
  },
});

// ── Dashboard (scrutineer-dashboard.ts) ─────────────────────────────

export const getDashboard = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const { competition } = await requireCompOrgRole(ctx, args.competitionId);

    const active = await getActiveRoundFor(ctx, args.competitionId);
    let activeRoundInfo: {
      roundId: Id<"rounds">;
      eventName: string;
      roundType?: Doc<"rounds">["roundType"];
      startedAt: number;
    } | null = null;
    let submissions: Array<{
      judgeId: Id<"judges">;
      status: Doc<"judgeSubmissions">["status"];
      submittedAt: number | null;
    }> = [];
    if (active) {
      const round = await ctx.db.get(active.roundId);
      const event = round ? await ctx.db.get(round.eventId) : null;
      activeRoundInfo = {
        roundId: active.roundId,
        eventName: event?.name ?? "Unknown",
        roundType: round?.roundType,
        startedAt: active.startedAt,
      };
      submissions = (
        await ctx.db
          .query("judgeSubmissions")
          .withIndex("by_round_judge", (q) => q.eq("roundId", active.roundId))
          .collect()
      ).map((s) => ({
        judgeId: s.judgeId,
        status: s.status,
        submittedAt: s.submittedAt ?? null,
      }));
    }

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const activeRegs = regs.filter((r) => !r.cancelled);
    const regCounts = {
      total: activeRegs.length,
      checkedIn: activeRegs.filter((r) => r.checkedIn).length,
    };

    const addDrops = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", args.competitionId).eq("status", "pending"),
      )
      .collect();
    const pendingAddDrops = addDrops.length;

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const eventSummaries = await Promise.all(
      events.map(async (event) => {
        const eventRounds = await ctx.db
          .query("rounds")
          .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
          .collect();
        eventRounds.sort((a, b) => a.position - b.position);
        const eventEntries = await ctx.db
          .query("entries")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        return {
          id: event._id,
          name: event.name,
          sessionId: event.sessionId,
          position: event.position,
          entryCount: eventEntries.filter((e) => !e.scratched).length,
          rounds: eventRounds.map((r) => ({
            id: r._id,
            roundType: r.roundType,
            status: r.status,
          })),
        };
      }),
    );

    return {
      competition,
      activeRound: activeRoundInfo,
      submissions,
      registrations: regCounts,
      pendingAddDrops,
      events: eventSummaries,
    };
  },
});

export const getEventProgress = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    eventRounds.sort((a, b) => a.position - b.position);
    const eventEntries = await ctx.db
      .query("entries")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const activeEntries = eventEntries.filter((e) => !e.scratched).length;

    const roundDetails = await Promise.all(
      eventRounds.map(async (round) => {
        const meta = await ctx.db
          .query("roundResultsMeta")
          .withIndex("by_round", (q) => q.eq("roundId", round._id))
          .unique();
        return {
          id: round._id,
          roundType: round.roundType,
          status: round.status,
          position: round.position,
          callbacksRequested: round.callbacksRequested,
          entryCount: activeEntries,
          resultStatus: meta?.status ?? null,
        };
      }),
    );

    return {
      event: { id: event._id, name: event.name },
      rounds: roundDetails,
    };
  },
});

export const markEventComplete = mutation({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompOrgRole(ctx, event.competitionId);

    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    if (eventRounds.length === 0) {
      badRequest("Event has no rounds");
    }
    for (const round of eventRounds) {
      const meta = await ctx.db
        .query("roundResultsMeta")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .unique();
      if (!meta || meta.status !== "published") {
        badRequest(`Round ${round.roundType} results not published yet`);
      }
    }
    for (const round of eventRounds) {
      await ctx.db.patch(round._id, { status: "completed" });
    }
    return { completed: true };
  },
});

export const updateScheduleLive = mutation({
  args: {
    competitionId: v.id("competitions"),
    updates: v.array(
      v.object({
        blockId: v.id("scheduleBlocks"),
        estimatedStartTime: v.optional(v.number()),
        estimatedEndTime: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    for (const update of args.updates) {
      const patch: Partial<Doc<"scheduleBlocks">> = {};
      if (update.estimatedStartTime !== undefined)
        patch.estimatedStartTime = update.estimatedStartTime;
      if (update.estimatedEndTime !== undefined)
        patch.estimatedEndTime = update.estimatedEndTime;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(update.blockId, patch);
      }
    }
    return { updated: args.updates.length };
  },
});

