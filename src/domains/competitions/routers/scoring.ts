import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitionEvents,
  eventDances,
  rounds,
  entries,
  callbackMarks,
  finalMarks,
  judgeSubmissions,
  callbackResults,
  finalResults,
  tabulationTables,
  roundResultsMeta,
  competitionJudges,
} from "@competitions/schema";
import { requireCompOrgRole, requireCompStaffRole } from "@competitions/lib/auth";
import {
  singleDance,
  multiDance,
  tallyCallbacks,
} from "@competitions/lib/scoring";
import type { Marks } from "@competitions/lib/scoring";

export const scoringRouter = router({
  // ── Mark submission ────────────────────────────────────────────

  submitCallbackMarks: protectedProcedure
    .input(
      z.object({
        roundId: z.number(),
        judgeId: z.number(),
        marks: z.array(z.object({
          entryId: z.number(),
          marked: z.boolean(),
        })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      // Insert/update marks
      for (const mark of input.marks) {
        const existing = await db.query.callbackMarks.findFirst({
          where: and(
            eq(callbackMarks.roundId, input.roundId),
            eq(callbackMarks.judgeId, input.judgeId),
            eq(callbackMarks.entryId, mark.entryId),
          ),
        });

        if (existing) {
          await db
            .update(callbackMarks)
            .set({ marked: mark.marked })
            .where(eq(callbackMarks.id, existing.id));
        } else {
          await db.insert(callbackMarks).values({
            roundId: input.roundId,
            judgeId: input.judgeId,
            entryId: mark.entryId,
            marked: mark.marked,
          });
        }
      }

      // Update judge submission status
      const existingSub = await db.query.judgeSubmissions.findFirst({
        where: and(
          eq(judgeSubmissions.roundId, input.roundId),
          eq(judgeSubmissions.judgeId, input.judgeId),
        ),
      });

      if (existingSub) {
        await db
          .update(judgeSubmissions)
          .set({ status: "submitted", submittedAt: new Date() })
          .where(eq(judgeSubmissions.id, existingSub.id));
      } else {
        await db.insert(judgeSubmissions).values({
          roundId: input.roundId,
          judgeId: input.judgeId,
          status: "submitted",
          submittedAt: new Date(),
        });
      }

      return { submitted: input.marks.length };
    }),

  submitFinalMarks: protectedProcedure
    .input(
      z.object({
        roundId: z.number(),
        judgeId: z.number(),
        marks: z.array(z.object({
          entryId: z.number(),
          danceName: z.string(),
          placement: z.number().min(1),
        })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      // Delete existing marks for this judge/round, then insert fresh.
      // This avoids unique constraint violations when placements are swapped.
      const danceNames = [...new Set(input.marks.map((m) => m.danceName))];
      for (const danceName of danceNames) {
        await db
          .delete(finalMarks)
          .where(
            and(
              eq(finalMarks.roundId, input.roundId),
              eq(finalMarks.judgeId, input.judgeId),
              eq(finalMarks.danceName, danceName),
            ),
          );
      }

      for (const mark of input.marks) {
        await db.insert(finalMarks).values({
          roundId: input.roundId,
          judgeId: input.judgeId,
          entryId: mark.entryId,
          danceName: mark.danceName,
          placement: mark.placement,
        });
      }

      // Update judge submission status
      const existingSub = await db.query.judgeSubmissions.findFirst({
        where: and(
          eq(judgeSubmissions.roundId, input.roundId),
          eq(judgeSubmissions.judgeId, input.judgeId),
        ),
      });

      if (existingSub) {
        await db
          .update(judgeSubmissions)
          .set({ status: "submitted", submittedAt: new Date() })
          .where(eq(judgeSubmissions.id, existingSub.id));
      } else {
        await db.insert(judgeSubmissions).values({
          roundId: input.roundId,
          judgeId: input.judgeId,
          status: "submitted",
          submittedAt: new Date(),
        });
      }

      return { submitted: input.marks.length };
    }),

  // ── Submission status ──────────────────────────────────────────

  getSubmissionStatus: protectedProcedure
    .input(z.object({ roundId: z.number() }))
    .query(async ({ input }) => {
      const submissions = await db.query.judgeSubmissions.findMany({
        where: eq(judgeSubmissions.roundId, input.roundId),
      });
      return submissions;
    }),

  // ── Compute results ────────────────────────────────────────────

  computeCallbackResults: protectedProcedure
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

      // Get all callback marks for this round
      const marks = await db.query.callbackMarks.findMany({
        where: eq(callbackMarks.roundId, input.roundId),
      });

      // Build marks map: entryId -> boolean[]
      const markMap: Record<string, boolean[]> = {};
      const judgeIds = [...new Set(marks.map((m) => m.judgeId))].sort();

      for (const mark of marks) {
        const key = String(mark.entryId);
        if (!markMap[key]) {
          markMap[key] = [];
        }
      }

      // Fill marks in judge order
      for (const entryKey of Object.keys(markMap)) {
        const entryId = parseInt(entryKey);
        markMap[entryKey] = judgeIds.map((jId) => {
          const mark = marks.find(
            (m) => m.entryId === entryId && m.judgeId === jId,
          );
          return mark?.marked ?? false;
        });
      }

      const tallies = tallyCallbacks(markMap);

      // Determine who advances
      const callbacksRequested = round.callbacksRequested ?? tallies.length;
      const advancedSet = new Set<string>();

      // Sort by total marks descending
      let advancing = 0;
      for (const tally of tallies) {
        if (advancing < callbacksRequested) {
          advancedSet.add(tally.coupleId);
          advancing++;
        }
      }

      // Delete existing results
      await db
        .delete(callbackResults)
        .where(eq(callbackResults.roundId, input.roundId));

      // Insert new results
      for (const tally of tallies) {
        await db.insert(callbackResults).values({
          roundId: input.roundId,
          entryId: parseInt(tally.coupleId),
          totalMarks: tally.totalMarks,
          advanced: advancedSet.has(tally.coupleId),
        });
      }

      // Create/update results meta
      const existingMeta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, input.roundId),
      });

      if (existingMeta) {
        await db
          .update(roundResultsMeta)
          .set({ status: "computed", computedAt: new Date() })
          .where(eq(roundResultsMeta.id, existingMeta.id));
      } else {
        await db.insert(roundResultsMeta).values({
          roundId: input.roundId,
          status: "computed",
          computedAt: new Date(),
        });
      }

      return { couples: tallies.length, advanced: advancedSet.size };
    }),

  computeFinalResults: protectedProcedure
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

      // Get dances for this event
      const dances = await db.query.eventDances.findMany({
        where: eq(eventDances.eventId, event.id),
        orderBy: asc(eventDances.position),
      });

      // Get all final marks for this round
      const marks = await db.query.finalMarks.findMany({
        where: eq(finalMarks.roundId, input.roundId),
      });

      if (marks.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No marks submitted for this round" });
      }

      // Get unique entries and judges
      const entryIds = [...new Set(marks.map((m) => m.entryId))];
      const judgeIds = [...new Set(marks.map((m) => m.judgeId))].sort();
      const danceNames = dances.length > 0
        ? dances.map((d) => d.danceName)
        : [...new Set(marks.map((m) => m.danceName))];

      // Build marks per dance: danceName -> { entryId -> placement[] }
      const allDanceMarks: Marks[] = [];
      const perDanceResults = [];

      for (const danceName of danceNames) {
        const danceMarkMap: Marks = {};
        for (const entryId of entryIds) {
          danceMarkMap[String(entryId)] = judgeIds.map((jId) => {
            const mark = marks.find(
              (m) =>
                m.entryId === entryId &&
                m.judgeId === jId &&
                m.danceName === danceName,
            );
            return mark?.placement ?? entryIds.length;
          });
        }
        allDanceMarks.push(danceMarkMap);
        perDanceResults.push(singleDance(danceMarkMap));
      }

      // Delete existing results for this round
      await db.delete(finalResults).where(eq(finalResults.roundId, input.roundId));
      await db.delete(tabulationTables).where(eq(tabulationTables.roundId, input.roundId));

      // Store per-dance results and tabulation
      for (let d = 0; d < danceNames.length; d++) {
        const danceName = danceNames[d]!;
        const danceResult = perDanceResults[d]!;

        for (const [coupleId, row] of Object.entries(danceResult.tabulation)) {
          await db.insert(finalResults).values({
            roundId: input.roundId,
            entryId: parseInt(coupleId),
            danceName,
            placement: row.placement,
            placementValue: String(row.pointValue),
          });

          await db.insert(tabulationTables).values({
            roundId: input.roundId,
            entryId: parseInt(coupleId),
            danceName,
            tableData: row.cells,
          });
        }
      }

      // If multi-dance, compute overall results
      if (danceNames.length > 1) {
        const multiResult = multiDance(perDanceResults, allDanceMarks);

        for (const [coupleId, placement] of Object.entries(multiResult.placements)) {
          await db.insert(finalResults).values({
            roundId: input.roundId,
            entryId: parseInt(coupleId),
            danceName: null, // null = overall
            placement,
            placementValue: String(placement),
            tiebreakRule: multiResult.tiebreakRules[coupleId] ?? null,
          });
        }

        // Store summary tabulation
        for (const [coupleId, dancePlacements] of Object.entries(multiResult.perDancePlacements)) {
          await db.insert(tabulationTables).values({
            roundId: input.roundId,
            entryId: parseInt(coupleId),
            danceName: null, // overall summary
            tableData: {
              danceValues: dancePlacements.map((d) => d.pointValue),
              total: multiResult.totals[coupleId],
              placement: multiResult.placements[coupleId],
              tiebreakRule: multiResult.tiebreakRules[coupleId],
            },
          });
        }
      }

      // Create/update results meta
      const existingMeta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, input.roundId),
      });
      if (existingMeta) {
        await db
          .update(roundResultsMeta)
          .set({ status: "computed", computedAt: new Date() })
          .where(eq(roundResultsMeta.id, existingMeta.id));
      } else {
        await db.insert(roundResultsMeta).values({
          roundId: input.roundId,
          status: "computed",
          computedAt: new Date(),
        });
      }

      return {
        dances: danceNames.length,
        couples: entryIds.length,
        isMultiDance: danceNames.length > 1,
      };
    }),

  // ── Results queries ────────────────────────────────────────────

  getResults: publicProcedure
    .input(z.object({ roundId: z.number() }))
    .query(async ({ input }) => {
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

  getCallbackResults: publicProcedure
    .input(z.object({ roundId: z.number() }))
    .query(async ({ input }) => {
      return db.query.callbackResults.findMany({
        where: eq(callbackResults.roundId, input.roundId),
      });
    }),

  // ── Results workflow ───────────────────────────────────────────

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
      await requireCompOrgRole(event!.competitionId, ctx.userId);

      const [updated] = await db
        .update(roundResultsMeta)
        .set({
          status: "published",
          publishedAt: new Date(),
        })
        .where(eq(roundResultsMeta.roundId, input.roundId))
        .returning();

      return updated;
    }),
});
