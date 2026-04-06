import { z } from "zod";
import { eq, and, asc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  eventDances,
  competitionJudges,
  rounds,
  heats,
  heatAssignments,
  entries,
  callbackMarks,
  finalMarks,
  judgeSubmissions,
  callbackResults,
  finalResults,
  tabulationTables,
  roundResultsMeta,
  activeRounds,
  markCorrections,
  judges,
} from "@competitions/schema";
import { requireCompOrgRole } from "@competitions/lib/auth";
import {
  singleDance,
  multiDance,
  tallyCallbacks,
} from "@competitions/lib/scoring";
import type { Marks } from "@competitions/lib/scoring";

export const scrutineerRouter = router({
  // ── Start round ─────────────────────────────────────────────────

  startRound: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        roundId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comp = await requireCompOrgRole(input.competitionId, ctx.userId);

      // End current active round if exists
      const currentActive = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, input.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });

      if (currentActive) {
        // Check all judges have submitted before advancing
        const pendingSubs = await db.query.judgeSubmissions.findMany({
          where: and(
            eq(judgeSubmissions.roundId, currentActive.roundId),
            eq(judgeSubmissions.status, "pending"),
          ),
        });
        if (pendingSubs.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${pendingSubs.length} judge(s) haven't submitted yet`,
          });
        }

        await db
          .update(activeRounds)
          .set({ endedAt: new Date() })
          .where(eq(activeRounds.id, currentActive.id));
      }

      // Determine which round to start
      let roundId = input.roundId;
      if (!roundId) {
        // Auto-determine: find next pending round in schedule order
        const nextRound = await findNextRound(input.competitionId);
        if (!nextRound) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No more rounds to start" });
        }
        roundId = nextRound.id;
      }

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      // Mark round as in_progress
      await db
        .update(rounds)
        .set({ status: "in_progress" })
        .where(eq(rounds.id, roundId));

      // Create active round row
      const [activeRound] = await db
        .insert(activeRounds)
        .values({
          competitionId: input.competitionId,
          roundId,
        })
        .returning();

      // Create judge submission rows for all competition judges
      const compJudges = await db.query.competitionJudges.findMany({
        where: eq(competitionJudges.competitionId, input.competitionId),
      });

      for (const cj of compJudges) {
        // Only create if not already exists
        const existing = await db.query.judgeSubmissions.findFirst({
          where: and(
            eq(judgeSubmissions.roundId, roundId),
            eq(judgeSubmissions.judgeId, cj.judgeId),
          ),
        });
        if (!existing) {
          await db.insert(judgeSubmissions).values({
            roundId,
            judgeId: cj.judgeId,
            status: "pending",
          });
        }
      }

      // Ably broadcast (best-effort)
      try {
        const { publishToJudging } = await import("@competitions/lib/ably-comp");
        const event = await db.query.competitionEvents.findFirst({
          where: eq(competitionEvents.id, round.eventId),
        });
        await publishToJudging(input.competitionId, "round:started", {
          roundId,
          eventName: event?.name,
          roundType: round.roundType,
          callbacksRequested: round.callbacksRequested,
        });
      } catch {
        // Ably not available
      }

      return { activeRoundId: activeRound!.id, roundId };
    }),

  // ── Stop round ──────────────────────────────────────────────────

  stopRound: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const currentActive = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, input.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });
      if (!currentActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active round" });
      }

      // End the active round
      await db
        .update(activeRounds)
        .set({ endedAt: new Date() })
        .where(eq(activeRounds.id, currentActive.id));

      // Mark round as completed
      await db
        .update(rounds)
        .set({ status: "completed" })
        .where(eq(rounds.id, currentActive.roundId));

      // Ably broadcast
      try {
        const { publishToJudging } = await import("@competitions/lib/ably-comp");
        await publishToJudging(input.competitionId, "round:locked", {
          roundId: currentActive.roundId,
        });
      } catch {
        // Ably not available
      }

      return { stoppedRoundId: currentActive.roundId };
    }),

  // ── Override marks ──────────────────────────────────────────────

  overrideMarks: protectedProcedure
    .input(
      z.object({
        roundId: z.number(),
        judgeId: z.number(),
        corrections: z.array(z.object({
          entryId: z.number(),
          danceName: z.string().optional(),
          newValue: z.string(),
        })),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      // Separate final and callback corrections
      const finalCorrections = input.corrections.filter(
        (c) => round.roundType === "final" && c.danceName,
      );
      const callbackCorrections = input.corrections.filter(
        (c) => !(round.roundType === "final" && c.danceName),
      );

      // Handle final mark corrections with delete-then-insert to avoid unique constraint violations
      if (finalCorrections.length > 0) {
        // Get all existing marks for affected dances to record corrections
        const affectedDances = [...new Set(finalCorrections.map((c) => c.danceName!))];
        for (const danceName of affectedDances) {
          const existingMarks = await db.query.finalMarks.findMany({
            where: and(
              eq(finalMarks.roundId, input.roundId),
              eq(finalMarks.judgeId, input.judgeId),
              eq(finalMarks.danceName, danceName),
            ),
          });

          // Record corrections for changed values
          for (const correction of finalCorrections.filter((c) => c.danceName === danceName)) {
            const existing = existingMarks.find((m) => m.entryId === correction.entryId);
            await db.insert(markCorrections).values({
              roundId: input.roundId,
              judgeId: input.judgeId,
              entryId: correction.entryId,
              danceName,
              oldValue: existing ? String(existing.placement) : "none",
              newValue: correction.newValue,
              source: "scrutineer",
              correctedBy: ctx.userId,
              reason: input.reason,
            });
          }

          // Delete all marks for this judge/round/dance, then re-insert with corrections applied
          const correctionMap = new Map(
            finalCorrections
              .filter((c) => c.danceName === danceName)
              .map((c) => [c.entryId, parseInt(c.newValue)]),
          );

          await db
            .delete(finalMarks)
            .where(
              and(
                eq(finalMarks.roundId, input.roundId),
                eq(finalMarks.judgeId, input.judgeId),
                eq(finalMarks.danceName, danceName),
              ),
            );

          for (const mark of existingMarks) {
            await db.insert(finalMarks).values({
              roundId: input.roundId,
              judgeId: input.judgeId,
              entryId: mark.entryId,
              danceName,
              placement: correctionMap.get(mark.entryId) ?? mark.placement,
            });
          }
        }
      }

      // Handle callback corrections (simple update, no unique constraint issues)
      for (const correction of callbackCorrections) {
        {
          // Override callback mark
          const existing = await db.query.callbackMarks.findFirst({
            where: and(
              eq(callbackMarks.roundId, input.roundId),
              eq(callbackMarks.judgeId, input.judgeId),
              eq(callbackMarks.entryId, correction.entryId),
            ),
          });

          const oldValue = existing ? String(existing.marked) : "none";

          await db.insert(markCorrections).values({
            roundId: input.roundId,
            judgeId: input.judgeId,
            entryId: correction.entryId,
            oldValue,
            newValue: correction.newValue,
            source: "scrutineer",
            correctedBy: ctx.userId,
            reason: input.reason,
          });

          if (existing) {
            await db
              .update(callbackMarks)
              .set({ marked: correction.newValue === "true" })
              .where(eq(callbackMarks.id, existing.id));
          }
        }
      }

      // Reset results meta back to computed if it was reviewed
      const meta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, input.roundId),
      });
      if (meta && meta.status === "reviewed") {
        await db
          .update(roundResultsMeta)
          .set({ status: "computed", computedAt: new Date() })
          .where(eq(roundResultsMeta.id, meta.id));
      }

      return { corrected: input.corrections.length };
    }),

  // ── Unlock judge submission ─────────────────────────────────────

  unlockJudgeSubmission: protectedProcedure
    .input(z.object({ roundId: z.number(), judgeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      const comp = await requireCompOrgRole(event!.competitionId, ctx.userId);

      await db
        .update(judgeSubmissions)
        .set({ status: "pending" })
        .where(
          and(
            eq(judgeSubmissions.roundId, input.roundId),
            eq(judgeSubmissions.judgeId, input.judgeId),
          ),
        );

      // Ably broadcast
      try {
        const { publishToJudging } = await import("@competitions/lib/ably-comp");
        await publishToJudging(comp.id, "round:unlocked", {
          roundId: input.roundId,
          judgeId: input.judgeId,
        });
      } catch {
        // Ably not available
      }

      return { unlocked: true };
    }),

  // ── Review results ──────────────────────────────────────────────

  reviewResults: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      const meta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, input.roundId),
      });
      if (!meta || meta.status !== "computed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Results must be computed before review" });
      }

      const [updated] = await db
        .update(roundResultsMeta)
        .set({
          status: "reviewed",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(roundResultsMeta.roundId, input.roundId))
        .returning();

      return updated;
    }),

  // ── Publish results ─────────────────────────────────────────────

  publishResults: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      const comp = await requireCompOrgRole(event!.competitionId, ctx.userId);

      const meta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, input.roundId),
      });
      if (!meta || meta.status !== "reviewed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Results must be reviewed before publishing" });
      }

      const [updated] = await db
        .update(roundResultsMeta)
        .set({
          status: "published",
          publishedAt: new Date(),
        })
        .where(eq(roundResultsMeta.roundId, input.roundId))
        .returning();

      // Ably broadcast
      try {
        const { publishToResults } = await import("@competitions/lib/ably-comp");
        await publishToResults(comp.id, "results:published", {
          roundId: input.roundId,
          eventName: event?.name,
        });
      } catch {
        // Ably not available
      }

      return updated;
    }),

  // ── Recompute results ───────────────────────────────────────────

  recomputeResults: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      await requireCompOrgRole(event.competitionId, ctx.userId);

      if (round.roundType === "final") {
        return recomputeFinalResults(input.roundId, event);
      } else {
        return recomputeCallbackResults(input.roundId, round);
      }
    }),

  // ── Get submission status ───────────────────────────────────────

  getSubmissionStatus: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, input.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });

      if (!active) return { activeRound: null, submissions: [] };

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, active.roundId),
      });
      const event = round
        ? await db.query.competitionEvents.findFirst({
            where: eq(competitionEvents.id, round.eventId),
          })
        : null;

      const submissions = await db.query.judgeSubmissions.findMany({
        where: eq(judgeSubmissions.roundId, active.roundId),
      });

      // Get judge names
      const judgeIds = submissions.map((s) => s.judgeId);
      const judgeList = await Promise.all(
        judgeIds.map(async (jId) => {
          const judge = await db.query.judges.findFirst({
            where: eq(judges.id, jId),
          });
          return { id: jId, name: judge ? `${judge.firstName} ${judge.lastName}` : "Unknown" };
        }),
      );

      return {
        activeRound: {
          roundId: active.roundId,
          eventName: event?.name ?? "Unknown Event",
          roundType: round?.roundType,
          startedAt: active.startedAt,
        },
        submissions: submissions.map((s) => ({
          judgeId: s.judgeId,
          judgeName: judgeList.find((j) => j.id === s.judgeId)?.name ?? "Unknown",
          status: s.status,
          submittedAt: s.submittedAt,
        })),
      };
    }),

  // ── View judge marks ────────────────────────────────────────────

  viewJudgeMarks: protectedProcedure
    .input(z.object({ roundId: z.number(), judgeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      if (round.roundType === "final") {
        const marks = await db.query.finalMarks.findMany({
          where: and(
            eq(finalMarks.roundId, input.roundId),
            eq(finalMarks.judgeId, input.judgeId),
          ),
        });
        return {
          type: "final" as const,
          marks: marks.map((m) => ({
            entryId: m.entryId,
            danceName: m.danceName,
            placement: m.placement,
          })),
        };
      } else {
        const marks = await db.query.callbackMarks.findMany({
          where: and(
            eq(callbackMarks.roundId, input.roundId),
            eq(callbackMarks.judgeId, input.judgeId),
          ),
        });
        return {
          type: "callback" as const,
          marks: marks.map((m) => ({
            entryId: m.entryId,
            marked: m.marked,
          })),
        };
      }
    }),

  // ── Get results ─────────────────────────────────────────────────

  getResults: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .query(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      const meta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, input.roundId),
      });

      const results = await db.query.finalResults.findMany({
        where: eq(finalResults.roundId, input.roundId),
        orderBy: asc(finalResults.placement),
      });

      const tabulation = await db.query.tabulationTables.findMany({
        where: eq(tabulationTables.roundId, input.roundId),
      });

      const callbacks = await db.query.callbackResults.findMany({
        where: eq(callbackResults.roundId, input.roundId),
      });

      return { meta, results, tabulation, callbacks };
    }),

  // ── Get next round ──────────────────────────────────────────────

  getNextRound: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);
      return findNextRound(input.competitionId);
    }),

  // ── Get correction history ──────────────────────────────────────

  getCorrectionHistory: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .query(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      const corrections = await db.query.markCorrections.findMany({
        where: eq(markCorrections.roundId, input.roundId),
        orderBy: asc(markCorrections.createdAt),
      });

      // Enrich with judge names
      const enriched = await Promise.all(
        corrections.map(async (c) => {
          const judge = await db.query.judges.findFirst({
            where: eq(judges.id, c.judgeId),
          });
          return {
            ...c,
            judgeName: judge ? `${judge.firstName} ${judge.lastName}` : "Unknown",
          };
        }),
      );

      return enriched;
    }),
});

// ── Helper: find next pending round ─────────────────────────────────

async function findNextRound(competitionId: number) {
  // Get all events for this competition
  const events = await db.query.competitionEvents.findMany({
    where: eq(competitionEvents.competitionId, competitionId),
    orderBy: asc(competitionEvents.position),
  });

  for (const event of events) {
    const eventRounds = await db.query.rounds.findMany({
      where: eq(rounds.eventId, event.id),
      orderBy: asc(rounds.position),
    });

    for (const round of eventRounds) {
      if (round.status === "pending") {
        return {
          id: round.id,
          eventId: event.id,
          eventName: event.name,
          roundType: round.roundType,
          position: round.position,
        };
      }
    }
  }

  return null;
}

// ── Helper: recompute final results ─────────────────────────────────

async function recomputeFinalResults(
  roundId: number,
  event: typeof competitionEvents.$inferSelect,
) {
  const dances = await db.query.eventDances.findMany({
    where: eq(eventDances.eventId, event.id),
    orderBy: asc(eventDances.position),
  });

  const marks = await db.query.finalMarks.findMany({
    where: eq(finalMarks.roundId, roundId),
  });

  if (marks.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No marks found" });
  }

  const entryIds = [...new Set(marks.map((m) => m.entryId))];
  const judgeIds = [...new Set(marks.map((m) => m.judgeId))].sort();
  const danceNames = dances.length > 0
    ? dances.map((d) => d.danceName)
    : [...new Set(marks.map((m) => m.danceName))];

  const allDanceMarks: Marks[] = [];
  const perDanceResults = [];

  for (const danceName of danceNames) {
    const danceMarkMap: Marks = {};
    for (const entryId of entryIds) {
      danceMarkMap[String(entryId)] = judgeIds.map((jId) => {
        const mark = marks.find(
          (m) => m.entryId === entryId && m.judgeId === jId && m.danceName === danceName,
        );
        return mark?.placement ?? entryIds.length;
      });
    }
    allDanceMarks.push(danceMarkMap);
    perDanceResults.push(singleDance(danceMarkMap));
  }

  // Delete existing results
  await db.delete(finalResults).where(eq(finalResults.roundId, roundId));
  await db.delete(tabulationTables).where(eq(tabulationTables.roundId, roundId));

  // Store per-dance results
  for (let d = 0; d < danceNames.length; d++) {
    const danceName = danceNames[d]!;
    const danceResult = perDanceResults[d]!;

    for (const [coupleId, row] of Object.entries(danceResult.tabulation)) {
      await db.insert(finalResults).values({
        roundId,
        entryId: parseInt(coupleId),
        danceName,
        placement: row.placement,
        placementValue: String(row.pointValue),
      });
      await db.insert(tabulationTables).values({
        roundId,
        entryId: parseInt(coupleId),
        danceName,
        tableData: row.cells,
      });
    }
  }

  // Multi-dance overall
  if (danceNames.length > 1) {
    const multiResult = multiDance(perDanceResults, allDanceMarks);
    for (const [coupleId, placement] of Object.entries(multiResult.placements)) {
      await db.insert(finalResults).values({
        roundId,
        entryId: parseInt(coupleId),
        danceName: null,
        placement,
        placementValue: String(placement),
        tiebreakRule: multiResult.tiebreakRules[coupleId] ?? null,
      });
    }
    for (const [coupleId, dancePlacements] of Object.entries(multiResult.perDancePlacements)) {
      await db.insert(tabulationTables).values({
        roundId,
        entryId: parseInt(coupleId),
        danceName: null,
        tableData: {
          danceValues: dancePlacements.map((d) => d.pointValue),
          total: multiResult.totals[coupleId],
          placement: multiResult.placements[coupleId],
          tiebreakRule: multiResult.tiebreakRules[coupleId],
        },
      });
    }
  }

  // Update meta
  const existingMeta = await db.query.roundResultsMeta.findFirst({
    where: eq(roundResultsMeta.roundId, roundId),
  });
  if (existingMeta) {
    await db
      .update(roundResultsMeta)
      .set({ status: "computed", computedAt: new Date() })
      .where(eq(roundResultsMeta.id, existingMeta.id));
  } else {
    await db.insert(roundResultsMeta).values({
      roundId,
      status: "computed",
      computedAt: new Date(),
    });
  }

  return { dances: danceNames.length, couples: entryIds.length };
}

// ── Helper: recompute callback results ──────────────────────────────

async function recomputeCallbackResults(
  roundId: number,
  round: typeof rounds.$inferSelect,
) {
  const marks = await db.query.callbackMarks.findMany({
    where: eq(callbackMarks.roundId, roundId),
  });

  const markMap: Record<string, boolean[]> = {};
  const judgeIds = [...new Set(marks.map((m) => m.judgeId))].sort();

  for (const mark of marks) {
    const key = String(mark.entryId);
    if (!markMap[key]) markMap[key] = [];
  }

  for (const entryKey of Object.keys(markMap)) {
    const entryId = parseInt(entryKey);
    markMap[entryKey] = judgeIds.map((jId) => {
      const mark = marks.find((m) => m.entryId === entryId && m.judgeId === jId);
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

  await db.delete(callbackResults).where(eq(callbackResults.roundId, roundId));

  for (const tally of tallies) {
    await db.insert(callbackResults).values({
      roundId,
      entryId: parseInt(tally.coupleId),
      totalMarks: tally.totalMarks,
      advanced: advancedSet.has(tally.coupleId),
    });
  }

  const existingMeta = await db.query.roundResultsMeta.findFirst({
    where: eq(roundResultsMeta.roundId, roundId),
  });
  if (existingMeta) {
    await db
      .update(roundResultsMeta)
      .set({ status: "computed", computedAt: new Date() })
      .where(eq(roundResultsMeta.id, existingMeta.id));
  } else {
    await db.insert(roundResultsMeta).values({
      roundId,
      status: "computed",
      computedAt: new Date(),
    });
  }

  return { couples: tallies.length, advanced: advancedSet.size };
}
