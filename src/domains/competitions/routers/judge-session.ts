import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { compare } from "bcryptjs";
import { router, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionJudges,
  judges,
  judgeSessions,
  activeRounds,
  rounds,
  heats,
  heatAssignments,
  entries,
  callbackMarks,
  finalMarks,
  judgeSubmissions,
  competitionEvents,
  eventDances,
  markCorrections,
  competitionRegistrations,
} from "@competitions/schema";
import {
  createJudgeToken,
  requireJudgeAuth,
  hashToken,
} from "@competitions/lib/judge-auth";
import { createJudgeAblyToken } from "@competitions/lib/ably-comp";

export const judgeSessionRouter = router({
  // ── Authenticate ────────────────────────────────────────────────

  authenticate: publicProcedure
    .input(
      z.object({
        compCode: z.string(),
        masterPassword: z.string(),
        judgeId: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      // Find competition by code
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.compCode, input.compCode.toUpperCase()),
      });
      if (!comp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
      }
      if (!comp.masterPasswordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Master password not set for this competition" });
      }

      // Verify master password
      const valid = await compare(input.masterPassword, comp.masterPasswordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid master password" });
      }

      // Verify judge is assigned to this competition
      const assignment = await db.query.competitionJudges.findFirst({
        where: and(
          eq(competitionJudges.competitionId, comp.id),
          eq(competitionJudges.judgeId, input.judgeId),
        ),
      });
      if (!assignment) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Judge not assigned to this competition" });
      }

      // Get judge name
      const judge = await db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });

      // End any existing active session for this judge
      await db
        .update(judgeSessions)
        .set({ status: "ended", endedAt: new Date() })
        .where(
          and(
            eq(judgeSessions.competitionId, comp.id),
            eq(judgeSessions.judgeId, input.judgeId),
            eq(judgeSessions.status, "active"),
          ),
        );

      // Create JWT
      const tokenPayload = {
        competitionId: comp.id,
        judgeId: input.judgeId,
        sessionId: 0, // placeholder, updated after insert
      };

      // Create session row first to get ID
      const [session] = await db
        .insert(judgeSessions)
        .values({
          competitionId: comp.id,
          judgeId: input.judgeId,
          tokenHash: "pending", // updated below
        })
        .returning();

      // Now create the real token with session ID
      tokenPayload.sessionId = session!.id;
      const token = await createJudgeToken(tokenPayload);
      const hash = await hashToken(token);

      await db
        .update(judgeSessions)
        .set({ tokenHash: hash })
        .where(eq(judgeSessions.id, session!.id));

      return {
        token,
        judgeName: judge ? `${judge.firstName} ${judge.lastName}` : "Unknown",
        competitionName: comp.name,
        competitionId: comp.id,
        judgeId: input.judgeId,
      };
    }),

  // ── Logout ──────────────────────────────────────────────────────

  logout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const payload = await requireJudgeAuth(input.token);

      await db
        .update(judgeSessions)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(judgeSessions.id, payload.sessionId));

      return { success: true };
    }),

  // ── Get active round ────────────────────────────────────────────

  getActiveRound: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const payload = await requireJudgeAuth(input.token);

      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, payload.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });

      if (!active) return null;

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, active.roundId),
      });
      if (!round) return null;

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, round.eventId),
      });

      // Get dances for this event
      const dances = await db.query.eventDances.findMany({
        where: eq(eventDances.eventId, round.eventId),
      });

      // Get couple numbers for this round (from heat assignments or all entries)
      const roundHeats = await db.query.heats.findMany({
        where: eq(heats.roundId, round.id),
      });

      const coupleData: Array<{
        entryId: number;
        competitorNumber: number | null;
        heatNumber: number | null;
      }> = [];

      if (roundHeats.length > 0) {
        for (const heat of roundHeats) {
          const assignments = await db.query.heatAssignments.findMany({
            where: eq(heatAssignments.heatId, heat.id),
          });
          for (const a of assignments) {
            const entry = await db.query.entries.findFirst({
              where: eq(entries.id, a.entryId),
            });
            if (entry) {
              const leaderReg = await db.query.competitionRegistrations.findFirst({
                where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
              });
              coupleData.push({
                entryId: entry.id,
                competitorNumber: leaderReg?.competitorNumber ?? null,
                heatNumber: heat.heatNumber,
              });
            }
          }
        }
      } else {
        // No heats — get all entries for this event (final round)
        const eventEntries = await db.query.entries.findMany({
          where: and(eq(entries.eventId, round.eventId), eq(entries.scratched, false)),
        });
        for (const entry of eventEntries) {
          const leaderReg = await db.query.competitionRegistrations.findFirst({
            where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
          });
          coupleData.push({
            entryId: entry.id,
            competitorNumber: leaderReg?.competitorNumber ?? null,
            heatNumber: null,
          });
        }
      }

      // Get this judge's submission status
      const submission = await db.query.judgeSubmissions.findFirst({
        where: and(
          eq(judgeSubmissions.roundId, round.id),
          eq(judgeSubmissions.judgeId, payload.judgeId),
        ),
      });

      return {
        roundId: round.id,
        eventName: event?.name ?? "Unknown Event",
        eventStyle: event?.style,
        roundType: round.roundType,
        callbacksRequested: round.callbacksRequested,
        dances: dances.map((d) => d.danceName),
        couples: coupleData,
        submissionStatus: submission?.status ?? "pending",
        isFinal: round.roundType === "final",
      };
    }),

  // ── Get my submission (for edit flow) ───────────────────────────

  getMySubmission: publicProcedure
    .input(z.object({ token: z.string(), roundId: z.number() }))
    .query(async ({ input }) => {
      const payload = await requireJudgeAuth(input.token);

      const round = await db.query.rounds.findFirst({
        where: eq(rounds.id, input.roundId),
      });
      if (!round) throw new TRPCError({ code: "NOT_FOUND", message: "Round not found" });

      const submission = await db.query.judgeSubmissions.findFirst({
        where: and(
          eq(judgeSubmissions.roundId, input.roundId),
          eq(judgeSubmissions.judgeId, payload.judgeId),
        ),
      });

      if (round.roundType === "final") {
        const marks = await db.query.finalMarks.findMany({
          where: and(
            eq(finalMarks.roundId, input.roundId),
            eq(finalMarks.judgeId, payload.judgeId),
          ),
        });
        return {
          type: "final" as const,
          status: submission?.status ?? "pending",
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
            eq(callbackMarks.judgeId, payload.judgeId),
          ),
        });
        return {
          type: "callback" as const,
          status: submission?.status ?? "pending",
          marks: marks.map((m) => ({
            entryId: m.entryId,
            marked: m.marked,
          })),
        };
      }
    }),

  // ── Submit callback marks ───────────────────────────────────────

  submitCallbackMarks: publicProcedure
    .input(
      z.object({
        token: z.string(),
        roundId: z.number(),
        marks: z.array(z.object({
          entryId: z.number(),
          marked: z.boolean(),
        })),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = await requireJudgeAuth(input.token);

      // Verify this is the active round
      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, payload.competitionId),
          eq(activeRounds.roundId, input.roundId),
        ),
      });
      if (!active || active.endedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This round is not currently active" });
      }

      // Check for existing marks (re-submit = correction)
      const existingMarks = await db.query.callbackMarks.findMany({
        where: and(
          eq(callbackMarks.roundId, input.roundId),
          eq(callbackMarks.judgeId, payload.judgeId),
        ),
      });
      const existingMap = new Map(existingMarks.map((m) => [m.entryId, m.marked]));
      const isResubmit = existingMarks.length > 0;

      // Upsert marks
      for (const mark of input.marks) {
        const existing = existingMarks.find((m) => m.entryId === mark.entryId);
        if (existing) {
          if (existing.marked !== mark.marked) {
            // Record correction if value changed
            if (isResubmit) {
              await db.insert(markCorrections).values({
                roundId: input.roundId,
                judgeId: payload.judgeId,
                entryId: mark.entryId,
                oldValue: String(existing.marked),
                newValue: String(mark.marked),
                source: "judge",
              });
            }
            await db
              .update(callbackMarks)
              .set({ marked: mark.marked })
              .where(eq(callbackMarks.id, existing.id));
          }
        } else {
          await db.insert(callbackMarks).values({
            roundId: input.roundId,
            judgeId: payload.judgeId,
            entryId: mark.entryId,
            marked: mark.marked,
          });
        }
      }

      // Update submission status
      const existingSub = await db.query.judgeSubmissions.findFirst({
        where: and(
          eq(judgeSubmissions.roundId, input.roundId),
          eq(judgeSubmissions.judgeId, payload.judgeId),
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
          judgeId: payload.judgeId,
          status: "submitted",
          submittedAt: new Date(),
        });
      }

      // Ably publish (best-effort, don't fail if Ably is unavailable)
      try {
        const { publishToJudging } = await import("@competitions/lib/ably-comp");
        // Publishing to submissions channel would be done client-side by the judge tablet
      } catch {
        // Ably not available (e.g., in tests)
      }

      return { submitted: input.marks.length };
    }),

  // ── Submit final marks ──────────────────────────────────────────

  submitFinalMarks: publicProcedure
    .input(
      z.object({
        token: z.string(),
        roundId: z.number(),
        marks: z.array(z.object({
          entryId: z.number(),
          danceName: z.string(),
          placement: z.number().min(1),
        })),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = await requireJudgeAuth(input.token);

      // Verify this is the active round
      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, payload.competitionId),
          eq(activeRounds.roundId, input.roundId),
        ),
      });
      if (!active || active.endedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This round is not currently active" });
      }

      // Check for existing marks (re-submit = correction)
      const existingMarks = await db.query.finalMarks.findMany({
        where: and(
          eq(finalMarks.roundId, input.roundId),
          eq(finalMarks.judgeId, payload.judgeId),
        ),
      });
      const isResubmit = existingMarks.length > 0;

      if (isResubmit) {
        // Record corrections for changed marks
        for (const mark of input.marks) {
          const existing = existingMarks.find(
            (m) => m.entryId === mark.entryId && m.danceName === mark.danceName,
          );
          if (existing && existing.placement !== mark.placement) {
            await db.insert(markCorrections).values({
              roundId: input.roundId,
              judgeId: payload.judgeId,
              entryId: mark.entryId,
              danceName: mark.danceName,
              oldValue: String(existing.placement),
              newValue: String(mark.placement),
              source: "judge",
            });
          }
        }
      }

      // Delete-then-insert to avoid unique constraint issues
      const danceNames = [...new Set(input.marks.map((m) => m.danceName))];
      for (const danceName of danceNames) {
        await db
          .delete(finalMarks)
          .where(
            and(
              eq(finalMarks.roundId, input.roundId),
              eq(finalMarks.judgeId, payload.judgeId),
              eq(finalMarks.danceName, danceName),
            ),
          );
      }

      for (const mark of input.marks) {
        await db.insert(finalMarks).values({
          roundId: input.roundId,
          judgeId: payload.judgeId,
          entryId: mark.entryId,
          danceName: mark.danceName,
          placement: mark.placement,
        });
      }

      // Update submission status
      const existingSub = await db.query.judgeSubmissions.findFirst({
        where: and(
          eq(judgeSubmissions.roundId, input.roundId),
          eq(judgeSubmissions.judgeId, payload.judgeId),
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
          judgeId: payload.judgeId,
          status: "submitted",
          submittedAt: new Date(),
        });
      }

      return { submitted: input.marks.length };
    }),

  // ── Get Ably token ──────────────────────────────────────────────

  getAblyToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const payload = await requireJudgeAuth(input.token);
      return createJudgeAblyToken(payload.competitionId, payload.judgeId);
    }),
});
