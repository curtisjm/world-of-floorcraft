import { z } from "zod";
import { eq, sql, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionDays,
  scheduleBlocks,
  competitionEvents,
} from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";
import { competitionStaff } from "@competitions/schema";

async function requireCompOrgRole(competitionId: number, userId: string) {
  const comp = await db.query.competitions.findFirst({
    where: eq(competitions.id, competitionId),
  });
  if (!comp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, comp.orgId),
  });
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, comp.orgId), eq(memberships.userId, userId)),
  });

  const isOwner = org?.ownerId === userId;
  const isAdmin = membership?.role === "admin";
  if (isOwner || isAdmin) return comp;

  const staff = await db.query.competitionStaff.findFirst({
    where: and(
      eq(competitionStaff.competitionId, competitionId),
      eq(competitionStaff.userId, userId),
      eq(competitionStaff.role, "scrutineer"),
    ),
  });
  if (staff) return comp;

  throw new TRPCError({ code: "FORBIDDEN", message: "Org admin/owner or scrutineer required" });
}

const DEFAULT_SESSIONS = [
  "Smooth",
  "Standard",
  "Latin",
  "Rhythm",
  "Nightclub",
  "Open Events",
];

export const scheduleRouter = router({
  getDays: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, input.competitionId),
        orderBy: asc(competitionDays.position),
      });

      const dayIds = days.map((d) => d.id);
      if (dayIds.length === 0) return days.map((d) => ({ ...d, blocks: [] as typeof blocks }));

      const blocks = await db.query.scheduleBlocks.findMany({
        where: sql`${scheduleBlocks.dayId} IN (${sql.join(dayIds.map((id) => sql`${id}`), sql`, `)})`,
        orderBy: asc(scheduleBlocks.position),
      });

      return days.map((day) => ({
        ...day,
        blocks: blocks.filter((b) => b.dayId === day.id),
      }));
    }),

  getSchedule: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, input.competitionId),
        orderBy: asc(competitionDays.position),
      });

      const dayIds = days.map((d) => d.id);
      if (dayIds.length === 0) return [];

      const blocks = await db.query.scheduleBlocks.findMany({
        where: sql`${scheduleBlocks.dayId} IN (${sql.join(dayIds.map((id) => sql`${id}`), sql`, `)})`,
        orderBy: asc(scheduleBlocks.position),
      });

      const blockIds = blocks.filter((b) => b.type === "session").map((b) => b.id);
      const events =
        blockIds.length > 0
          ? await db.query.competitionEvents.findMany({
              where: sql`${competitionEvents.sessionId} IN (${sql.join(blockIds.map((id) => sql`${id}`), sql`, `)})`,
              orderBy: asc(competitionEvents.position),
            })
          : [];

      return days.map((day) => ({
        ...day,
        blocks: blocks
          .filter((b) => b.dayId === day.id)
          .map((block) => ({
            ...block,
            events: block.type === "session" ? events.filter((e) => e.sessionId === block.id) : [],
          })),
      }));
    }),

  addDay: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        date: z.string(),
        label: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const maxPos = await db
        .select({ max: sql<number>`coalesce(max(${competitionDays.position}), 0)` })
        .from(competitionDays)
        .where(eq(competitionDays.competitionId, input.competitionId));

      const [day] = await db
        .insert(competitionDays)
        .values({
          competitionId: input.competitionId,
          date: input.date,
          label: input.label,
          position: (maxPos[0]?.max ?? 0) + 1,
        })
        .returning();

      return day;
    }),

  updateDay: protectedProcedure
    .input(
      z.object({
        dayId: z.number(),
        date: z.string().optional(),
        label: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionDays.id, input.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      const { dayId, ...updates } = input;
      const [updated] = await db
        .update(competitionDays)
        .set(updates)
        .where(eq(competitionDays.id, dayId))
        .returning();

      return updated;
    }),

  removeDay: protectedProcedure
    .input(z.object({ dayId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionDays.id, input.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      await db.delete(competitionDays).where(eq(competitionDays.id, input.dayId));
      return { success: true };
    }),

  reorderDays: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        dayIds: z.number().array(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      // Two-pass to avoid unique constraint violations during reorder
      for (let i = 0; i < input.dayIds.length; i++) {
        await db
          .update(competitionDays)
          .set({ position: -(i + 1) })
          .where(
            and(
              eq(competitionDays.id, input.dayIds[i]!),
              eq(competitionDays.competitionId, input.competitionId),
            ),
          );
      }
      for (let i = 0; i < input.dayIds.length; i++) {
        await db
          .update(competitionDays)
          .set({ position: i + 1 })
          .where(
            and(
              eq(competitionDays.id, input.dayIds[i]!),
              eq(competitionDays.competitionId, input.competitionId),
            ),
          );
      }

      return { success: true };
    }),

  addBlock: protectedProcedure
    .input(
      z.object({
        dayId: z.number(),
        type: z.enum(["session", "break"]),
        label: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionDays.id, input.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      const maxPos = await db
        .select({ max: sql<number>`coalesce(max(${scheduleBlocks.position}), 0)` })
        .from(scheduleBlocks)
        .where(eq(scheduleBlocks.dayId, input.dayId));

      const [block] = await db
        .insert(scheduleBlocks)
        .values({
          dayId: input.dayId,
          type: input.type,
          label: input.label,
          position: (maxPos[0]?.max ?? 0) + 1,
        })
        .returning();

      return block;
    }),

  updateBlock: protectedProcedure
    .input(
      z.object({
        blockId: z.number(),
        label: z.string().min(1).optional(),
        type: z.enum(["session", "break"]).optional(),
        estimatedStartTime: z.string().datetime().nullable().optional(),
        estimatedEndTime: z.string().datetime().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const block = await db.query.scheduleBlocks.findFirst({
        where: eq(scheduleBlocks.id, input.blockId),
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });

      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionDays.id, block.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      const { blockId, estimatedStartTime, estimatedEndTime, ...rest } = input;
      const updates: Record<string, unknown> = { ...rest };
      if (estimatedStartTime !== undefined)
        updates.estimatedStartTime = estimatedStartTime ? new Date(estimatedStartTime) : null;
      if (estimatedEndTime !== undefined)
        updates.estimatedEndTime = estimatedEndTime ? new Date(estimatedEndTime) : null;

      const [updated] = await db
        .update(scheduleBlocks)
        .set(updates)
        .where(eq(scheduleBlocks.id, blockId))
        .returning();

      return updated;
    }),

  removeBlock: protectedProcedure
    .input(z.object({ blockId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const block = await db.query.scheduleBlocks.findFirst({
        where: eq(scheduleBlocks.id, input.blockId),
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Block not found" });

      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionDays.id, block.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      // Unlink events from this session before deleting
      await db
        .update(competitionEvents)
        .set({ sessionId: null })
        .where(eq(competitionEvents.sessionId, input.blockId));

      await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, input.blockId));
      return { success: true };
    }),

  reorderBlocks: protectedProcedure
    .input(
      z.object({
        dayId: z.number(),
        blockIds: z.number().array(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionDays.id, input.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      // Two-pass to avoid unique constraint violations during reorder
      for (let i = 0; i < input.blockIds.length; i++) {
        await db
          .update(scheduleBlocks)
          .set({ position: -(i + 1) })
          .where(
            and(
              eq(scheduleBlocks.id, input.blockIds[i]!),
              eq(scheduleBlocks.dayId, input.dayId),
            ),
          );
      }
      for (let i = 0; i < input.blockIds.length; i++) {
        await db
          .update(scheduleBlocks)
          .set({ position: i + 1 })
          .where(
            and(
              eq(scheduleBlocks.id, input.blockIds[i]!),
              eq(scheduleBlocks.dayId, input.dayId),
            ),
          );
      }

      return { success: true };
    }),

  applyDefaultTemplate: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        date: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      // Create a single day
      const [day] = await db
        .insert(competitionDays)
        .values({
          competitionId: input.competitionId,
          date: input.date,
          label: "Day 1",
          position: 1,
        })
        .returning();

      // Create default sessions
      const blocks = [];
      for (let i = 0; i < DEFAULT_SESSIONS.length; i++) {
        const [block] = await db
          .insert(scheduleBlocks)
          .values({
            dayId: day.id,
            type: "session",
            label: DEFAULT_SESSIONS[i]!,
            position: i + 1,
          })
          .returning();
        blocks.push(block);
      }

      return { day, blocks };
    }),
});
