import { z } from "zod";
import { eq, sql, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  eventDances,
  scheduleBlocks,
  competitionStaff,
} from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";
import { generateDefaultEvents } from "@competitions/lib/default-events";
import type { DanceStyle } from "@competitions/lib/default-events";

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

export const eventRouter = router({
  listByCompetition: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const eventIds = events.map((e) => e.id);
      if (eventIds.length === 0) return [];

      const dances = await db.query.eventDances.findMany({
        where: sql`${eventDances.eventId} IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})`,
        orderBy: asc(eventDances.position),
      });

      return events.map((event) => ({
        ...event,
        dances: dances.filter((d) => d.eventId === event.id),
      }));
    }),

  getById: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) return null;

      const dances = await db.query.eventDances.findMany({
        where: eq(eventDances.eventId, event.id),
        orderBy: asc(eventDances.position),
      });

      return { ...event, dances };
    }),

  generateDefaults: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        styles: z.enum(["standard", "smooth", "latin", "rhythm", "nightclub"]).array().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      // Get sessions to assign events to matching sessions
      const blocks = await db.query.scheduleBlocks.findMany({
        where: sql`${scheduleBlocks.id} IN (
          SELECT sb.id FROM schedule_blocks sb
          JOIN competition_days cd ON cd.id = sb.day_id
          WHERE cd.competition_id = ${input.competitionId} AND sb.type = 'session'
        )`,
        orderBy: asc(scheduleBlocks.position),
      });

      const sessionByLabel = new Map(
        blocks.map((b) => [b.label.toLowerCase(), b.id]),
      );

      const generated = generateDefaultEvents(input.styles as DanceStyle[]);
      const created = [];

      for (let i = 0; i < generated.length; i++) {
        const g = generated[i]!;
        // Try to match event to a session by style name
        const sessionId = sessionByLabel.get(g.style) ?? null;

        const [event] = await db
          .insert(competitionEvents)
          .values({
            competitionId: input.competitionId,
            sessionId,
            name: g.name,
            style: g.style,
            level: g.level,
            eventType: g.eventType,
            position: i + 1,
          })
          .returning();

        // Insert dances for this event
        for (let j = 0; j < g.dances.length; j++) {
          await db.insert(eventDances).values({
            eventId: event.id,
            danceName: g.dances[j]!,
            position: j + 1,
          });
        }

        created.push(event);
      }

      return created;
    }),

  create: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        sessionId: z.number().nullable().optional(),
        name: z.string().min(1),
        style: z.enum(["standard", "smooth", "latin", "rhythm", "nightclub"]),
        level: z.enum([
          "newcomer",
          "bronze",
          "silver",
          "gold",
          "novice",
          "prechamp",
          "champ",
          "professional",
        ]),
        eventType: z.enum(["single_dance", "multi_dance"]),
        dances: z.string().array().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const maxPos = await db
        .select({ max: sql<number>`coalesce(max(${competitionEvents.position}), 0)` })
        .from(competitionEvents)
        .where(eq(competitionEvents.competitionId, input.competitionId));

      const [event] = await db
        .insert(competitionEvents)
        .values({
          competitionId: input.competitionId,
          sessionId: input.sessionId ?? null,
          name: input.name,
          style: input.style,
          level: input.level,
          eventType: input.eventType,
          position: (maxPos[0]?.max ?? 0) + 1,
        })
        .returning();

      for (let i = 0; i < input.dances.length; i++) {
        await db.insert(eventDances).values({
          eventId: event.id,
          danceName: input.dances[i]!,
          position: i + 1,
        });
      }

      const dances = await db.query.eventDances.findMany({
        where: eq(eventDances.eventId, event.id),
        orderBy: asc(eventDances.position),
      });

      return { ...event, dances };
    }),

  update: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        name: z.string().min(1).optional(),
        sessionId: z.number().nullable().optional(),
        maxFinalSize: z.number().min(1).nullable().optional(),
        maxHeatSize: z.number().min(1).nullable().optional(),
        position: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      const { eventId, ...updates } = input;
      const [updated] = await db
        .update(competitionEvents)
        .set(updates)
        .where(eq(competitionEvents.id, eventId))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      await db.delete(competitionEvents).where(eq(competitionEvents.id, input.eventId));
      return { success: true };
    }),

  reorderInSession: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        eventIds: z.number().array(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const block = await db.query.scheduleBlocks.findFirst({
        where: eq(scheduleBlocks.id, input.sessionId),
      });
      if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      const day = await db.query.competitionDays.findFirst({
        where: eq(competitionEvents.id, block.dayId),
      });
      if (!day) throw new TRPCError({ code: "NOT_FOUND", message: "Day not found" });

      await requireCompOrgRole(day.competitionId, ctx.userId);

      for (let i = 0; i < input.eventIds.length; i++) {
        await db
          .update(competitionEvents)
          .set({ position: i + 1 })
          .where(
            and(
              eq(competitionEvents.id, input.eventIds[i]!),
              eq(competitionEvents.sessionId, input.sessionId),
            ),
          );
      }

      return { success: true };
    }),

  updateDances: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        dances: z.string().array().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompOrgRole(event.competitionId, ctx.userId);

      // Delete existing dances and replace
      await db.delete(eventDances).where(eq(eventDances.eventId, input.eventId));

      for (let i = 0; i < input.dances.length; i++) {
        await db.insert(eventDances).values({
          eventId: input.eventId,
          danceName: input.dances[i]!,
          position: i + 1,
        });
      }

      const updatedDances = await db.query.eventDances.findMany({
        where: eq(eventDances.eventId, input.eventId),
        orderBy: asc(eventDances.position),
      });

      return { ...event, dances: updatedDances };
    }),
});
