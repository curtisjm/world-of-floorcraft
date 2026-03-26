import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/db";
import { routines, routineEntries, figures } from "@/db/schema";

export const routineRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(routines)
      .where(eq(routines.userId, ctx.userId))
      .orderBy(asc(routines.createdAt));
  }),

  listByDance: protectedProcedure
    .input(z.object({ danceId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(routines)
        .where(
          and(
            eq(routines.userId, ctx.userId),
            eq(routines.danceId, input.danceId)
          )
        )
        .orderBy(asc(routines.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [routine] = await db
        .select()
        .from(routines)
        .where(
          and(eq(routines.id, input.id), eq(routines.userId, ctx.userId))
        );

      if (!routine) return null;

      const entries = await db
        .select({
          id: routineEntries.id,
          figureId: routineEntries.figureId,
          position: routineEntries.position,
          wallSegment: routineEntries.wallSegment,
          notes: routineEntries.notes,
          figureName: figures.name,
          figureVariantName: figures.variantName,
          figureLevel: figures.level,
          figureNumber: figures.figureNumber,
        })
        .from(routineEntries)
        .innerJoin(figures, eq(routineEntries.figureId, figures.id))
        .where(eq(routineEntries.routineId, input.id))
        .orderBy(asc(routineEntries.position));

      return { ...routine, entries };
    }),

  create: protectedProcedure
    .input(
      z.object({
        danceId: z.number(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [routine] = await db
        .insert(routines)
        .values({
          ...input,
          userId: ctx.userId,
        })
        .returning();
      return routine;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [routine] = await db
        .update(routines)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(routines.id, id), eq(routines.userId, ctx.userId)))
        .returning();
      return routine ?? null;
    }),

  addEntry: protectedProcedure
    .input(
      z.object({
        routineId: z.number(),
        figureId: z.number(),
        position: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const [routine] = await db
        .select({ id: routines.id })
        .from(routines)
        .where(
          and(
            eq(routines.id, input.routineId),
            eq(routines.userId, ctx.userId)
          )
        );
      if (!routine) return null;

      // Shift existing entries at or after this position
      await db
        .update(routineEntries)
        .set({ position: sql`${routineEntries.position} + 1` })
        .where(
          and(
            eq(routineEntries.routineId, input.routineId),
            sql`${routineEntries.position} >= ${input.position}`
          )
        );

      const [entry] = await db
        .insert(routineEntries)
        .values({
          routineId: input.routineId,
          figureId: input.figureId,
          position: input.position,
        })
        .returning();

      // Update routine timestamp
      await db
        .update(routines)
        .set({ updatedAt: new Date() })
        .where(eq(routines.id, input.routineId));

      return entry;
    }),

  removeEntry: protectedProcedure
    .input(z.object({ routineId: z.number(), entryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const [routine] = await db
        .select({ id: routines.id })
        .from(routines)
        .where(
          and(
            eq(routines.id, input.routineId),
            eq(routines.userId, ctx.userId)
          )
        );
      if (!routine) return { success: false };

      // Get the position of the entry being removed
      const [entry] = await db
        .select({ position: routineEntries.position })
        .from(routineEntries)
        .where(
          and(
            eq(routineEntries.id, input.entryId),
            eq(routineEntries.routineId, input.routineId)
          )
        );
      if (!entry) return { success: false };

      await db
        .delete(routineEntries)
        .where(eq(routineEntries.id, input.entryId));

      // Shift down entries after the removed one
      await db
        .update(routineEntries)
        .set({ position: sql`${routineEntries.position} - 1` })
        .where(
          and(
            eq(routineEntries.routineId, input.routineId),
            sql`${routineEntries.position} > ${entry.position}`
          )
        );

      await db
        .update(routines)
        .set({ updatedAt: new Date() })
        .where(eq(routines.id, input.routineId));

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [routine] = await db
        .select({ id: routines.id })
        .from(routines)
        .where(
          and(eq(routines.id, input.id), eq(routines.userId, ctx.userId))
        );

      if (!routine) {
        return { success: false };
      }

      await db
        .delete(routineEntries)
        .where(eq(routineEntries.routineId, input.id));
      await db.delete(routines).where(eq(routines.id, input.id));
      return { success: true };
    }),
});
