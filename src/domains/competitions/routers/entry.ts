import { z } from "zod";
import { eq, and, sql, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  competitionRegistrations,
  entries,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

async function recalcAmountOwed(registrationId: number) {
  const reg = await db.query.competitionRegistrations.findFirst({
    where: eq(competitionRegistrations.id, registrationId),
  });
  if (!reg) return;

  const comp = await db.query.competitions.findFirst({
    where: eq(competitions.id, reg.competitionId),
  });
  if (!comp || comp.pricingModel !== "per_event") return;

  // Sum entry prices for all events this person is in
  const result = await db.execute(sql`
    SELECT coalesce(sum(ce.entry_price), 0) as entry_total
    FROM entries e
    JOIN competition_events ce ON ce.id = e.event_id
    WHERE (e.leader_registration_id = ${registrationId} OR e.follower_registration_id = ${registrationId})
      AND e.scratched = false
  `);

  const entryTotal = parseFloat((result.rows[0] as { entry_total: string }).entry_total);
  const baseFee = parseFloat(comp.baseFee ?? "0");

  await db
    .update(competitionRegistrations)
    .set({ amountOwed: (baseFee + entryTotal).toFixed(2) })
    .where(eq(competitionRegistrations.id, registrationId));
}

export const entryRouter = router({
  listByEvent: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const results = await db
        .select({
          id: entries.id,
          eventId: entries.eventId,
          scratched: entries.scratched,
          leaderRegistrationId: entries.leaderRegistrationId,
          followerRegistrationId: entries.followerRegistrationId,
          leaderNumber: sql<number | null>`lr.competitor_number`,
          leaderName: sql<string>`lu.display_name`,
          followerName: sql<string>`fu.display_name`,
          leaderOrgName: sql<string | null>`lo.name`,
        })
        .from(entries)
        .innerJoin(
          sql`competition_registrations lr`,
          sql`lr.id = ${entries.leaderRegistrationId}`,
        )
        .innerJoin(sql`users lu`, sql`lu.id = lr.user_id`)
        .innerJoin(
          sql`competition_registrations fr`,
          sql`fr.id = ${entries.followerRegistrationId}`,
        )
        .innerJoin(sql`users fu`, sql`fu.id = fr.user_id`)
        .leftJoin(sql`organizations lo`, sql`lo.id = lr.org_id`)
        .where(eq(entries.eventId, input.eventId))
        .orderBy(sql`lr.competitor_number`);

      return results;
    }),

  listByRegistration: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      // User can view their own or staff can view any
      if (reg.userId !== ctx.userId) {
        await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);
      }

      const entryList = await db
        .select({
          id: entries.id,
          eventId: entries.eventId,
          eventName: competitionEvents.name,
          eventStyle: competitionEvents.style,
          eventLevel: competitionEvents.level,
          scratched: entries.scratched,
          leaderRegistrationId: entries.leaderRegistrationId,
          followerRegistrationId: entries.followerRegistrationId,
        })
        .from(entries)
        .innerJoin(competitionEvents, eq(competitionEvents.id, entries.eventId))
        .where(
          sql`${entries.leaderRegistrationId} = ${input.registrationId}
              OR ${entries.followerRegistrationId} = ${input.registrationId}`,
        )
        .orderBy(asc(competitionEvents.position));

      return entryList;
    }),

  listByCompetition: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const events = await db.query.competitionEvents.findMany({
        where: eq(competitionEvents.competitionId, input.competitionId),
        orderBy: asc(competitionEvents.position),
      });

      const eventIds = events.map((e) => e.id);
      if (eventIds.length === 0) return [];

      const allEntries = await db
        .select({
          id: entries.id,
          eventId: entries.eventId,
          scratched: entries.scratched,
          leaderNumber: sql<number | null>`lr.competitor_number`,
          leaderName: sql<string>`lu.display_name`,
          followerName: sql<string>`fu.display_name`,
        })
        .from(entries)
        .innerJoin(
          sql`competition_registrations lr`,
          sql`lr.id = ${entries.leaderRegistrationId}`,
        )
        .innerJoin(sql`users lu`, sql`lu.id = lr.user_id`)
        .innerJoin(
          sql`competition_registrations fr`,
          sql`fr.id = ${entries.followerRegistrationId}`,
        )
        .innerJoin(sql`users fu`, sql`fu.id = fr.user_id`)
        .where(
          sql`${entries.eventId} IN (${sql.join(eventIds.map((id) => sql`${id}`), sql`, `)})`,
        );

      return events.map((event) => ({
        ...event,
        entries: allEntries.filter((e) => e.eventId === event.id),
      }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        eventId: z.number(),
        leaderRegistrationId: z.number(),
        followerRegistrationId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, event.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      if (comp.status !== "accepting_entries") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Competition is not accepting entries",
        });
      }

      // Validate both registrations exist and belong to this competition
      const leaderReg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.id, input.leaderRegistrationId),
          eq(competitionRegistrations.competitionId, event.competitionId),
        ),
      });
      const followerReg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.id, input.followerRegistrationId),
          eq(competitionRegistrations.competitionId, event.competitionId),
        ),
      });

      if (!leaderReg || !followerReg) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Both registrations must belong to this competition",
        });
      }

      // Check the user is one of the couple or staff
      const isParticipant = leaderReg.userId === ctx.userId || followerReg.userId === ctx.userId;
      if (!isParticipant) {
        await requireCompStaffRole(event.competitionId, ctx.userId, ["registration"]);
      }

      // Check for duplicate
      const existing = await db.query.entries.findFirst({
        where: and(
          eq(entries.eventId, input.eventId),
          eq(entries.leaderRegistrationId, input.leaderRegistrationId),
          eq(entries.followerRegistrationId, input.followerRegistrationId),
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Entry already exists" });
      }

      const [entry] = await db
        .insert(entries)
        .values({
          eventId: input.eventId,
          leaderRegistrationId: input.leaderRegistrationId,
          followerRegistrationId: input.followerRegistrationId,
          createdBy: ctx.userId,
        })
        .returning();

      // Recalculate amount owed if per-event pricing
      if (comp.pricingModel === "per_event") {
        await recalcAmountOwed(input.leaderRegistrationId);
        await recalcAmountOwed(input.followerRegistrationId);
      }

      return entry;
    }),

  remove: protectedProcedure
    .input(z.object({ entryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await db.query.entries.findFirst({
        where: eq(entries.id, input.entryId),
      });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, entry.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      // Check the user is one of the couple or staff
      const leaderReg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, entry.leaderRegistrationId),
      });
      const followerReg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, entry.followerRegistrationId),
      });

      const isParticipant =
        leaderReg?.userId === ctx.userId || followerReg?.userId === ctx.userId;
      if (!isParticipant) {
        await requireCompStaffRole(event.competitionId, ctx.userId, ["registration"]);
      }

      await db.delete(entries).where(eq(entries.id, input.entryId));

      // Recalculate amount owed if per-event pricing
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, event.competitionId),
      });
      if (comp?.pricingModel === "per_event") {
        await recalcAmountOwed(entry.leaderRegistrationId);
        await recalcAmountOwed(entry.followerRegistrationId);
      }

      return { success: true };
    }),

  scratch: protectedProcedure
    .input(z.object({ entryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await db.query.entries.findFirst({
        where: eq(entries.id, input.entryId),
      });
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });

      const event = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, entry.eventId),
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      await requireCompStaffRole(event.competitionId, ctx.userId, ["deck_captain"]);

      const [updated] = await db
        .update(entries)
        .set({ scratched: !entry.scratched })
        .where(eq(entries.id, input.entryId))
        .returning();

      return updated;
    }),

  bulkCreate: protectedProcedure
    .input(
      z.object({
        eventIds: z.number().array().min(1),
        leaderRegistrationId: z.number(),
        followerRegistrationId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate the first event to get competition context
      const firstEvent = await db.query.competitionEvents.findFirst({
        where: eq(competitionEvents.id, input.eventIds[0]!),
      });
      if (!firstEvent) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, firstEvent.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      if (comp.status !== "accepting_entries") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Competition is not accepting entries",
        });
      }

      // Validate registrations
      const leaderReg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.id, input.leaderRegistrationId),
          eq(competitionRegistrations.competitionId, comp.id),
        ),
      });
      const followerReg = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.id, input.followerRegistrationId),
          eq(competitionRegistrations.competitionId, comp.id),
        ),
      });

      if (!leaderReg || !followerReg) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Both registrations must belong to this competition",
        });
      }

      const isParticipant = leaderReg.userId === ctx.userId || followerReg.userId === ctx.userId;
      if (!isParticipant) {
        await requireCompStaffRole(comp.id, ctx.userId, ["registration"]);
      }

      const created = [];
      for (const eventId of input.eventIds) {
        // Skip duplicates silently
        const existing = await db.query.entries.findFirst({
          where: and(
            eq(entries.eventId, eventId),
            eq(entries.leaderRegistrationId, input.leaderRegistrationId),
            eq(entries.followerRegistrationId, input.followerRegistrationId),
          ),
        });
        if (existing) {
          created.push(existing);
          continue;
        }

        const [entry] = await db
          .insert(entries)
          .values({
            eventId,
            leaderRegistrationId: input.leaderRegistrationId,
            followerRegistrationId: input.followerRegistrationId,
            createdBy: ctx.userId,
          })
          .returning();
        created.push(entry);
      }

      if (comp.pricingModel === "per_event") {
        await recalcAmountOwed(input.leaderRegistrationId);
        await recalcAmountOwed(input.followerRegistrationId);
      }

      return created;
    }),
});
