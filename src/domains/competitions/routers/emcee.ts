import { z } from "zod";
import { eq, and, asc, desc, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitionEvents,
  competitionDays,
  scheduleBlocks,
  rounds,
  activeRounds,
  announcementNotes,
  roundResultsMeta,
  finalResults,
  entries,
  competitionRegistrations,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

export const emceeRouter = router({
  getEmceeView: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["emcee"]);

      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, input.competitionId),
        orderBy: asc(competitionDays.position),
      });

      const dayIds = days.map((d) => d.id);
      const blocks =
        dayIds.length > 0
          ? await db.query.scheduleBlocks.findMany({
              where: inArray(scheduleBlocks.dayId, dayIds),
              orderBy: asc(scheduleBlocks.position),
            })
          : [];

      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      // Get current active round
      const active = await db.query.activeRounds.findFirst({
        where: and(
          eq(activeRounds.competitionId, input.competitionId),
          isNull(activeRounds.endedAt),
        ),
      });

      let currentEvent = null;
      if (active) {
        const round = await db.query.rounds.findFirst({
          where: eq(rounds.id, active.roundId),
        });
        if (round) {
          const event = await db.query.competitionEvents.findFirst({
            where: eq(competitionEvents.id, round.eventId),
          });
          currentEvent = {
            eventId: event?.id,
            eventName: event?.name,
            roundType: round.roundType,
            roundId: round.id,
          };
        }
      }

      // Get all announcement notes
      const notes = await db.query.announcementNotes.findMany({
        where: eq(announcementNotes.competitionId, input.competitionId),
        orderBy: asc(announcementNotes.createdAt),
      });

      return { days, blocks, events, currentEvent, notes };
    }),

  getEventResults: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompStaffRole(event.competitionId, ctx.userId, ["emcee"]);

      // Find the final round with published results
      const eventRounds = await db.query.rounds.findMany({
        where: eq(rounds.eventId, input.eventId),
        orderBy: desc(rounds.position),
      });

      const finalRound = eventRounds.find((r) => r.roundType === "final");
      if (!finalRound) return { results: [], eventName: event.name };

      const meta = await db.query.roundResultsMeta.findFirst({
        where: eq(roundResultsMeta.roundId, finalRound.id),
      });
      if (!meta || meta.status !== "published") {
        return { results: [], eventName: event.name, status: meta?.status ?? "none" };
      }

      // Get final results (overall placements, not per-dance)
      const results = await db.query.finalResults.findMany({
        where: and(
          eq(finalResults.roundId, finalRound.id),
          isNull(finalResults.danceName),
        ),
        orderBy: asc(finalResults.placement),
      });

      // If no overall results (single dance event), get the dance-specific results
      const actualResults =
        results.length > 0
          ? results
          : await db.query.finalResults.findMany({
              where: eq(finalResults.roundId, finalRound.id),
              orderBy: asc(finalResults.placement),
            });

      // Enrich with couple names and numbers
      const enriched = await Promise.all(
        actualResults.map(async (r) => {
          const entry = await db.query.entries.findFirst({
            where: eq(entries.id, r.entryId),
          });
          if (!entry) return { ...r, coupleNumber: null, leaderName: "Unknown", followerName: "Unknown" };

          const leaderReg = await db.query.competitionRegistrations.findFirst({
            where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
          });
          const followerReg = await db.query.competitionRegistrations.findFirst({
            where: eq(competitionRegistrations.id, entry.followerRegistrationId),
          });

          const leader = leaderReg
            ? await db.query.users.findFirst({ where: eq(users.id, leaderReg.userId) })
            : null;
          const follower = followerReg
            ? await db.query.users.findFirst({ where: eq(users.id, followerReg.userId) })
            : null;

          return {
            ...r,
            coupleNumber: leaderReg?.competitorNumber ?? followerReg?.competitorNumber,
            leaderName: leader?.displayName ?? "Unknown",
            followerName: follower?.displayName ?? "Unknown",
          };
        }),
      );

      return { results: enriched, eventName: event.name, status: "published" };
    }),

  createNote: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        dayId: z.number(),
        positionAfterEventId: z.number().nullable().optional(),
        content: z.string().min(1),
        visibleOnProjector: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const comp = await requireCompStaffRole(input.competitionId, ctx.userId, ["emcee"]);

      const [note] = await db
        .insert(announcementNotes)
        .values({
          competitionId: input.competitionId,
          dayId: input.dayId,
          positionAfterEventId: input.positionAfterEventId ?? null,
          content: input.content,
          createdBy: ctx.userId,
          visibleOnProjector: input.visibleOnProjector,
        })
        .returning();

      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "announcement:created", {
          noteId: note!.id,
          content: note!.content,
          positionAfterEventId: note!.positionAfterEventId,
        });
      } catch {
        // Ably not available
      }

      return note;
    }),

  updateNote: protectedProcedure
    .input(
      z.object({
        noteId: z.number(),
        content: z.string().min(1).optional(),
        visibleOnProjector: z.boolean().optional(),
        positionAfterEventId: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const note = await db.query.announcementNotes.findFirst({
        where: eq(announcementNotes.id, input.noteId),
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

      const comp = await requireCompStaffRole(note.competitionId, ctx.userId, ["emcee"]);

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.content !== undefined) updates.content = input.content;
      if (input.visibleOnProjector !== undefined) updates.visibleOnProjector = input.visibleOnProjector;
      if (input.positionAfterEventId !== undefined) updates.positionAfterEventId = input.positionAfterEventId;

      const [updated] = await db
        .update(announcementNotes)
        .set(updates)
        .where(eq(announcementNotes.id, input.noteId))
        .returning();

      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "announcement:updated", {
          noteId: updated!.id,
          content: updated!.content,
        });
      } catch {
        // Ably not available
      }

      return updated;
    }),

  deleteNote: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const note = await db.query.announcementNotes.findFirst({
        where: eq(announcementNotes.id, input.noteId),
      });
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });

      const comp = await requireCompStaffRole(note.competitionId, ctx.userId, ["emcee"]);

      await db.delete(announcementNotes).where(eq(announcementNotes.id, input.noteId));

      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "announcement:deleted", { noteId: input.noteId });
      } catch {
        // Ably not available
      }

      return { deleted: true };
    }),
});
